import { and, desc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { db } from "../../db/client";
import { rfqBuyerPhotos, rfqs, type RfqRow } from "../../db/schema";
import type { RfqListFilter, RfqStatus } from "../../schemas";

/** Repository layer: database queries only (the rfqs and rfq_buyer_photos tables). No business rules. */

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export function inTransaction<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(work);
}

export type NewRfq = Omit<
  typeof rfqs.$inferInsert,
  "id" | "number" | "status" | "sellerSeenAt" | "declineReason" | "closedAt" | "chatOpenedAt" | "createdAt" | "updatedAt"
> & { at: Date };

/**
 * Insert a request. Returns undefined when it collides with a unique rule
 * (the same request key, or an open request for the same product), so the
 * service can tell which and answer accordingly.
 */
/** The buyer's photos 2-4 of a new request, in the same transaction as the request. */
export async function insertMoreBuyerPhotos(tx: Tx, rfqId: string, uploadIds: string[]): Promise<void> {
  if (uploadIds.length === 0) return;
  await tx.insert(rfqBuyerPhotos).values(uploadIds.map((uploadId, index) => ({ rfqId, uploadId, position: index + 1 })));
}

/** The buyer's photos 2-4 of a request (upload ids, in order). */
export async function listMoreBuyerPhotos(rfqId: string): Promise<string[]> {
  const rows = await db
    .select({ uploadId: rfqBuyerPhotos.uploadId })
    .from(rfqBuyerPhotos)
    .where(eq(rfqBuyerPhotos.rfqId, rfqId))
    .orderBy(rfqBuyerPhotos.position);
  return rows.map((row) => row.uploadId);
}

export async function insertRfq(tx: Tx, values: NewRfq): Promise<RfqRow | undefined> {
  const { at, ...fields } = values;
  const rows = await tx
    .insert(rfqs)
    .values({ ...fields, createdAt: at, updatedAt: at })
    .onConflictDoNothing()
    .returning();
  return rows[0];
}

/**
 * Expire this buyer's open request for the product if its time is up (the
 * sweep may not have run yet), so it does not block a new request.
 */
export async function expireStaleForProduct(tx: Tx, input: { buyerUserId: string; productId: string; at: Date }): Promise<void> {
  await tx
    .update(rfqs)
    .set({ status: "expired", closedAt: input.at, updatedAt: input.at })
    .where(
      and(
        eq(rfqs.buyerUserId, input.buyerUserId),
        eq(rfqs.productId, input.productId),
        eq(rfqs.status, "open"),
        sql`${rfqs.expiresAt} <= ${input.at}`,
      ),
    );
}

export async function findByRequestKey(buyerUserId: string, requestKey: string): Promise<RfqRow | undefined> {
  const rows = await db
    .select()
    .from(rfqs)
    .where(and(eq(rfqs.buyerUserId, buyerUserId), eq(rfqs.requestKey, requestKey)))
    .limit(1);
  return rows[0];
}

export async function findRfq(id: string): Promise<RfqRow | undefined> {
  const rows = await db.select().from(rfqs).where(eq(rfqs.id, id)).limit(1);
  return rows[0];
}

/** Open (not yet expired) requests of a buyer: the abuse cap. */
export async function countOpenForBuyer(buyerUserId: string, now: Date): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(rfqs)
    .where(and(eq(rfqs.buyerUserId, buyerUserId), eq(rfqs.status, "open"), sql`${rfqs.expiresAt} > ${now}`));
  return rows[0]?.count ?? 0;
}

const CLOSED: RfqStatus[] = ["declined", "cancelled", "expired"];

function filterCondition(filter: RfqListFilter): SQL | undefined {
  switch (filter) {
    case "all":
      return undefined;
    case "open":
      return eq(rfqs.status, "open");
    case "quoted":
      return eq(rfqs.status, "quoted");
    case "closed":
      return inArray(rfqs.status, CLOSED);
  }
}

export interface ListCursor {
  at: Date;
  id: string;
}

/**
 * One page of a buyer's or seller's requests, newest first (keyset on
 * created_at, id; backed by rfqs_buyer_created_idx / rfqs_seller_*_idx).
 */
export async function listRfqs(input: {
  side: "buyer" | "seller";
  userId: string;
  filter: RfqListFilter;
  cursor: ListCursor | null;
  limit: number;
}): Promise<RfqRow[]> {
  const owner = input.side === "buyer" ? eq(rfqs.buyerUserId, input.userId) : eq(rfqs.sellerUserId, input.userId);
  return db
    .select()
    .from(rfqs)
    .where(
      and(
        owner,
        filterCondition(input.filter),
        input.cursor ? sql`(${rfqs.createdAt}, ${rfqs.id}) < (${input.cursor.at}, ${input.cursor.id})` : undefined,
      ),
    )
    .orderBy(desc(rfqs.createdAt), desc(rfqs.id))
    .limit(input.limit);
}

/** Counts for the list tabs, plus requests the seller has not opened yet. */
export async function countRfqs(side: "buyer" | "seller", userId: string): Promise<Record<RfqListFilter, number> & { unseen: number }> {
  const owner = side === "buyer" ? eq(rfqs.buyerUserId, userId) : eq(rfqs.sellerUserId, userId);
  const rows = await db
    .select({
      all: sql<number>`count(*)::int`,
      open: sql<number>`count(*) filter (where ${rfqs.status} = 'open')::int`,
      quoted: sql<number>`count(*) filter (where ${rfqs.status} = 'quoted')::int`,
      closed: sql<number>`count(*) filter (where ${rfqs.status} in ('declined','cancelled','expired'))::int`,
      unseen: sql<number>`count(*) filter (where ${rfqs.status} = 'open' and ${rfqs.sellerSeenAt} is null)::int`,
    })
    .from(rfqs)
    .where(owner);
  return rows[0] ?? { all: 0, open: 0, quoted: 0, closed: 0, unseen: 0 };
}

/**
 * Move a request between statuses only from an allowed status, only for its
 * owner, and (unless it is the expiry itself) only before it expires. One
 * conditional update: a double click or two tabs cannot apply it twice.
 */
export async function transition(input: {
  id: string;
  owner: { buyerUserId: string } | { sellerUserId: string };
  from: RfqStatus[];
  to: RfqStatus;
  at: Date;
  declineReason?: string | null;
}): Promise<RfqRow | undefined> {
  const owner = "buyerUserId" in input.owner ? eq(rfqs.buyerUserId, input.owner.buyerUserId) : eq(rfqs.sellerUserId, input.owner.sellerUserId);
  const closes = CLOSED.includes(input.to);
  const rows = await db
    .update(rfqs)
    .set({
      status: input.to,
      updatedAt: input.at,
      ...(closes ? { closedAt: input.at } : {}),
      ...(input.to === "declined" ? { declineReason: input.declineReason ?? null } : {}),
    })
    .where(and(eq(rfqs.id, input.id), owner, inArray(rfqs.status, input.from), sql`${rfqs.expiresAt} > ${input.at}`))
    .returning();
  return rows[0];
}

/** First time the seller opens a request (the unread dot). No-op afterwards. */
export async function markSeen(id: string, sellerUserId: string, at: Date): Promise<RfqRow | undefined> {
  const rows = await db
    .update(rfqs)
    .set({ sellerSeenAt: at })
    .where(and(eq(rfqs.id, id), eq(rfqs.sellerUserId, sellerUserId), isNull(rfqs.sellerSeenAt)))
    .returning();
  return rows[0];
}

/** Close open requests whose time is up (the expiry sweep). Returns how many. */
export async function expireDue(now: Date, limit: number): Promise<number> {
  const result = await db.execute(sql`
    update ${rfqs} set status = 'expired', closed_at = ${now}, updated_at = ${now}
    where id in (
      select id from ${rfqs}
      where status = 'open' and expires_at <= ${now}
      order by expires_at
      limit ${limit}
      for update skip locked
    )
  `);
  return result.rowCount ?? 0;
}

// ---------------------------------------------------------------- chat (Day 10)

export async function markChatOpened(id: string, at: Date): Promise<void> {
  await db.update(rfqs).set({ chatOpenedAt: at }).where(and(eq(rfqs.id, id), isNull(rfqs.chatOpenedAt)));
}

/** This user's newest requests whose chat is not open yet (requests sent before chat existed, or a failed job). */
export async function listWithoutChat(side: "buyer" | "seller", userId: string, limit: number): Promise<string[]> {
  const owner = side === "buyer" ? eq(rfqs.buyerUserId, userId) : eq(rfqs.sellerUserId, userId);
  const rows = await db
    .select({ id: rfqs.id })
    .from(rfqs)
    .where(and(owner, isNull(rfqs.chatOpenedAt)))
    .orderBy(desc(rfqs.createdAt))
    .limit(limit);
  return rows.map((row) => row.id);
}

