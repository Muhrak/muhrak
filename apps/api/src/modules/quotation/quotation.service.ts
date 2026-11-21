import {
  CHAT_QUEUE,
  GCC_COUNTRY_NAMES,
  QUOTE_LIMITS,
  QUOTE_VAT_RATE_BP,
  toMinor,
  type GccCountry,
  type Quote,
  type QuoteCreateInput,
  type QuoteItemInput,
  type QuoteListQuery,
  type QuoteListResponse,
  type QuoteStatus,
} from "../../schemas";
import type { QuotationItemRow, QuotationRow } from "../../db/schema";
import { AppError, badRequest, conflict, forbidden, notFound } from "../../shared/errors";
import { enqueueJob, wakeWorker } from "../../shared/jobs";
import { logger } from "../../shared/logger";
import { getUsersByIds } from "../auth";
import { sendNewQuoteEmail } from "../notification";
import { getRfqForQuote, markRfqQuoted } from "../rfq";
import { getSellerForQuote } from "../seller";
import { pdfMoney, renderQuotePdf } from "./quotation.pdf";
import * as repo from "./quotation.repository";

/**
 * Quotations (Day 11, 21 Nov 2026): the seller's priced answer to a quote request.
 *
 * Rules:
 * - Only the request's own seller sends or withdraws a quotation, and only
 *   while the seller is verified; only that request's buyer and seller can
 *   read it or its PDF. Anyone else gets "not found".
 * - Every amount is computed here from the item prices and quantities
 *   (integer baisa, OMR only). VAT 5% of items + shipping only when the
 *   seller is VAT registered. The client never sends a total.
 * - Sending a quotation moves the request to "quoted" in the SAME
 *   transaction, with the request row locked: two quotations for one request
 *   are written one after the other. A revision replaces the active one
 *   (kept as "superseded"); at most one active per request (unique index too).
 * - The same form key returns the first quotation (double submit).
 * - Status changes follow QUOTE_TRANSITIONS only, as conditional updates.
 * - The buyer's email and the chat card are queued in the same transaction.
 * - Quotations are never deleted or edited.
 */

const NOT_FOUND = "Quotation not found";
const RFQ_NOT_FOUND = "Quote request not found";
const CURRENCY = "OMR" as const;
const DAY_MS = 86_400_000;

/** The one place that says which status changes are allowed, and who may make them. */
export const QUOTE_TRANSITIONS = {
  withdraw: { by: "seller", from: ["active"], to: "withdrawn" },
  /** A revised quotation replaces the active one (repository supersedeActive, in the send transaction). */
  supersede: { by: "seller", from: ["active"], to: "superseded" },
  /** The expiry sweep (repository expireDue applies exactly this). */
  expire: { by: "system", from: ["active"], to: "expired" },
} as const satisfies Record<string, { by: "buyer" | "seller" | "system"; from: readonly QuoteStatus[]; to: QuoteStatus }>;

// ---------------------------------------------------------------- amounts

export interface QuoteAmounts {
  items: { partNumber: string | null; description: string; details: string | null; quantity: number; unitPriceAmount: number; amount: number }[];
  subtotalAmount: number;
  shippingAmount: number;
  vatRateBp: number;
  vatAmount: number;
  totalAmount: number;
}

/**
 * Item amounts, subtotal, VAT and total, in whole baisa. BigInt throughout,
 * then checked against the cap, so no sum can lose precision. VAT is
 * rounded half up to the nearest baisa.
 */
export function computeQuoteAmounts(items: QuoteItemInput[], shipping: string, vatRegistered: boolean): QuoteAmounts {
  let unitPrices: bigint[];
  let shippingMinor: bigint;
  try {
    unitPrices = items.map((item) => BigInt(toMinor(item.unitPrice, CURRENCY)));
    shippingMinor = BigInt(toMinor(shipping, CURRENCY));
  } catch {
    throw badRequest("Enter prices in OMR with up to 3 decimals.");
  }
  const lines = items.map((item, index) => {
    const unit = unitPrices[index]!;
    if (unit <= 0n) throw badRequest("Every item needs a price above 0.");
    return { item, unit, amount: unit * BigInt(item.quantity) };
  });
  const subtotal = lines.reduce((sum, line) => sum + line.amount, 0n);
  const vatRateBp = vatRegistered ? QUOTE_VAT_RATE_BP : 0;
  const vat = ((subtotal + shippingMinor) * BigInt(vatRateBp) + 5000n) / 10000n;
  const total = subtotal + shippingMinor + vat;
  if (total > BigInt(QUOTE_LIMITS.maxTotalMinor)) throw badRequest("This quotation is too large. Split it into smaller quotations.");
  return {
    items: lines.map(({ item, unit, amount }) => ({
      partNumber: item.partNumber,
      description: item.description,
      details: item.details,
      quantity: item.quantity,
      unitPriceAmount: Number(unit),
      amount: Number(amount),
    })),
    subtotalAmount: Number(subtotal),
    shippingAmount: Number(shippingMinor),
    vatRateBp,
    vatAmount: Number(vat),
    totalAmount: Number(total),
  };
}

// ---------------------------------------------------------------- mapping

export function reference(number: number): string {
  return `QT-${number}`;
}

/** An active quotation past its validity counts as expired even before the sweep has run. */
function effective(row: QuotationRow, now: Date): { status: QuoteStatus; closedAt: Date | null } {
  if (row.status === "active" && row.validUntil.getTime() <= now.getTime()) return { status: "expired", closedAt: row.validUntil };
  return { status: row.status, closedAt: row.closedAt };
}

const countryName = (code: string) => GCC_COUNTRY_NAMES[code as GccCountry] ?? code;
const money = (amountMinor: number) => ({ amountMinor, currency: CURRENCY });

async function toQuotes(rows: QuotationRow[], now: Date): Promise<Quote[]> {
  const items = await repo.listItems(rows.map((row) => row.id));
  const byQuote = new Map<string, QuotationItemRow[]>();
  for (const item of items) byQuote.set(item.quotationId, [...(byQuote.get(item.quotationId) ?? []), item]);
  const rfqs = new Map<string, string>();
  for (const row of rows) {
    if (rfqs.has(row.rfqId)) continue;
    const rfq = await getRfqForQuote(row.rfqId, now);
    rfqs.set(row.rfqId, rfq?.reference ?? "");
  }
  return rows.map((row) => {
    const state = effective(row, now);
    return {
      id: row.id,
      reference: reference(row.number),
      rfqId: row.rfqId,
      rfqReference: rfqs.get(row.rfqId) ?? "",
      status: state.status,
      items: (byQuote.get(row.id) ?? []).map((item) => ({
        position: item.position,
        partNumber: item.partNumber,
        description: item.description,
        details: item.details,
        quantity: item.quantity,
        unitPrice: money(item.unitPriceAmount),
        amount: money(item.amount),
      })),
      subtotal: money(row.subtotalAmount),
      shipping: money(row.shippingAmount),
      vatRateBp: row.vatRateBp,
      vat: money(row.vatAmount),
      total: money(row.totalAmount),
      deliveryDays: row.deliveryDays,
      validDays: row.validDays,
      validUntil: row.validUntil.toISOString(),
      terms: row.terms,
      notes: row.notes,
      seller: { id: row.sellerUserId, companyName: row.sellerCompanyName, city: row.sellerCity, countryName: countryName(row.sellerCountry) },
      buyer: { name: row.buyerName, deliveryCity: row.deliveryCity, deliveryCountryName: countryName(row.deliveryCountry) },
      createdAt: row.createdAt.toISOString(),
      closedAt: state.closedAt?.toISOString() ?? null,
    };
  });
}

async function one(rows: QuotationRow[], now: Date): Promise<Quote> {
  const [quote] = await toQuotes(rows, now);
  if (!quote) throw new Error("Quotation mapping failed");
  return quote;
}

// ---------------------------------------------------------------- seller

/** Thrown inside the send transaction to undo it (a form key reused for another request raced in). */
class KeyRace extends Error {}

export async function createQuote(sellerUserId: string, input: QuoteCreateInput, now = new Date()): Promise<{ quote: Quote; created: boolean }> {
  // Same form sent again (double click, retry after a lost answer): the first quotation.
  const repeat = await repo.findByKey(sellerUserId, input.quoteKey);
  if (repeat) return { quote: await sameForm(repeat, input, now), created: false };

  const rfq = await getRfqForQuote(input.rfqId, now);
  if (!rfq || rfq.sellerUserId !== sellerUserId) throw notFound(RFQ_NOT_FOUND);
  if (rfq.status !== "open" && rfq.status !== "quoted") throw conflict(closedMessage(rfq.status));

  const seller = await getSellerForQuote(sellerUserId);
  if (!seller) throw forbidden("Your company must be verified before you can send quotations. See Verification.");

  const amounts = computeQuoteAmounts(input.items, input.shipping, seller.vatRegistered);

  const [buyer] = (await getUsersByIds([rfq.buyerUserId])).filter((user) => user.role === "buyer");
  if (!buyer) throw notFound(RFQ_NOT_FOUND);

  const validUntil = new Date(now.getTime() + input.validDays * DAY_MS);

  let result: { row: QuotationRow; created: boolean } | undefined;
  try {
    result = await repo.inTransaction(async (tx) => {
      // Locks the request row until the end: quotations for one request are written one at a time.
      if (!(await markRfqQuoted(tx, { rfqId: rfq.id, sellerUserId, at: now }))) return undefined;

      // A twin of this submit finished while we waited for the lock: return it, change nothing.
      // The key used for ANOTHER request: undo (this request must not turn "quoted" without a quotation).
      const twin = await repo.findByKey(sellerUserId, input.quoteKey, tx);
      if (twin && twin.rfqId !== rfq.id) throw new KeyRace();
      if (twin) return { row: twin, created: false };

      if ((await repo.countForRfq(tx, rfq.id)) >= QUOTE_LIMITS.maxPerRfq) {
        throw conflict(`This request already has ${QUOTE_LIMITS.maxPerRfq} quotations. Talk to the buyer in chat instead.`);
      }

      const previous = await repo.supersedeActive(tx, rfq.id, now);
      const row = await repo.insertQuote(tx, {
        rfqId: rfq.id,
        sellerUserId,
        buyerUserId: rfq.buyerUserId,
        quoteKey: input.quoteKey,
        currency: CURRENCY,
        subtotalAmount: amounts.subtotalAmount,
        shippingAmount: amounts.shippingAmount,
        vatRateBp: amounts.vatRateBp,
        vatAmount: amounts.vatAmount,
        totalAmount: amounts.totalAmount,
        deliveryDays: input.deliveryDays,
        validDays: input.validDays,
        validUntil,
        terms: input.terms,
        notes: input.notes,
        sellerCompanyName: seller.companyName,
        sellerCity: seller.city,
        sellerCountry: seller.country,
        buyerName: buyer.fullName,
        deliveryCity: rfq.deliveryCity,
        deliveryCountry: rfq.deliveryCountry,
        at: now,
      });
      if (!row) throw new KeyRace();
      await repo.insertItems(
        tx,
        row.id,
        amounts.items.map((item, index) => ({ ...item, position: index + 1 })),
      );

      await sendNewQuoteEmail(
        {
          to: buyer.email,
          fullName: buyer.fullName,
          quoteId: row.id,
          quoteReference: reference(row.number),
          rfqId: rfq.id,
          rfqReference: rfq.reference,
          sellerName: seller.companyName,
          partName: amounts.items[0]?.description ?? rfq.partName,
          itemCount: amounts.items.length,
          total: pdfMoney(money(amounts.totalAmount)),
          deliveryDays: input.deliveryDays,
          validUntil: new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Muscat" }).format(validUntil),
          revised: previous !== undefined,
        },
        tx,
      );
      // The quotation card in the request's chat (Day 10), posted by a background job.
      await enqueueJob(CHAT_QUEUE, "post-quote-card", { quoteId: row.id }, { dedupeKey: `chat-quote-${row.id}`, maxAttempts: 8, tx });
      return { row, created: true };
    });
  } catch (error) {
    if (!(error instanceof KeyRace)) throw error;
    const raced = await repo.findByKey(sellerUserId, input.quoteKey);
    if (raced) return { quote: await sameForm(raced, input, now), created: false };
    throw error;
  }

  if (!result) {
    const latest = await getRfqForQuote(rfq.id, now);
    throw conflict(latest ? closedMessage(latest.status) : "This request was just changed. Reload to see its current state.");
  }
  if (!result.created) return { quote: await sameForm(result.row, input, now), created: false };

  wakeWorker();
  logger.info({ quoteId: result.row.id, rfqId: rfq.id }, "Quotation sent");
  return { quote: await one([result.row], now), created: true };
}

/** A form key reused for a different request is a client bug or tampering, not a repeat. */
async function sameForm(row: QuotationRow, input: QuoteCreateInput, now: Date): Promise<Quote> {
  if (row.rfqId !== input.rfqId) throw badRequest("This form was already used for another quotation. Reload the page and try again.");
  return one([row], now);
}

function closedMessage(status: string): string {
  switch (status) {
    case "expired":
      return "This request closed after 7 days without a reply, so it can no longer be quoted.";
    case "cancelled":
      return "The buyer cancelled this request, so it can no longer be quoted.";
    case "declined":
      return "You declined this request, so it can no longer be quoted.";
    default:
      return "This request can no longer be quoted.";
  }
}

export async function withdrawQuote(sellerUserId: string, id: string, now = new Date()): Promise<Quote> {
  const current = await repo.findQuote(id);
  if (!current || current.sellerUserId !== sellerUserId) throw notFound(NOT_FOUND);
  const t = QUOTE_TRANSITIONS.withdraw;
  const row = await repo.transition({ id, sellerUserId, from: [...t.from], to: t.to, at: now });
  if (!row) {
    const state = effective(current, now).status;
    if (state === "active") throw conflict("This quotation was just changed. Reload to see its current state.");
    throw conflict(`This quotation is ${state === "superseded" ? "already replaced by a newer one" : state}; it cannot be withdrawn.`);
  }
  logger.info({ quoteId: id }, "Quotation withdrawn");
  return one([row], now);
}

// ---------------------------------------------------------------- reading (buyer and seller)

export type QuoteSide = "buyer" | "seller";

function ownerOf(row: QuotationRow, side: QuoteSide): string {
  return side === "buyer" ? row.buyerUserId : row.sellerUserId;
}

/** A quotation, only for that request's buyer (buyer side) or seller (seller side). */
async function own(side: QuoteSide, userId: string, id: string): Promise<QuotationRow> {
  const row = await repo.findQuote(id);
  if (!row || ownerOf(row, side) !== userId) throw notFound(NOT_FOUND);
  return row;
}

export async function getQuote(side: QuoteSide, userId: string, id: string, now = new Date()): Promise<Quote> {
  return one([await own(side, userId, id)], now);
}

export async function listQuotes(side: QuoteSide, userId: string, query: QuoteListQuery, now = new Date()): Promise<QuoteListResponse> {
  const rfq = await getRfqForQuote(query.rfqId, now);
  if (!rfq || (side === "buyer" ? rfq.buyerUserId : rfq.sellerUserId) !== userId) throw notFound(RFQ_NOT_FOUND);
  const rows = await repo.listForRfq({ rfqId: rfq.id, cursor: decodeCursor(query.cursor), limit: query.limit + 1 });
  const page = rows.slice(0, query.limit);
  const last = page.at(-1);
  return { items: await toQuotes(page, now), nextCursor: rows.length > query.limit && last ? encodeCursor(last) : null };
}

/** The PDF of a quotation, for its buyer or seller only. Drawn from the saved quotation every time. */
export async function getQuotePdf(side: QuoteSide, userId: string, id: string, now = new Date()): Promise<{ filename: string; pdf: Buffer }> {
  const quote = await one([await own(side, userId, id)], now);
  try {
    return { filename: `Muhrak-Quotation-${quote.reference}.pdf`, pdf: await renderQuotePdf(quote) };
  } catch (error) {
    logger.error({ quoteId: id, err: { message: (error as Error).message } }, "Quotation PDF failed");
    throw new AppError(500, "pdf_failed", "The PDF could not be made. Please try again.");
  }
}

// ---------------------------------------------------------------- expiry (background worker)

/** Close every active quotation past its validity. Safe to run from several API copies at once. */
export async function expireDueQuotes(now = new Date()): Promise<number> {
  let total = 0;
  for (;;) {
    const count = await repo.expireDue(now, 500);
    total += count;
    if (count < 500) return total;
  }
}

// ---------------------------------------------------------------- for the chat module

/** What the chat card job needs. Undefined if it does not exist. */
export async function getQuoteForChat(id: string): Promise<{ id: string; reference: string; rfqId: string; sellerUserId: string } | undefined> {
  const row = await repo.findQuote(id);
  if (!row) return undefined;
  return { id: row.id, reference: reference(row.number), rfqId: row.rfqId, sellerUserId: row.sellerUserId };
}

// ---------------------------------------------------------------- helpers

function encodeCursor(row: QuotationRow): string {
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
