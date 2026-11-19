import { and, eq } from "drizzle-orm";
import { db } from "../../db/client";
import { chatPhotos, type ChatPhotoRow } from "../../db/schema";

/** Repository layer: database queries only (the chat_photos table). Photos are never deleted. */

export async function insertPhoto(values: { rfqId: string; uploadId: string; senderUserId: string }): Promise<ChatPhotoRow | undefined> {
  const rows = await db.insert(chatPhotos).values(values).onConflictDoNothing({ target: chatPhotos.uploadId }).returning();
  return rows[0];
}

/** The photo, only if it was sent in this request's conversation. */
export async function findPhoto(rfqId: string, uploadId: string): Promise<ChatPhotoRow | undefined> {
  const rows = await db
    .select()
    .from(chatPhotos)
    .where(and(eq(chatPhotos.rfqId, rfqId), eq(chatPhotos.uploadId, uploadId)))
    .limit(1);
  return rows[0];
}
