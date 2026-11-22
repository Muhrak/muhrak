import type { PaymentStatus, PayStartResponse, TestPaymentComplete } from "../../schemas";
import type { PaymentRow } from "../../db/schema";
import { env } from "../../config/env";
import { AppError, conflict, notFound } from "../../shared/errors";
import { logger } from "../../shared/logger";
import { recordPaymentCaptured, recordRefundDue } from "../ledger";
import { getOrderForPayment, markOrderPaid, type PaymentSummary } from "../order";
import * as repo from "./payment.repository";
import { createFakePaymentProvider, type FakePaymentProvider } from "./providers/fake";
import type { PaymentEvent, PaymentProvider } from "./providers/payment-provider";

/**
 * Payments (Day 12, 22 Nov 2026), following the payment rules in docs/PLAN.md:
 *
 * - No card data here: the buyer pays on the gateway's hosted checkout.
 * - The amount is the order's total, read from the database; the client
 *   never sends an amount.
 * - Only the gateway's signed webhook marks a payment succeeded. Every event
 *   is stored once (unique provider + event id): a retried or replayed
 *   webhook changes nothing. The event, the payment, the order and the
 *   ledger rows are written in ONE transaction, with the payment row locked.
 * - Amount or currency different from what we asked for: nothing changes,
 *   the event is kept as a mismatch and an error is logged for a person.
 * - One counted payment per order (unique index). Money that arrives for an
 *   order that is already paid or cancelled is recorded as owed back to the
 *   buyer (refund_reason + ledger "buyer" row); the refund itself is Day 15.
 * - Status changes follow PAYMENT_TRANSITIONS only.
 */

const NOT_FOUND = "Order not found";
const MINUTE_MS = 60_000;
/** How long one checkout stays open (never past the order's payment time). */
const CHECKOUT_MINUTES = 30;
/** A pending attempt this long past its checkout's end is closed by the sweep (late webhooks still count, see below). */
const STALE_MINUTES = 60;

/** The one place that says which status changes are allowed. Only the webhook (system) changes a payment. */
export const PAYMENT_TRANSITIONS = {
  succeed: { by: "system", from: ["pending", "failed", "expired"], to: "succeeded" },
  fail: { by: "system", from: ["pending"], to: "failed" },
  expire: { by: "system", from: ["pending"], to: "expired" },
  /** Day 15: refunds (admin). */
  refund: { by: "admin", from: ["succeeded", "partially_refunded"], to: "refunded" },
  refundPart: { by: "admin", from: ["succeeded", "partially_refunded"], to: "partially_refunded" },
} as const satisfies Record<string, { by: "system" | "admin"; from: readonly PaymentStatus[]; to: PaymentStatus }>;

export const REFUND_REASONS = {
  paidTwice: "Paid twice: the order was already paid",
  orderClosed: "Paid after the order was cancelled",
} as const;

// ---------------------------------------------------------------- provider

let provider: PaymentProvider | null | undefined;

/** The configured gateway, or null when payments are off (PAYMENT_PROVIDER=none). */
function getProvider(): PaymentProvider | null {
  if (provider !== undefined) return provider;
  if (env.PAYMENT_PROVIDER === "fake" && env.FAKE_PAYMENT_SECRET) {
    provider = createFakePaymentProvider({ secret: env.FAKE_PAYMENT_SECRET, webAppUrl: env.WEB_APP_URL });
    logger.warn("Payments use the FAKE test gateway: no money moves, and buyers can mark their own orders paid. Never on the live site.");
  } else {
    provider = null;
  }
  return provider;
}

/** Tests only: use this gateway instead of the configured one. */
export function setPaymentProviderForTests(next: PaymentProvider | null): void {
  provider = next;
}

function paymentsOff(): AppError {
  return new AppError(503, "payments_off", "Online payment is not switched on yet. Your order is saved; please try again later.");
}

// ---------------------------------------------------------------- buyer: start paying

export async function startPayment(buyerUserId: string, orderId: string, now = new Date()): Promise<PayStartResponse> {
  const gateway = getProvider();
  const order = await getOrderForPayment(orderId);
  if (!order || order.buyerUserId !== buyerUserId) throw notFound(NOT_FOUND);
  if (order.status !== "awaiting_payment") {
    throw conflict(order.status === "cancelled" ? "This order was cancelled, so it cannot be paid." : "This order is already paid.");
  }
  if (order.paymentDueAt.getTime() <= now.getTime()) throw conflict("The time to pay this order has ended. Confirm the quotation again to order it.");
  if (!gateway) throw paymentsOff();

  // An open checkout for this order: send the buyer back to it (one live checkout per order, so one payment).
  const pending = await repo.findPendingForOrder(order.id);
  if (pending) {
    const open = pending.checkoutUrl && pending.checkoutExpiresAt && pending.checkoutExpiresAt.getTime() > now.getTime() + MINUTE_MS;
    if (open && pending.provider === gateway.name) return { paymentId: pending.id, checkoutUrl: pending.checkoutUrl! };
    // A checkout that never opened, or has closed: a new attempt replaces it (a late success still counts; see the webhook).
    await repo.closePending({ id: pending.id, to: "expired", at: now });
  }

  const payment = await repo.insertPending({ orderId: order.id, buyerUserId, provider: gateway.name, currency: order.currency, amount: order.totalAmount, at: now });
  if (!payment) throw conflict("A payment for this order is being started. Please try again in a moment.");

  const expiresAt = new Date(Math.min(order.paymentDueAt.getTime(), now.getTime() + CHECKOUT_MINUTES * MINUTE_MS));
  let checkout;
  try {
    checkout = await gateway.createCheckout({
      reference: payment.id,
      orderId: order.id,
      orderReference: order.reference,
      amountMinor: payment.amount,
      currency: order.currency,
      returnUrl: `${env.WEB_APP_URL}/buyer/orders?id=${order.id}&checking=1`,
      expiresAt,
    });
  } catch (error) {
    await repo.closePending({ id: payment.id, to: "failed", at: now });
    logger.error({ orderId: order.id, paymentId: payment.id, err: { message: (error as Error).message } }, "Checkout could not be created");
    throw new AppError(502, "gateway_error", "The payment page could not be opened. Please try again.");
  }
  const saved = await repo.setCheckout({ id: payment.id, providerPaymentId: checkout.providerPaymentId, checkoutUrl: checkout.checkoutUrl, expiresAt: checkout.expiresAt, at: now });
  if (!saved) throw conflict("This payment was just changed. Reload the order and try again.");
  logger.info({ orderId: order.id, paymentId: payment.id }, "Checkout opened");
  return { paymentId: payment.id, checkoutUrl: checkout.checkoutUrl };
}

// ---------------------------------------------------------------- webhook

export type WebhookResult = { status: 200 | 400 | 404; outcome: string };

/**
 * A webhook from the gateway. 400 for a bad signature or body (nothing is
 * stored); 200 once the event is stored, whatever we did with it, so the
 * gateway stops retrying. Anything unexpected throws, so the gateway retries.
 */
export async function handleWebhook(providerName: string, rawBody: Buffer, headers: Record<string, string | string[] | undefined>, now = new Date()): Promise<WebhookResult> {
  const gateway = getProvider();
  if (!gateway || gateway.name !== providerName) return { status: 404, outcome: "unknown gateway" };
  const event = gateway.verifyWebhook(rawBody, headers);
  if (!event) {
    logger.warn({ provider: providerName }, "Payment webhook refused: bad signature or body");
    return { status: 400, outcome: "bad signature" };
  }
  const outcome = await applyEvent(gateway.name, event, now);
  return { status: 200, outcome };
}

async function applyEvent(providerName: string, event: PaymentEvent, now: Date): Promise<string> {
  return repo.inTransaction(async (tx) => {
    const eventRowId = await repo.insertEvent(tx, {
      provider: providerName,
      eventId: event.eventId,
      type: event.type,
      providerPaymentId: event.providerPaymentId,
      amount: event.amountMinor,
      currency: event.currency,
      at: now,
    });
    if (!eventRowId) return "duplicate"; // stored before: a retry or a replay changes nothing

    const finish = async (paymentId: string | null, outcome: string) => {
      await repo.finishEvent(tx, { id: eventRowId, paymentId, outcome, at: now });
      return outcome;
    };

    const payment = /^[0-9a-f-]{36}$/i.test(event.reference) ? await repo.lockPayment(tx, event.reference) : undefined;
    if (!payment || payment.provider !== providerName) {
      logger.error({ provider: providerName, eventId: event.eventId }, "Payment webhook for an unknown payment");
      return finish(null, "ignored: unknown payment");
    }
    if (payment.providerPaymentId && payment.providerPaymentId !== event.providerPaymentId) {
      logger.error({ paymentId: payment.id, eventId: event.eventId }, "Payment webhook: gateway payment id does not match");
      return finish(payment.id, "mismatch: gateway payment id");
    }
    if (event.amountMinor !== payment.amount || event.currency !== payment.currency) {
      // Never accept a different amount: a person must look at it.
      logger.error({ paymentId: payment.id, eventId: event.eventId, expected: payment.amount, got: event.amountMinor, currency: event.currency }, "Payment webhook: amount or currency does not match");
      return finish(payment.id, "mismatch: amount or currency");
    }

    switch (event.type) {
      case "payment.succeeded":
        return finish(payment.id, await applySuccess(tx, payment, event, now));
      case "payment.failed":
        return finish(payment.id, (await repo.closePending({ id: payment.id, to: "failed", at: now }, tx)) ? "applied: failed" : `ignored: payment is ${payment.status}`);
      case "payment.expired":
        return finish(payment.id, (await repo.closePending({ id: payment.id, to: "expired", at: now }, tx)) ? "applied: expired" : `ignored: payment is ${payment.status}`);
    }
  });
}

/** The money arrived. Count it for the order if the order is awaiting payment; otherwise it is owed back to the buyer. */
async function applySuccess(tx: repo.Tx, payment: PaymentRow, event: PaymentEvent, now: Date): Promise<string> {
  if (!(PAYMENT_TRANSITIONS.succeed.from as readonly string[]).includes(payment.status)) return `ignored: payment is ${payment.status}`;

  const order = await markOrderPaid(tx, { orderId: payment.orderId, at: now });
  if (order) {
    if (order.totalAmount !== payment.amount) throw new Error(`Order ${order.id} total ${order.totalAmount} differs from payment ${payment.id} amount ${payment.amount}`);
    const saved = await repo.markSucceeded(tx, { id: payment.id, providerPaymentId: event.providerPaymentId, refundReason: null, at: now });
    if (!saved) throw new Error(`Payment ${payment.id} changed while locked`);
    await recordPaymentCaptured(tx, {
      orderId: order.id,
      paymentId: payment.id,
      sellerUserId: order.sellerUserId,
      total: order.totalAmount,
      platformFee: order.platformFeeAmount,
      sellerAmount: order.sellerAmount,
      at: now,
    });
    logger.info({ orderId: order.id, paymentId: payment.id }, "Payment succeeded, order paid");
    return "applied: order paid";
  }

  // The order is not awaiting payment: already paid by another payment, or cancelled. Keep the money as owed back.
  const current = await getOrderForPayment(payment.orderId);
  const reason = current && current.status !== "cancelled" ? REFUND_REASONS.paidTwice : REFUND_REASONS.orderClosed;
  const saved = await repo.markSucceeded(tx, { id: payment.id, providerPaymentId: event.providerPaymentId, refundReason: reason, at: now });
  if (!saved) throw new Error(`Payment ${payment.id} changed while locked`);
  await recordRefundDue(tx, { orderId: payment.orderId, paymentId: payment.id, buyerUserId: payment.buyerUserId, amount: payment.amount, at: now });
  logger.error({ orderId: payment.orderId, paymentId: payment.id, reason }, "Payment received that must be refunded");
  return `applied: refund due (${reason})`;
}

// ---------------------------------------------------------------- test gateway only

/** "Pay (test)" / "Fail (test)" on the fake checkout page: a signed webhook through the normal path. */
export async function completeTestPayment(buyerUserId: string, paymentId: string, input: TestPaymentComplete, now = new Date()): Promise<{ outcome: string }> {
  const gateway = getProvider();
  if (!gateway || gateway.name !== "fake") throw notFound("Not found");
  const payment = await repo.findPayment(paymentId);
  if (!payment || payment.buyerUserId !== buyerUserId || payment.provider !== "fake" || !payment.providerPaymentId) throw notFound("Payment not found");
  if (payment.status !== "pending") throw conflict(`This payment is already ${payment.status}.`);
  const { rawBody, headers } = (gateway as FakePaymentProvider).signEvent({
    type: input.outcome === "succeeded" ? "payment.succeeded" : "payment.failed",
    providerPaymentId: payment.providerPaymentId,
    reference: payment.id,
    amountMinor: payment.amount,
    currency: payment.currency,
  });
  const result = await handleWebhook("fake", rawBody, headers, now);
  return { outcome: result.outcome };
}

// ---------------------------------------------------------------- for the order module

/** The newest payment attempt of each order. */
export async function latestPaymentsForOrders(orderIds: string[]): Promise<Map<string, PaymentSummary>> {
  const rows = await repo.latestForOrders(orderIds);
  return new Map(rows.map((row) => [row.orderId, { status: row.status, updatedAt: row.updatedAt }]));
}

// ---------------------------------------------------------------- sweep (background worker)

/** Close pending attempts whose checkout ended a while ago. A webhook that still arrives later is applied anyway. */
export async function expireStalePayments(now = new Date()): Promise<number> {
  const olderThan = new Date(now.getTime() - STALE_MINUTES * MINUTE_MS);
  let total = 0;
  for (;;) {
    const count = await repo.expireStale(now, olderThan, 500);
    total += count;
    if (count < 500) return total;
  }
}
