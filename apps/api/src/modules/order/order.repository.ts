import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../db/client";
import { orderEvents, orders, type OrderRow } from "../../db/schema";
import type { OrderStatus } from "../../schemas";

/** Repository layer: database queries only (the orders and order_events tables). No business rules. */

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export function inTransaction<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(work);
}

export type NewOrder = Omit<typeof orders.$inferInsert, "id" | "number" | "status" | "paidAt" | "cancelledAt" | "cancelReason" | "createdAt" | "updatedAt"> & { at: Date };

export async function findOrder(id: string, tx?: Tx): Promise<OrderRow | undefined> {
  const rows = await (tx ?? db).select().from(orders).where(eq(orders.id, id)).limit(1);
  return rows[0];
}

/** The buyer's order made with this form key (double submit), inside or outside a transaction. */
export async function findByKey(buyerUserId: string, orderKey: string, tx?: Tx): Promise<OrderRow | undefined> {
  const rows = await (tx ?? db)
    .select()
    .from(orders)
    .where(and(eq(orders.buyerUserId, buyerUserId), eq(orders.orderKey, orderKey)))
    .limit(1);
  return rows[0];
}

/** The live (not cancelled) order of a quotation, if any. */
export async function findLiveForQuotation(quotationId: string, tx?: Tx): Promise<OrderRow | undefined> {
  const rows = await (tx ?? db)
    .select()
    .from(orders)
    .where(and(eq(orders.quotationId, quotationId), sql`${orders.status} <> 'cancelled'`))
    .limit(1);
  return rows[0];
}

/** Undefined when the form key was already used (a twin submit raced in). */
export async function insertOrder(tx: Tx, values: NewOrder): Promise<OrderRow | undefined> {
  const { at, ...fields } = values;
  const rows = await tx
    .insert(orders)
    .values({ ...fields, createdAt: at, updatedAt: at })
    .onConflictDoNothing({ target: [orders.buyerUserId, orders.orderKey] })
    .returning();
  return rows[0];
}

export async function insertEvent(
  tx: Tx,
  input: { orderId: string; from: OrderStatus | null; to: OrderStatus; actor: "buyer" | "seller" | "admin" | "system"; actorUserId: string | null; note?: string | null; at: Date },
): Promise<void> {
  await tx.insert(orderEvents).values({
    orderId: input.orderId,
    fromStatus: input.from,
    toStatus: input.to,
    actor: input.actor,
    actorUserId: input.actorUserId,
    note: input.note ?? null,
    createdAt: input.at,
  });
}

/** Awaiting payment -> paid (only the payment webhook does this). The UPDATE locks the row until the transaction ends. */
export async function markPaid(tx: Tx, input: { id: string; at: Date }): Promise<OrderRow | undefined> {
  const rows = await tx
    .update(orders)
    .set({ status: "paid", paidAt: input.at, updatedAt: input.at })
    .where(and(eq(orders.id, input.id), eq(orders.status, "awaiting_payment")))
    .returning();
  return rows[0];
}

/** Awaiting payment -> cancelled, for this buyer (buyer cancels). */
export async function cancelByBuyer(tx: Tx, input: { id: string; buyerUserId: string; reason: string; at: Date }): Promise<OrderRow | undefined> {
  const rows = await tx
    .update(orders)
    .set({ status: "cancelled", cancelledAt: input.at, cancelReason: input.reason, updatedAt: input.at })
    .where(and(eq(orders.id, input.id), eq(orders.buyerUserId, input.buyerUserId), eq(orders.status, "awaiting_payment")))
    .returning();
  return rows[0];
}

/** Unpaid orders past their time -> cancelled, a batch at a time. Safe with several API copies (SKIP LOCKED). */
export async function cancelDue(tx: Tx, input: { now: Date; reason: string; limit: number }): Promise<{ id: string; quotationId: string }[]> {
  const result = await tx.execute(sql`
    update ${orders} set status = 'cancelled', cancelled_at = ${input.now}, cancel_reason = ${input.reason}, updated_at = ${input.now}
    where id in (
      select id from ${orders}
      where status = 'awaiting_payment' and payment_due_at <= ${input.now}
      order by payment_due_at
      limit ${input.limit}
      for update skip locked
    )
    returning id, quotation_id
  `);
  return (result.rows as { id: string; quotation_id: string }[]).map((row) => ({ id: row.id, quotationId: row.quotation_id }));
}

export interface ListCursor {
  at: Date;
  id: string;
}

/** One page of a buyer's or seller's orders, newest first (keyset; orders_buyer_created_idx / orders_seller_created_idx). */
export async function listFor(input: { side: "buyer" | "seller"; userId: string; cursor: ListCursor | null; limit: number }): Promise<OrderRow[]> {
  const owner = input.side === "buyer" ? orders.buyerUserId : orders.sellerUserId;
  return db
    .select()
    .from(orders)
    .where(and(eq(owner, input.userId), input.cursor ? sql`(${orders.createdAt}, ${orders.id}) < (${input.cursor.at}, ${input.cursor.id})` : undefined))
    .orderBy(desc(orders.createdAt), desc(orders.id))
    .limit(input.limit);
}

/** The buyer's newest order (for the address on the next one). */
export async function latestForBuyer(buyerUserId: string): Promise<OrderRow | undefined> {
  const rows = await db.select().from(orders).where(eq(orders.buyerUserId, buyerUserId)).orderBy(desc(orders.createdAt), desc(orders.id)).limit(1);
  return rows[0];
}

export async function findMany(ids: string[]): Promise<OrderRow[]> {
  if (ids.length === 0) return [];
  return db.select().from(orders).where(inArray(orders.id, ids));
}
