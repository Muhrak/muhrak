import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../db/client";
import { quotationItems, quotations, type QuotationItemRow, type QuotationRow } from "../../db/schema";
import type { QuoteStatus } from "../../schemas";

/** Repository layer: database queries only (the quotations and quotation_items tables). No business rules. */

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export function inTransaction<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(work);
}

export type NewQuotation = Omit<typeof quotations.$inferInsert, "id" | "number" | "status" | "closedAt" | "createdAt" | "updatedAt"> & { at: Date };
export type NewQuotationItem = Omit<typeof quotationItems.$inferInsert, "quotationId">;

export async function findQuote(id: string): Promise<QuotationRow | undefined> {
  const rows = await db.select().from(quotations).where(eq(quotations.id, id)).limit(1);
  return rows[0];
}

/** The seller's quotation made with this form key (double submit), inside or outside a transaction. */
export async function findByKey(sellerUserId: string, quoteKey: string, tx?: Tx): Promise<QuotationRow | undefined> {
  const rows = await (tx ?? db)
    .select()
    .from(quotations)
    .where(and(eq(quotations.sellerUserId, sellerUserId), eq(quotations.quoteKey, quoteKey)))
    .limit(1);
  return rows[0];
}

export async function countForRfq(tx: Tx, rfqId: string): Promise<number> {
  const rows = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(quotations)
    .where(eq(quotations.rfqId, rfqId));
  return rows[0]?.count ?? 0;
}

/** The request's active quotation becomes "superseded" (a revision replaces it). Returns its id, if there was one. */
export async function supersedeActive(tx: Tx, rfqId: string, at: Date): Promise<string | undefined> {
  const rows = await tx
    .update(quotations)
    .set({ status: "superseded", closedAt: at, updatedAt: at })
    .where(and(eq(quotations.rfqId, rfqId), eq(quotations.status, "active")))
    .returning({ id: quotations.id });
  return rows[0]?.id;
}

/** Undefined when the form key was already used (another request raced with the same key). */
export async function insertQuote(tx: Tx, values: NewQuotation): Promise<QuotationRow | undefined> {
  const { at, ...fields } = values;
  const rows = await tx
    .insert(quotations)
    .values({ ...fields, createdAt: at, updatedAt: at })
    .onConflictDoNothing({ target: [quotations.sellerUserId, quotations.quoteKey] })
    .returning();
  return rows[0];
}

export async function insertItems(tx: Tx, quotationId: string, items: NewQuotationItem[]): Promise<void> {
  await tx.insert(quotationItems).values(items.map((item) => ({ ...item, quotationId })));
}

/** Items of these quotations, in order. */
export async function listItems(quotationIds: string[]): Promise<QuotationItemRow[]> {
  if (quotationIds.length === 0) return [];
  return db
    .select()
    .from(quotationItems)
    .where(inArray(quotationItems.quotationId, quotationIds))
    .orderBy(asc(quotationItems.quotationId), asc(quotationItems.position));
}

export interface ListCursor {
  at: Date;
  id: string;
}

/** One page of a request's quotations, newest first (keyset; quotations_rfq_created_idx). */
export async function listForRfq(input: { rfqId: string; cursor: ListCursor | null; limit: number }): Promise<QuotationRow[]> {
  return db
    .select()
    .from(quotations)
    .where(
      and(
        eq(quotations.rfqId, input.rfqId),
        input.cursor ? sql`(${quotations.createdAt}, ${quotations.id}) < (${input.cursor.at}, ${input.cursor.id})` : undefined,
      ),
    )
    .orderBy(desc(quotations.createdAt), desc(quotations.id))
    .limit(input.limit);
}

/**
 * Move a quotation between statuses: only from an allowed status, only for
 * its seller, and only while it is still valid. One conditional update, so a
 * double click or two tabs cannot apply it twice.
 */
export async function transition(input: { id: string; sellerUserId: string; from: QuoteStatus[]; to: QuoteStatus; at: Date }): Promise<QuotationRow | undefined> {
  const rows = await db
    .update(quotations)
    .set({ status: input.to, closedAt: input.at, updatedAt: input.at })
    .where(
      and(
        eq(quotations.id, input.id),
        eq(quotations.sellerUserId, input.sellerUserId),
        inArray(quotations.status, input.from),
        sql`${quotations.validUntil} > ${input.at}`,
      ),
    )
    .returning();
  return rows[0];
}

/** Close active quotations past their validity (the expiry sweep). Returns how many. */
export async function expireDue(now: Date, limit: number): Promise<number> {
  const result = await db.execute(sql`
    update ${quotations} set status = 'expired', closed_at = ${now}, updated_at = ${now}
    where id in (
      select id from ${quotations}
      where status = 'active' and valid_until <= ${now}
      order by valid_until
      limit ${limit}
      for update skip locked
    )
  `);
  return result.rowCount ?? 0;
}
