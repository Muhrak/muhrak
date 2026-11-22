import {
  GCC_COUNTRY_NAMES,
  ORDER_LIMITS,
  type DeliveryAddressInput,
  type GccCountry,
  type Order,
  type OrderCreateInput,
  type OrderListQuery,
  type OrderListResponse,
  type OrderStatus,
  type PaymentStatus,
} from "../../schemas";
import type { OrderRow } from "../../db/schema";
import { env } from "../../config/env";
import { badRequest, conflict, notFound } from "../../shared/errors";
import { logger } from "../../shared/logger";
import { getUsersByIds } from "../auth";
import { acceptQuoteForOrder, getQuoteForOrder, getQuoteReferences, releaseQuoteForOrder } from "../quotation";
import { lockRfqForOrder } from "../rfq";
import * as repo from "./order.repository";

/**
 * Orders (Day 12, 22 Nov 2026): the buyer confirms a valid quotation and pays
 * Muhrak; Muhrak pays the seller after delivery (payment rules, docs/PLAN.md).
 *
 * Rules:
 * - Only the quotation's own buyer can order it, only while it is active and
 *   still valid, and only one live order per quotation (unique index too).
 *   Confirming locks the request row, as sending a quotation does, so an
 *   order and a revised quotation happen one after the other.
 * - Amounts are copied from the quotation on the server; Muhrak's fee is
 *   PLATFORM_FEE_BP of the items subtotal (half up), taken from the seller's
 *   share. The client never sends an amount.
 * - The same form key returns the first order (double submit).
 * - Status changes follow ORDER_TRANSITIONS only, as conditional updates,
 *   each with a row in order_events (append-only).
 * - Only the payment webhook marks an order paid (markOrderPaid, called by
 *   the payment module in its transaction).
 * - The seller sees the delivery address only once the order is paid.
 * - Orders are never deleted.
 */

const NOT_FOUND = "Order not found";
const QUOTE_NOT_FOUND = "Quotation not found";
const HOUR_MS = 3_600_000;

/** The one place that says which status changes are allowed, and who may make them. */
export const ORDER_TRANSITIONS = {
  /** The gateway's signed webhook confirmed the payment (markOrderPaid). */
  pay: { by: "system", from: ["awaiting_payment"], to: "paid" },
  /** The buyer cancels before paying. */
  cancel: { by: "buyer", from: ["awaiting_payment"], to: "cancelled" },
  /** The time to pay ended (the unpaid-order sweep). */
  expire: { by: "system", from: ["awaiting_payment"], to: "cancelled" },
  /** Day 14: fulfilment. */
  pack: { by: "seller", from: ["paid"], to: "packed" },
  ship: { by: "seller", from: ["packed"], to: "shipped" },
  deliver: { by: "buyer", from: ["shipped"], to: "delivered" },
  complete: { by: "system", from: ["delivered"], to: "completed" },
  /** Day 15: refunds. */
  refund: { by: "admin", from: ["paid", "packed", "shipped", "delivered"], to: "refunded" },
} as const satisfies Record<string, { by: "buyer" | "seller" | "admin" | "system"; from: readonly OrderStatus[]; to: OrderStatus }>;

export const CANCEL_REASONS = {
  buyer: "Cancelled by the buyer before payment",
  expired: `Not paid within ${ORDER_LIMITS.paymentHours} hours`,
} as const;

// ---------------------------------------------------------------- amounts

/** Muhrak's fee in whole baisa: feeBp of the items subtotal, rounded half up. BigInt, so nothing loses precision. */
export function computePlatformFee(subtotalAmount: number, feeBp: number): number {
  if (!Number.isSafeInteger(subtotalAmount) || subtotalAmount <= 0) throw new Error("Subtotal must be a positive whole amount");
  if (!Number.isInteger(feeBp) || feeBp < 0 || feeBp > 3000) throw new Error("Fee rate out of range");
  return Number((BigInt(subtotalAmount) * BigInt(feeBp) + 5000n) / 10000n);
}

// ---------------------------------------------------------------- payment summary (set by the payment module)

export type PaymentSummary = { status: PaymentStatus; updatedAt: Date };
type PaymentSummaryLookup = (orderIds: string[]) => Promise<Map<string, PaymentSummary>>;

/**
 * The payment module depends on this one (it marks orders paid), so this
 * module cannot import it back. It registers how to read the latest payment
 * of each order instead (payment/index.ts).
 */
let paymentSummaries: PaymentSummaryLookup = async () => new Map();

export function setPaymentSummaryLookup(lookup: PaymentSummaryLookup): void {
  paymentSummaries = lookup;
}

// ---------------------------------------------------------------- mapping

export function reference(number: number): string {
  return `OR-${number}`;
}

export type OrderSide = "buyer" | "seller";

const countryName = (code: string) => GCC_COUNTRY_NAMES[code as GccCountry] ?? code;
const money = (amountMinor: number) => ({ amountMinor, currency: "OMR" as const });
const iso = (date: Date | null) => date?.toISOString() ?? null;

/** The seller sees where to deliver only once the buyer has paid. */
function deliveryVisible(row: OrderRow, side: OrderSide): boolean {
  return side === "buyer" || row.paidAt !== null;
}

async function toOrders(rows: OrderRow[], side: OrderSide): Promise<Order[]> {
  const [quotes, payments] = await Promise.all([getQuoteReferences(rows.map((row) => row.quotationId)), paymentSummaries(rows.map((row) => row.id))]);
  return rows.map((row) => {
    const payment = payments.get(row.id);
    return {
      id: row.id,
      reference: reference(row.number),
      status: row.status,
      quotationId: row.quotationId,
      quotationReference: quotes.get(row.quotationId) ?? "",
      rfqId: row.rfqId,
      seller: { id: row.sellerUserId, companyName: row.sellerCompanyName },
      buyer: { name: row.buyerName },
      subtotal: money(row.subtotalAmount),
      shipping: money(row.shippingAmount),
      vatRateBp: row.vatRateBp,
      vat: money(row.vatAmount),
      total: money(row.totalAmount),
      sellerAmount: side === "seller" ? money(row.sellerAmount) : null,
      platformFee: side === "seller" ? money(row.platformFeeAmount) : null,
      deliveryDays: row.deliveryDays,
      delivery: deliveryVisible(row, side)
        ? {
            recipientName: row.recipientName,
            phone: row.recipientPhone,
            addressLine: row.addressLine,
            notes: row.deliveryNotes,
            city: row.deliveryCity,
            countryName: countryName(row.deliveryCountry),
          }
        : null,
      paymentDueAt: row.status === "awaiting_payment" ? row.paymentDueAt.toISOString() : null,
      payment: payment ? { status: payment.status, updatedAt: payment.updatedAt.toISOString() } : null,
      paidAt: iso(row.paidAt),
      cancelledAt: iso(row.cancelledAt),
      cancelReason: row.cancelReason,
      createdAt: row.createdAt.toISOString(),
    };
  });
}

async function one(row: OrderRow, side: OrderSide): Promise<Order> {
  const [order] = await toOrders([row], side);
  if (!order) throw new Error("Order mapping failed");
  return order;
}

// ---------------------------------------------------------------- buyer: confirm an order

/** Thrown inside the order transaction to undo it (the form key was used for another quotation). */
class KeyRace extends Error {}

export async function createOrder(buyerUserId: string, input: OrderCreateInput, now = new Date()): Promise<{ order: Order; created: boolean }> {
  // Same form sent again (double click, retry after a lost answer): the first order.
  const repeat = await repo.findByKey(buyerUserId, input.orderKey);
  if (repeat) return { order: await sameForm(repeat, input), created: false };

  const quote = await getQuoteForOrder(input.quotationId, now);
  if (!quote || quote.buyerUserId !== buyerUserId) throw notFound(QUOTE_NOT_FOUND);
  if (quote.status !== "active") throw conflict(await notOrderableMessage(quote.status, quote.id));

  const [buyer] = (await getUsersByIds([buyerUserId])).filter((user) => user.role === "buyer");
  if (!buyer) throw notFound(QUOTE_NOT_FOUND);

  const feeBp = env.PLATFORM_FEE_BP;
  const platformFee = computePlatformFee(quote.subtotalAmount, feeBp);
  const paymentDueAt = new Date(now.getTime() + ORDER_LIMITS.paymentHours * HOUR_MS);

  let result: { row: OrderRow; created: boolean } | undefined;
  try {
    result = await repo.inTransaction(async (tx) => {
      // Locks the request row: a quotation being revised at the same moment waits for this (or this for it).
      const rfqStatus = await lockRfqForOrder(tx, { rfqId: quote.rfqId, buyerUserId });
      if (rfqStatus === undefined) throw notFound(QUOTE_NOT_FOUND);
      if (rfqStatus !== "quoted") throw conflict("This request is closed, so its quotation can no longer be confirmed.");

      // A twin of this submit finished while we waited for the lock: return it, change nothing.
      const twin = await repo.findByKey(buyerUserId, input.orderKey, tx);
      if (twin && twin.quotationId !== quote.id) throw new KeyRace();
      if (twin) return { row: twin, created: false };

      // Active and still valid -> accepted, in this transaction (fails if it was just revised, withdrawn or expired).
      if (!(await acceptQuoteForOrder(tx, { quotationId: quote.id, buyerUserId, at: now }))) return undefined;

      const row = await repo.insertOrder(tx, {
        buyerUserId,
        sellerUserId: quote.sellerUserId,
        rfqId: quote.rfqId,
        quotationId: quote.id,
        orderKey: input.orderKey,
        currency: quote.currency,
        subtotalAmount: quote.subtotalAmount,
        shippingAmount: quote.shippingAmount,
        vatRateBp: quote.vatRateBp,
        vatAmount: quote.vatAmount,
        totalAmount: quote.totalAmount,
        platformFeeBp: feeBp,
        platformFeeAmount: platformFee,
        sellerAmount: quote.totalAmount - platformFee,
        deliveryDays: quote.deliveryDays,
        sellerCompanyName: quote.sellerCompanyName,
        buyerName: buyer.fullName,
        recipientName: input.delivery.recipientName,
        recipientPhone: input.delivery.phone,
        addressLine: input.delivery.addressLine,
        deliveryNotes: input.delivery.notes,
        deliveryCity: quote.deliveryCity,
        deliveryCountry: quote.deliveryCountry,
        paymentDueAt,
        at: now,
      });
      if (!row) throw new KeyRace();
      await repo.insertEvent(tx, { orderId: row.id, from: null, to: "awaiting_payment", actor: "buyer", actorUserId: buyerUserId, at: now });
      return { row, created: true };
    });
  } catch (error) {
    if (!(error instanceof KeyRace)) throw error;
    const raced = await repo.findByKey(buyerUserId, input.orderKey);
    if (raced) return { order: await sameForm(raced, input), created: false };
    throw error;
  }

  if (!result) {
    const latest = await getQuoteForOrder(quote.id, now);
    throw conflict(latest && latest.status !== "active" ? await notOrderableMessage(latest.status, quote.id) : "This quotation was just changed. Reload to see its current state.");
  }
  if (!result.created) return { order: await sameForm(result.row, input), created: false };

  logger.info({ orderId: result.row.id, quoteId: quote.id }, "Order confirmed, awaiting payment");
  return { order: await one(result.row, "buyer"), created: true };
}

/** A form key reused for a different quotation is a client bug or tampering, not a repeat. */
async function sameForm(row: OrderRow, input: OrderCreateInput): Promise<Order> {
  if (row.quotationId !== input.quotationId) throw badRequest("This form was already used for another order. Reload the page and try again.");
  return one(row, "buyer");
}

async function notOrderableMessage(status: string, quotationId: string): Promise<string> {
  switch (status) {
    case "accepted": {
      const live = await repo.findLiveForQuotation(quotationId);
      return live ? `You already confirmed this quotation as order ${reference(live.number)}. Open it from Orders to pay.` : "This quotation was already confirmed.";
    }
    case "expired":
      return "This quotation has expired. Ask the seller in chat for a new one.";
    case "withdrawn":
      return "The seller withdrew this quotation. Ask the seller in chat for a new one.";
    case "superseded":
      return "The seller sent a newer quotation. Confirm the newest one instead.";
    default:
      return "This quotation can no longer be confirmed.";
  }
}

// ---------------------------------------------------------------- buyer: cancel before paying

export async function cancelOrder(buyerUserId: string, id: string, now = new Date()): Promise<Order> {
  const current = await repo.findOrder(id);
  if (!current || current.buyerUserId !== buyerUserId) throw notFound(NOT_FOUND);
  const t = ORDER_TRANSITIONS.cancel;
  const row = await repo.inTransaction(async (tx) => {
    const cancelled = await repo.cancelByBuyer(tx, { id, buyerUserId, reason: CANCEL_REASONS.buyer, at: now });
    if (!cancelled) return undefined;
    await releaseQuoteForOrder(tx, { quotationId: cancelled.quotationId, at: now });
    await repo.insertEvent(tx, { orderId: id, from: t.from[0], to: t.to, actor: "buyer", actorUserId: buyerUserId, at: now });
    return cancelled;
  });
  if (!row) {
    const latest = (await repo.findOrder(id)) ?? current;
    if (latest.status === "cancelled") return one(latest, "buyer"); // already cancelled (double click): same answer
    throw conflict(latest.status === "awaiting_payment" ? "This order was just changed. Reload to see its current state." : "This order is already paid, so it cannot be cancelled here.");
  }
  logger.info({ orderId: id }, "Order cancelled by the buyer");
  return one(row, "buyer");
}

// ---------------------------------------------------------------- reading (buyer and seller)

function ownerOf(row: OrderRow, side: OrderSide): string {
  return side === "buyer" ? row.buyerUserId : row.sellerUserId;
}

export async function getOrder(side: OrderSide, userId: string, id: string): Promise<Order> {
  const row = await repo.findOrder(id);
  if (!row || ownerOf(row, side) !== userId) throw notFound(NOT_FOUND);
  return one(row, side);
}

export async function listOrders(side: OrderSide, userId: string, query: OrderListQuery): Promise<OrderListResponse> {
  const rows = await repo.listFor({ side, userId, cursor: decodeCursor(query.cursor), limit: query.limit + 1 });
  const page = rows.slice(0, query.limit);
  const last = page.at(-1);
  return { items: await toOrders(page, side), nextCursor: rows.length > query.limit && last ? encodeCursor(last) : null };
}

/** The buyer's last delivery address, to fill in the next order. */
export async function getLastDelivery(buyerUserId: string): Promise<DeliveryAddressInput | null> {
  const row = await repo.latestForBuyer(buyerUserId);
  if (!row) return null;
  return { recipientName: row.recipientName, phone: row.recipientPhone, addressLine: row.addressLine, notes: row.deliveryNotes };
}

// ---------------------------------------------------------------- for the payment module

export type OrderTx = repo.Tx;

export interface OrderForPayment {
  id: string;
  reference: string;
  buyerUserId: string;
  sellerUserId: string;
  status: OrderStatus;
  currency: "OMR";
  totalAmount: number;
  platformFeeAmount: number;
  sellerAmount: number;
  paymentDueAt: Date;
}

function forPayment(row: OrderRow): OrderForPayment {
  return {
    id: row.id,
    reference: reference(row.number),
    buyerUserId: row.buyerUserId,
    sellerUserId: row.sellerUserId,
    status: row.status,
    currency: "OMR",
    totalAmount: row.totalAmount,
    platformFeeAmount: row.platformFeeAmount,
    sellerAmount: row.sellerAmount,
    paymentDueAt: row.paymentDueAt,
  };
}

export async function getOrderForPayment(id: string): Promise<OrderForPayment | undefined> {
  const row = await repo.findOrder(id);
  return row ? forPayment(row) : undefined;
}

/**
 * ORDER_TRANSITIONS.pay, in the payment webhook's transaction: awaiting
 * payment -> paid. Returns the order when it was marked now; undefined when
 * it is not awaiting payment (cancelled, or already paid by another payment).
 */
export async function markOrderPaid(tx: repo.Tx, input: { orderId: string; at: Date }): Promise<OrderForPayment | undefined> {
  const row = await repo.markPaid(tx, { id: input.orderId, at: input.at });
  if (!row) return undefined;
  const t = ORDER_TRANSITIONS.pay;
  await repo.insertEvent(tx, { orderId: row.id, from: t.from[0], to: t.to, actor: "system", actorUserId: null, note: "Payment confirmed by the gateway", at: input.at });
  return forPayment(row);
}

// ---------------------------------------------------------------- expiry (background worker)

/** Cancel unpaid orders past their time and make their quotations valid again. Safe with several API copies. */
export async function expireUnpaidOrders(now = new Date()): Promise<number> {
  const t = ORDER_TRANSITIONS.expire;
  let total = 0;
  for (;;) {
    const count = await repo.inTransaction(async (tx) => {
      const due = await repo.cancelDue(tx, { now, reason: CANCEL_REASONS.expired, limit: 100 });
      for (const order of due) {
        await releaseQuoteForOrder(tx, { quotationId: order.quotationId, at: now });
        await repo.insertEvent(tx, { orderId: order.id, from: t.from[0], to: t.to, actor: "system", actorUserId: null, note: CANCEL_REASONS.expired, at: now });
      }
      return due.length;
    });
    total += count;
    if (count < 100) return total;
  }
}

// ---------------------------------------------------------------- helpers

function encodeCursor(row: OrderRow): string {
  return Buffer.from(JSON.stringify([row.createdAt.toISOString(), row.id])).toString("base64url");
}

function decodeCursor(cursor: string | undefined): repo.ListCursor | null {
  if (!cursor) return null;
  try {
    const [at, id] = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as [unknown, unknown];
    const date = typeof at === "string" ? new Date(at) : null;
    if (!date || Number.isNaN(date.getTime()) || typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) throw new Error("bad");
    return { at: date, id };
  } catch {
    throw badRequest("This page link is not valid. Go back to the first page.");
  }
}
