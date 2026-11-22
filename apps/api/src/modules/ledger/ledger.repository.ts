import { and, eq, sql } from "drizzle-orm";
import { db } from "../../db/client";
import { ledgerEntries, type LedgerEntryRow } from "../../db/schema";

/** Repository layer: database queries only (the ledger_entries table, append-only). No business rules. */

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type NewLedgerEntry = Omit<typeof ledgerEntries.$inferInsert, "id" | "createdAt"> & { at: Date };

/** Insert the rows of one movement. Never updates or deletes (the database refuses both). */
export async function insertEntries(tx: Tx, rows: NewLedgerEntry[]): Promise<void> {
  if (rows.length === 0) return;
  await tx.insert(ledgerEntries).values(rows.map(({ at, ...fields }) => ({ ...fields, createdAt: at })));
}

/** True when this payment is already in the ledger. */
export async function hasPaymentEntries(tx: Tx, paymentId: string): Promise<boolean> {
  const rows = await tx
    .select({ id: ledgerEntries.id })
    .from(ledgerEntries)
    .where(and(eq(ledgerEntries.paymentId, paymentId), eq(ledgerEntries.kind, "payment")))
    .limit(1);
  return rows.length > 0;
}

/** What Muhrak owes a seller: the sum of their rows (ledger_seller_idx). */
export async function sellerBalance(sellerUserId: string): Promise<number> {
  const rows = await db
    .select({ total: sql<string>`coalesce(sum(${ledgerEntries.amount}), 0)::text` })
    .from(ledgerEntries)
    .where(and(eq(ledgerEntries.account, "seller"), eq(ledgerEntries.sellerUserId, sellerUserId)));
  return Number(rows[0]?.total ?? 0);
}

export async function listForOrder(orderId: string): Promise<LedgerEntryRow[]> {
  return db.select().from(ledgerEntries).where(eq(ledgerEntries.orderId, orderId)).orderBy(ledgerEntries.createdAt);
}
