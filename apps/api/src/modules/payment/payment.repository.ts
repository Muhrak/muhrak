import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../db/client";
import { paymentEvents, payments, type PaymentRow } from "../../db/schema";
import type { PaymentStatus } from "../../schemas";

/** Repository layer: database queries only (the payments and payment_events tables). No business rules. */

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export function inTransaction<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(work);
}

export async function findPayment(id: string, tx?: Tx): Promise<PaymentRow | undefined> {
  const rows = await (tx ?? db).select().from(payments).where(eq(payments.id, id)).limit(1);
  return rows[0];
}

/** Lock a payment row until the transaction ends (webhooks for one payment are applied one at a time). */
export async function lockPayment(tx: Tx, id: string): Promise<PaymentRow | undefined> {
  const rows = await tx.select().from(payments).where(eq(payments.id, id)).for("update");
  return rows[0];
}

export async function findPendingForOrder(orderId: string): Promise<PaymentRow | undefined> {
  const rows = await db
    .select()
    .from(payments)
    .where(and(eq(payments.orderId, orderId), eq(payments.status, "pending")))
    .limit(1);
  return rows[0];
}

/** A new pending attempt. Undefined when the order already has one (unique index; a twin request raced in). */
export async function insertPending(input: { orderId: string; buyerUserId: string; provider: string; currency: string; amount: number; at: Date }): Promise<PaymentRow | undefined> {
  const rows = await db
    .insert(payments)
    .values({
      orderId: input.orderId,
      buyerUserId: input.buyerUserId,
      provider: input.provider,
      currency: input.currency,
      amount: input.amount,
      createdAt: input.at,
      updatedAt: input.at,
    })
    .onConflictDoNothing()
    .returning();
  return rows[0];
}

/** The gateway's checkout for a pending attempt (set once, right after it is made). */
export async function setCheckout(input: { id: string; providerPaymentId: string; checkoutUrl: string; expiresAt: Date; at: Date }): Promise<PaymentRow | undefined> {
  const rows = await db
    .update(payments)
    .set({ providerPaymentId: input.providerPaymentId, checkoutUrl: input.checkoutUrl, checkoutExpiresAt: input.expiresAt, updatedAt: input.at })
    .where(and(eq(payments.id, input.id), eq(payments.status, "pending"), sql`${payments.providerPaymentId} IS NULL`))
    .returning();
  return rows[0];
}

/** Pending -> failed or expired, when it is still pending. */
export async function closePending(input: { id: string; to: "failed" | "expired"; at: Date }, tx?: Tx): Promise<PaymentRow | undefined> {
  const rows = await (tx ?? db)
    .update(payments)
    .set({ status: input.to, updatedAt: input.at })
    .where(and(eq(payments.id, input.id), eq(payments.status, "pending")))
    .returning();
  return rows[0];
}

/** Not yet succeeded -> succeeded (with a refund reason when the money must go back), in the webhook's transaction. */
export async function markSucceeded(tx: Tx, input: { id: string; providerPaymentId: string; refundReason: string | null; at: Date }): Promise<PaymentRow | undefined> {
  const rows = await tx
    .update(payments)
    .set({ status: "succeeded", providerPaymentId: input.providerPaymentId, refundReason: input.refundReason, succeededAt: input.at, updatedAt: input.at })
    .where(and(eq(payments.id, input.id), inArray(payments.status, ["pending", "failed", "expired"] satisfies PaymentStatus[])))
    .returning();
  return rows[0];
}

/** Store a webhook event once. False when this event was stored before (a retry or a replay). */
export async function insertEvent(
  tx: Tx,
  input: { provider: string; eventId: string; type: string; providerPaymentId: string; amount: number; currency: string; at: Date },
): Promise<string | undefined> {
  const rows = await tx
    .insert(paymentEvents)
    .values({ ...input, receivedAt: input.at })
    .onConflictDoNothing({ target: [paymentEvents.provider, paymentEvents.eventId] })
    .returning({ id: paymentEvents.id });
  return rows[0]?.id;
}

export async function finishEvent(tx: Tx, input: { id: string; paymentId: string | null; outcome: string; at: Date }): Promise<void> {
  await tx.update(paymentEvents).set({ paymentId: input.paymentId, outcome: input.outcome, processedAt: input.at }).where(eq(paymentEvents.id, input.id));
}

/** The newest attempt of each of these orders (payments_order_created_idx). */
export async function latestForOrders(orderIds: string[]): Promise<PaymentRow[]> {
  if (orderIds.length === 0) return [];
  return db
    .selectDistinctOn([payments.orderId])
    .from(payments)
    .where(inArray(payments.orderId, orderIds))
    .orderBy(payments.orderId, desc(payments.createdAt));
}

/** Pending attempts whose checkout closed a while ago (the sweep): -> expired. */
export async function expireStale(now: Date, olderThan: Date, limit: number): Promise<number> {
  const result = await db.execute(sql`
    update ${payments} set status = 'expired', updated_at = ${now}
    where id in (
      select id from ${payments}
      where status = 'pending' and coalesce(checkout_expires_at, created_at) < ${olderThan}
      limit ${limit}
      for update skip locked
    )
  `);
  return result.rowCount ?? 0;
}
