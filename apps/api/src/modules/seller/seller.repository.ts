import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "../../db/client";
import {
  sellerDocuments,
  sellerProfiles,
  sellerVerificationEvents,
  type SellerDocumentRow,
  type SellerProfileRow,
} from "../../db/schema";

/** Repository layer: database queries only. No business rules. */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type Executor = typeof db | Tx;

/** Run `work` in one database transaction: all of it is saved, or none of it. */
export function inTransaction<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(work);
}

export async function findProfile(userId: string, ex: Executor = db): Promise<SellerProfileRow | undefined> {
  const rows = await ex.select().from(sellerProfiles).where(eq(sellerProfiles.userId, userId)).limit(1);
  return rows[0];
}

/** Read the profile and lock its row until the transaction ends, so two writes cannot interleave. */
export async function lockProfile(tx: Tx, userId: string): Promise<SellerProfileRow | undefined> {
  const rows = await tx.select().from(sellerProfiles).where(eq(sellerProfiles.userId, userId)).for("update").limit(1);
  return rows[0];
}

/**
 * Create the profile. Returns undefined if another request created it first
 * (ON CONFLICT DO NOTHING), so two first saves racing cannot overwrite each other.
 */
export async function insertProfile(
  tx: Tx,
  values: typeof sellerProfiles.$inferInsert,
): Promise<SellerProfileRow | undefined> {
  const rows = await tx.insert(sellerProfiles).values(values).onConflictDoNothing().returning();
  return rows[0];
}

export async function updateProfile(
  tx: Tx,
  userId: string,
  values: Partial<typeof sellerProfiles.$inferInsert>,
): Promise<SellerProfileRow> {
  const rows = await tx
    .update(sellerProfiles)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(sellerProfiles.userId, userId))
    .returning();
  const row = rows[0];
  if (!row) throw new Error("Seller profile update returned no row");
  return row;
}

export async function insertVerificationEvent(tx: Tx, values: typeof sellerVerificationEvents.$inferInsert): Promise<void> {
  await tx.insert(sellerVerificationEvents).values(values);
}

/** The seller's current documents (one per type at most), oldest first. */
export async function findCurrentDocuments(sellerUserId: string, ex: Executor = db): Promise<SellerDocumentRow[]> {
  return ex
    .select()
    .from(sellerDocuments)
    .where(and(eq(sellerDocuments.sellerUserId, sellerUserId), isNull(sellerDocuments.supersededAt)))
    .orderBy(asc(sellerDocuments.createdAt));
}

/** One document, only if it belongs to this seller. */
export async function findOwnDocument(id: string, sellerUserId: string): Promise<SellerDocumentRow | undefined> {
  const rows = await db
    .select()
    .from(sellerDocuments)
    .where(and(eq(sellerDocuments.id, id), eq(sellerDocuments.sellerUserId, sellerUserId)))
    .limit(1);
  return rows[0];
}

/** Mark the current document of this type as replaced (kept for history, never deleted). */
export async function supersedeCurrentDocument(
  tx: Tx,
  sellerUserId: string,
  type: SellerDocumentRow["type"],
): Promise<void> {
  await tx
    .update(sellerDocuments)
    .set({ supersededAt: new Date() })
    .where(
      and(
        eq(sellerDocuments.sellerUserId, sellerUserId),
        eq(sellerDocuments.type, type),
        isNull(sellerDocuments.supersededAt),
      ),
    );
}

export async function insertDocument(tx: Tx, values: typeof sellerDocuments.$inferInsert): Promise<SellerDocumentRow> {
  const rows = await tx.insert(sellerDocuments).values(values).returning();
  const row = rows[0];
  if (!row) throw new Error("Seller document insert returned no row");
  return row;
}
