import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
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

// ---------------------------------------------------------------- admin queries

export interface ListCursor {
  at: Date;
  userId: string;
}

/**
 * One page of seller profiles for the admin console (keyset pagination,
 * each order backed by an index):
 * - pending: oldest submission first (the review queue),
 * - another status: most recently changed first,
 * - no status: newest seller first.
 */
export async function listProfiles(input: {
  status?: SellerProfileRow["verificationStatus"];
  cursor: ListCursor | null;
  limit: number;
}): Promise<SellerProfileRow[]> {
  const { status, cursor, limit } = input;
  const id = sellerProfiles.userId;
  if (status === "pending") {
    const at = sellerProfiles.submittedAt;
    return db
      .select()
      .from(sellerProfiles)
      .where(and(eq(sellerProfiles.verificationStatus, "pending"), cursor ? sql`(${at}, ${id}) > (${cursor.at}, ${cursor.userId})` : undefined))
      .orderBy(asc(at), asc(id))
      .limit(limit);
  }
  const at = status ? sellerProfiles.updatedAt : sellerProfiles.createdAt;
  return db
    .select()
    .from(sellerProfiles)
    .where(
      and(
        status ? eq(sellerProfiles.verificationStatus, status) : undefined,
        cursor ? sql`(${at}, ${id}) < (${cursor.at}, ${cursor.userId})` : undefined,
      ),
    )
    .orderBy(desc(at), desc(id))
    .limit(limit);
}

export async function countProfilesByStatus(): Promise<{ status: SellerProfileRow["verificationStatus"]; count: number }[]> {
  return db
    .select({ status: sellerProfiles.verificationStatus, count: sql<number>`count(*)::int` })
    .from(sellerProfiles)
    .groupBy(sellerProfiles.verificationStatus);
}

export async function findOldestPendingSubmission(): Promise<Date | null> {
  const rows = await db
    .select({ at: sql<Date | null>`min(${sellerProfiles.submittedAt})` })
    .from(sellerProfiles)
    .where(eq(sellerProfiles.verificationStatus, "pending"));
  const value = rows[0]?.at;
  return value ? new Date(value) : null;
}

/** Current documents of several sellers (for the list's "documents" column). */
export async function findCurrentDocumentsForSellers(sellerUserIds: string[]): Promise<SellerDocumentRow[]> {
  if (sellerUserIds.length === 0) return [];
  return db
    .select()
    .from(sellerDocuments)
    .where(and(inArray(sellerDocuments.sellerUserId, sellerUserIds), isNull(sellerDocuments.supersededAt)));
}

/** A seller's verification history, newest first. */
export async function findVerificationEvents(sellerUserId: string, limit = 50) {
  return db
    .select()
    .from(sellerVerificationEvents)
    .where(eq(sellerVerificationEvents.sellerUserId, sellerUserId))
    .orderBy(desc(sellerVerificationEvents.createdAt))
    .limit(limit);
}

/** Record the admin's decision on one current document. Returns false if it is no longer current. */
export async function reviewDocument(
  tx: Tx,
  input: { id: string; sellerUserId: string; status: "approved" | "rejected"; rejectionReason: string | null; reviewedBy: string; reviewedAt: Date },
): Promise<boolean> {
  const rows = await tx
    .update(sellerDocuments)
    .set({ status: input.status, rejectionReason: input.rejectionReason, reviewedBy: input.reviewedBy, reviewedAt: input.reviewedAt })
    .where(
      and(
        eq(sellerDocuments.id, input.id),
        eq(sellerDocuments.sellerUserId, input.sellerUserId),
        isNull(sellerDocuments.supersededAt),
      ),
    )
    .returning({ id: sellerDocuments.id });
  return rows.length === 1;
}
