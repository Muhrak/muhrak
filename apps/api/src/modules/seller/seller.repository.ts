import { and, asc, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "../../db/client";
import {
  sellerDocuments,
  sellerProfiles,
  sellerProfileUpdates,
  sellerVerificationEvents,
  type SellerDocumentRow,
  type SellerProfileRow,
  type SellerProfileUpdateRow,
} from "../../db/schema";

/** Repository layer: database queries only. No business rules. */

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
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

/** In force: not replaced, and not an update still waiting for review. */
const inForce = and(isNull(sellerDocuments.supersededAt), eq(sellerDocuments.isUpdate, false));
/** Open updates of a verified seller: waiting for review, or rejected until the seller sends another. */
const openUpdate = and(isNull(sellerDocuments.supersededAt), eq(sellerDocuments.isUpdate, true));

/** The seller's documents in force (one per type at most), oldest first. */
export async function findCurrentDocuments(sellerUserId: string, ex: Executor = db): Promise<SellerDocumentRow[]> {
  return ex
    .select()
    .from(sellerDocuments)
    .where(and(eq(sellerDocuments.sellerUserId, sellerUserId), inForce))
    .orderBy(asc(sellerDocuments.createdAt));
}

/** A verified seller's open document updates (one per type at most), oldest first. */
export async function findOpenDocumentUpdates(sellerUserId: string, ex: Executor = db): Promise<SellerDocumentRow[]> {
  return ex
    .select()
    .from(sellerDocuments)
    .where(and(eq(sellerDocuments.sellerUserId, sellerUserId), openUpdate))
    .orderBy(asc(sellerDocuments.createdAt));
}

/** Close the open update of this type (a newer file replaces it). Kept for history. */
export async function supersedeOpenDocumentUpdate(tx: Tx, sellerUserId: string, type: SellerDocumentRow["type"], at: Date): Promise<void> {
  await tx
    .update(sellerDocuments)
    .set({ supersededAt: at })
    .where(and(eq(sellerDocuments.sellerUserId, sellerUserId), eq(sellerDocuments.type, type), openUpdate));
}

/** Decide on one open, still pending document update. Returns the row, or undefined if it is no longer waiting. */
export async function reviewDocumentUpdate(
  tx: Tx,
  input: { id: string; sellerUserId: string; status: "approved" | "rejected"; rejectionReason: string | null; reviewedBy: string; reviewedAt: Date },
): Promise<SellerDocumentRow | undefined> {
  const rows = await tx
    .update(sellerDocuments)
    .set({
      status: input.status,
      rejectionReason: input.rejectionReason,
      reviewedBy: input.reviewedBy,
      reviewedAt: input.reviewedAt,
      // An approved update becomes the document in force (the caller has replaced the old one first).
      ...(input.status === "approved" ? { isUpdate: false } : {}),
    })
    .where(
      and(
        eq(sellerDocuments.id, input.id),
        eq(sellerDocuments.sellerUserId, input.sellerUserId),
        openUpdate,
        eq(sellerDocuments.status, "pending"),
      ),
    )
    .returning();
  return rows[0];
}

// ---------------------------------------------------------------- profile updates (verified sellers)

export async function findOpenProfileUpdate(sellerUserId: string, ex: Executor = db): Promise<SellerProfileUpdateRow | undefined> {
  const rows = await ex
    .select()
    .from(sellerProfileUpdates)
    .where(and(eq(sellerProfileUpdates.sellerUserId, sellerUserId), isNull(sellerProfileUpdates.supersededAt)))
    .limit(1);
  return rows[0];
}

export async function supersedeOpenProfileUpdate(tx: Tx, sellerUserId: string, at: Date): Promise<void> {
  await tx
    .update(sellerProfileUpdates)
    .set({ supersededAt: at })
    .where(and(eq(sellerProfileUpdates.sellerUserId, sellerUserId), isNull(sellerProfileUpdates.supersededAt)));
}

export async function insertProfileUpdate(tx: Tx, values: typeof sellerProfileUpdates.$inferInsert): Promise<SellerProfileUpdateRow> {
  const rows = await tx.insert(sellerProfileUpdates).values(values).returning();
  const row = rows[0];
  if (!row) throw new Error("Seller profile update insert returned no row");
  return row;
}

/**
 * Decide on the open, still pending profile update. An approved one is
 * closed at once (its values move into the profile); a rejected one stays
 * open so the seller sees why.
 */
export async function reviewProfileUpdate(
  tx: Tx,
  input: { id: string; sellerUserId: string; status: "approved" | "rejected"; rejectionReason: string | null; reviewedBy: string; reviewedAt: Date },
): Promise<SellerProfileUpdateRow | undefined> {
  const rows = await tx
    .update(sellerProfileUpdates)
    .set({
      status: input.status,
      rejectionReason: input.rejectionReason,
      reviewedBy: input.reviewedBy,
      reviewedAt: input.reviewedAt,
      ...(input.status === "approved" ? { supersededAt: input.reviewedAt } : {}),
    })
    .where(
      and(
        eq(sellerProfileUpdates.id, input.id),
        eq(sellerProfileUpdates.sellerUserId, input.sellerUserId),
        isNull(sellerProfileUpdates.supersededAt),
        eq(sellerProfileUpdates.status, "pending"),
      ),
    )
    .returning();
  return rows[0];
}

/** When the oldest update still waiting for review was sent (document or profile), or null. */
export async function oldestPendingUpdateAt(tx: Tx, sellerUserId: string): Promise<Date | null> {
  const docs = await tx
    .select({ at: sql<string | null>`min(${sellerDocuments.createdAt})` })
    .from(sellerDocuments)
    .where(and(eq(sellerDocuments.sellerUserId, sellerUserId), openUpdate, eq(sellerDocuments.status, "pending")));
  const profile = await tx
    .select({ at: sql<string | null>`min(${sellerProfileUpdates.createdAt})` })
    .from(sellerProfileUpdates)
    .where(
      and(
        eq(sellerProfileUpdates.sellerUserId, sellerUserId),
        isNull(sellerProfileUpdates.supersededAt),
        eq(sellerProfileUpdates.status, "pending"),
      ),
    );
  const dates = [docs[0]?.at, profile[0]?.at].filter((value): value is string => Boolean(value)).map((value) => new Date(value).getTime());
  return dates.length ? new Date(Math.min(...dates)) : null;
}

/** True while a bank account proof update waits for review (payouts must wait too). */
export async function hasPendingBankProofUpdate(sellerUserId: string): Promise<boolean> {
  const rows = await db
    .select({ id: sellerDocuments.id })
    .from(sellerDocuments)
    .where(
      and(
        eq(sellerDocuments.sellerUserId, sellerUserId),
        eq(sellerDocuments.type, "bank_proof"),
        openUpdate,
        eq(sellerDocuments.status, "pending"),
      ),
    )
    .limit(1);
  return rows.length > 0;
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
    .where(and(eq(sellerDocuments.sellerUserId, sellerUserId), eq(sellerDocuments.type, type), inForce));
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
  queue?: "updates";
  cursor: ListCursor | null;
  limit: number;
}): Promise<SellerProfileRow[]> {
  const { status, cursor, limit } = input;
  const id = sellerProfiles.userId;
  if (input.queue === "updates") {
    // Verified sellers with an update waiting, oldest first (seller_profiles_update_queue_idx).
    const at = sellerProfiles.updateSubmittedAt;
    return db
      .select()
      .from(sellerProfiles)
      .where(and(sql`${at} is not null`, cursor ? sql`(${at}, ${id}) > (${cursor.at}, ${cursor.userId})` : undefined))
      .orderBy(asc(at), asc(id))
      .limit(limit);
  }
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
    .where(and(inArray(sellerDocuments.sellerUserId, sellerUserIds), inForce));
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
        inForce,
      ),
    )
    .returning({ id: sellerDocuments.id });
  return rows.length === 1;
}

// ---------------------------------------------------------------- public directory

/** User ids of every verified (approved) seller. */
export async function findVerifiedSellerIds(): Promise<string[]> {
  const rows = await db
    .select({ userId: sellerProfiles.userId })
    .from(sellerProfiles)
    .where(eq(sellerProfiles.verificationStatus, "approved"));
  return rows.map((row) => row.userId);
}

/** Profiles of these sellers, whatever their verification status. */
export async function findProfilesByIds(userIds: string[]): Promise<SellerProfileRow[]> {
  if (userIds.length === 0) return [];
  return db.select().from(sellerProfiles).where(inArray(sellerProfiles.userId, userIds));
}

export async function findVerifiedProfile(userId: string): Promise<SellerProfileRow | undefined> {
  const rows = await db
    .select()
    .from(sellerProfiles)
    .where(and(eq(sellerProfiles.userId, userId), eq(sellerProfiles.verificationStatus, "approved")))
    .limit(1);
  return rows[0];
}

export interface VerifiedProfileFilter {
  /** Only these sellers (e.g. those with products in a category); null = all. */
  ids: string[] | null;
  /** Text search on company name and brands, OR any of `alsoIds` (product matches). */
  q: { pattern: string; alsoIds: string[] } | null;
}

function verifiedWhere(filter: VerifiedProfileFilter) {
  return and(
    eq(sellerProfiles.verificationStatus, "approved"),
    filter.ids ? (filter.ids.length > 0 ? inArray(sellerProfiles.userId, filter.ids) : sql`false`) : undefined,
    filter.q
      ? or(
          ilike(sellerProfiles.companyName, filter.q.pattern),
          sql`exists (select 1 from unnest(${sellerProfiles.brands}) as brand where brand ilike ${filter.q.pattern})`,
          filter.q.alsoIds.length > 0 ? inArray(sellerProfiles.userId, filter.q.alsoIds) : undefined,
        )
      : undefined,
  );
}

/** One page of verified sellers (numbered pages, as in the Figma directory). */
export async function listVerifiedProfiles(
  filter: VerifiedProfileFilter & { sort: "name" | "newest"; offset: number; limit: number },
): Promise<SellerProfileRow[]> {
  return db
    .select()
    .from(sellerProfiles)
    .where(verifiedWhere(filter))
    .orderBy(
      ...(filter.sort === "newest"
        ? [desc(sellerProfiles.reviewedAt), asc(sellerProfiles.userId)]
        : [asc(sellerProfiles.companyName), asc(sellerProfiles.userId)]),
    )
    .offset(filter.offset)
    .limit(filter.limit);
}

export async function countVerifiedProfiles(filter: VerifiedProfileFilter): Promise<number> {
  const rows = await db.select({ count: sql<number>`count(*)::int` }).from(sellerProfiles).where(verifiedWhere(filter));
  return rows[0]?.count ?? 0;
}

/** How many verified sellers have an update waiting, and since when the oldest. */
export async function countUpdateQueue(): Promise<{ count: number; oldest: Date | null }> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int`, oldest: sql<string | null>`min(${sellerProfiles.updateSubmittedAt})` })
    .from(sellerProfiles)
    .where(sql`${sellerProfiles.updateSubmittedAt} is not null`);
  const row = rows[0];
  return { count: row?.count ?? 0, oldest: row?.oldest ? new Date(row.oldest) : null };
}
