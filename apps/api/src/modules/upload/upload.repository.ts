import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../../db/client";
import { uploads, type UploadRow } from "../../db/schema";

/** Repository layer: database queries only. */

export async function insertUpload(values: typeof uploads.$inferInsert): Promise<UploadRow> {
  const rows = await db.insert(uploads).values(values).returning();
  const row = rows[0];
  if (!row) throw new Error("Insert into uploads returned no row");
  return row;
}

export async function findUpload(id: string): Promise<UploadRow | undefined> {
  const rows = await db.select().from(uploads).where(eq(uploads.id, id)).limit(1);
  return rows[0];
}

export async function findUploads(ids: string[]): Promise<UploadRow[]> {
  if (ids.length === 0) return [];
  return db.select().from(uploads).where(inArray(uploads.id, ids));
}

/** Pending → ready. Returns the row only if THIS call made the change. */
export async function markReady(id: string): Promise<UploadRow | undefined> {
  const rows = await db
    .update(uploads)
    .set({ status: "ready", completedAt: new Date() })
    .where(and(eq(uploads.id, id), eq(uploads.status, "pending")))
    .returning();
  return rows[0];
}

/** The file now lives at `storageKey` (e.g. a logo moved to the public folder after re-encoding). */
export async function updateStorageKey(id: string, storageKey: string): Promise<void> {
  await db.update(uploads).set({ storageKey }).where(eq(uploads.id, id));
}

export async function markRejected(id: string, reason: string): Promise<void> {
  await db
    .update(uploads)
    .set({ status: "rejected", rejectedReason: reason, completedAt: new Date() })
    .where(and(eq(uploads.id, id), eq(uploads.status, "pending")));
}

/**
 * Attach a ready upload to a record, once. All the conditions are in the
 * UPDATE itself, so two requests racing with the same upload cannot both
 * attach it, and nobody can attach someone else's file.
 */
export async function attach(
  id: string,
  ownerUserId: string,
  purpose: UploadRow["purpose"],
): Promise<UploadRow | undefined> {
  const rows = await db
    .update(uploads)
    .set({ attachedAt: new Date() })
    .where(
      and(
        eq(uploads.id, id),
        eq(uploads.ownerUserId, ownerUserId),
        eq(uploads.purpose, purpose),
        eq(uploads.status, "ready"),
        isNull(uploads.attachedAt),
      ),
    )
    .returning();
  return rows[0];
}
