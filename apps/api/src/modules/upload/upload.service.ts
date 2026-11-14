import { randomUUID } from "node:crypto";
import { fileTypeFromBuffer } from "file-type";
import {
  UPLOAD_RULES,
  type CreateUploadInput,
  type CreateUploadResponse,
  type FileLink,
  type Role,
  type Upload,
  type UploadContentType,
  type UploadPurpose,
} from "../../schemas";
import type { UploadRow } from "../../db/schema";
import { badRequest, forbidden, notFound } from "../../shared/errors";
import { logger } from "../../shared/logger";
import { hit, tooManyRequests, type Limit } from "../../shared/rate-limit";
import { PhotoRejected, processProductPhoto } from "./photo";
import * as repo from "./upload.repository";
import { getStorage } from "./storage";

/** Product photos never change once written (new photo = new key): cache them for a year. */
const PUBLIC_PHOTO_CACHE = "public, max-age=31536000, immutable";

/** Where a product photo's cleaned copies live. Random upload id only: nothing the user typed. */
export function productPhotoKeys(uploadId: string): { large: string; thumb: string } {
  return { large: `public/products/${uploadId}.webp`, thumb: `public/products/${uploadId}-thumb.webp` };
}

/**
 * Upload module: business rules for files.
 *
 * Nothing the browser says about a file is trusted. The signed link fixes
 * the size and type, and after the upload the API reads the stored bytes to
 * check the real type before the file can be used anywhere.
 */

/** Which accounts may upload for which purpose. */
const PURPOSE_ROLES: Record<UploadPurpose, Role[]> = {
  seller_logo: ["seller"],
  seller_document: ["seller"],
  product_photo: ["seller"],
};

const EXTENSION: Record<UploadContentType, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** The signed PUT link works this long. */
export const UPLOAD_LINK_SECONDS = 5 * 60;
/** An upload must be completed within this time of being started. */
export const UPLOAD_COMPLETE_WINDOW_MS = 60 * 60_000;
/** file-type needs at most this many bytes to recognise a format. */
const SNIFF_BYTES = 4100;

/** Started uploads per user per hour (each one is a signed link to our bucket). */
export const UPLOAD_START_LIMIT: Limit = { name: "upload-start:user", max: 40, windowMs: 60 * 60_000 };

export function pendingKey(uploadId: string): string {
  return `pending/${uploadId}`;
}

function toUpload(row: UploadRow): Upload {
  return {
    id: row.id,
    // Rows can only be created with a current purpose (see PURPOSE_ROLES).
    purpose: row.purpose as UploadPurpose,
    contentType: row.contentType as UploadContentType,
    sizeBytes: row.sizeBytes,
    status: row.status,
  };
}

export async function createUpload(
  user: { userId: string; role: Role },
  input: CreateUploadInput,
  now = new Date(),
): Promise<CreateUploadResponse> {
  if (!PURPOSE_ROLES[input.purpose].includes(user.role)) {
    throw forbidden("You cannot upload this kind of file");
  }
  const rules = UPLOAD_RULES[input.purpose];
  if (!rules.types.includes(input.contentType)) {
    throw badRequest("This file type is not allowed here");
  }
  if (input.sizeBytes > rules.maxBytes) {
    throw badRequest(`The file is too large. The limit is ${Math.round(rules.maxBytes / (1024 * 1024))} MB.`);
  }
  const limit = await hit(UPLOAD_START_LIMIT, user.userId);
  if (!limit.allowed) throw tooManyRequests(limit.retryAfterMs, "Too many uploads. Please wait and try again.");

  const storage = getStorage();
  const id = randomUUID();
  // Random names only: nothing the user typed ends up in a storage key.
  const row = await repo.insertUpload({
    id,
    ownerUserId: user.userId,
    purpose: input.purpose,
    contentType: input.contentType,
    sizeBytes: input.sizeBytes,
    // Product photos are re-encoded into the public folder; everything else is copied as checked.
    storageKey:
      input.purpose === "product_photo" ? productPhotoKeys(id).large : `files/${input.purpose}/${id}.${EXTENSION[input.contentType]}`,
  });
  const link = await storage.createUploadUrl(
    pendingKey(row.id),
    { contentType: row.contentType, sizeBytes: row.sizeBytes },
    UPLOAD_LINK_SECONDS,
  );
  return {
    uploadId: row.id,
    uploadUrl: link.url,
    headers: link.headers,
    expiresAt: new Date(now.getTime() + UPLOAD_LINK_SECONDS * 1000).toISOString(),
  };
}

/**
 * Check the stored file and accept it. Safe to call twice (a retry after a
 * network error gets the same answer).
 */
export async function completeUpload(userId: string, uploadId: string, now = new Date()): Promise<Upload> {
  const row = await repo.findUpload(uploadId);
  // Someone else's upload looks exactly like one that does not exist.
  if (!row || row.ownerUserId !== userId) throw notFound("Upload not found");
  if (row.status === "ready") return toUpload(row);
  if (row.status === "rejected") throw badRequest("This file was not accepted. Please upload it again.");
  if (now.getTime() - row.createdAt.getTime() > UPLOAD_COMPLETE_WINDOW_MS) {
    throw badRequest("This upload has expired. Please upload the file again.");
  }

  const storage = getStorage();
  const source = pendingKey(row.id);
  const stored = await storage.stat(source);
  if (!stored) throw badRequest("The file has not arrived yet. Please upload it again.");

  const reject = async (reason: string, message: string) => {
    await repo.markRejected(row.id, reason);
    logger.warn({ uploadId: row.id, userId, reason }, "Upload rejected");
    return badRequest(message);
  };

  if (stored.sizeBytes !== row.sizeBytes) {
    throw await reject(`size ${stored.sizeBytes} != ${row.sizeBytes}`, "The file is not the expected size. Please upload it again.");
  }
  // The real type, from the file's bytes. A renamed file is caught here.
  const head = await storage.readStart(source, stored.etag, Math.min(SNIFF_BYTES, row.sizeBytes));
  const detected = await fileTypeFromBuffer(head);
  if (detected?.mime !== row.contentType) {
    throw await reject(
      `type ${detected?.mime ?? "unknown"} != ${row.contentType}`,
      "This file is not a valid PDF, JPG, PNG or WebP. Please choose another file.",
    );
  }

  if (row.purpose === "product_photo") {
    // Re-encode exactly the version we checked: metadata gone, safe pixels only.
    try {
      const photo = await processProductPhoto(await storage.read(source, stored.etag));
      const keys = productPhotoKeys(row.id);
      await storage.put(keys.thumb, photo.thumb, { contentType: "image/webp", cacheControl: PUBLIC_PHOTO_CACHE });
      await storage.put(keys.large, photo.large, { contentType: "image/webp", cacheControl: PUBLIC_PHOTO_CACHE });
    } catch (error) {
      if (error instanceof PhotoRejected) throw await reject(error.message, error.userMessage);
      throw error;
    }
  } else {
    // Copy exactly the version we checked: if the file was replaced in the
    // meantime, the copy fails instead of accepting unchecked content.
    await storage.copy(source, row.storageKey, stored.etag, row.contentType);
  }
  const ready = (await repo.markReady(row.id)) ?? (await repo.findUpload(row.id));
  if (!ready || ready.status !== "ready") throw badRequest("This file was not accepted. Please upload it again.");
  return toUpload(ready);
}

/**
 * For other modules: attach a ready upload to one of their records. Only the
 * owner can attach it, only for the purpose it was made for, and only once.
 */
export async function attachUpload(userId: string, uploadId: string, purpose: UploadPurpose): Promise<Upload> {
  const row = await repo.attach(uploadId, userId, purpose);
  if (!row) throw badRequest("This file cannot be used. Please upload it again.");
  return toUpload(row);
}

/**
 * For other modules: the public URLs of ready product photos (after they
 * checked the product may be shown). Unknown or not-ready ids are left out.
 */
export async function getProductPhotoUrls(uploadIds: string[]): Promise<Map<string, { url: string; thumbUrl: string }>> {
  const rows = await repo.findUploads(uploadIds);
  const result = new Map<string, { url: string; thumbUrl: string }>();
  if (rows.length === 0) return result;
  const storage = getStorage();
  for (const row of rows) {
    if (row.purpose !== "product_photo" || row.status !== "ready") continue;
    const keys = productPhotoKeys(row.id);
    result.set(row.id, { url: storage.publicUrl(keys.large), thumbUrl: storage.publicUrl(keys.thumb) });
  }
  return result;
}

/** For other modules: facts about uploads they already reference. */
export async function getUploads(uploadIds: string[]): Promise<Upload[]> {
  return (await repo.findUploads(uploadIds)).map(toUpload);
}

/**
 * For other modules, AFTER they have checked the caller may see the record
 * this file belongs to: a short-lived link to view it.
 */
export async function getDownloadLink(uploadId: string, expiresInSeconds: number, now = new Date()): Promise<FileLink> {
  const row = await repo.findUpload(uploadId);
  if (!row || row.status !== "ready") throw notFound("File not found");
  const url = await getStorage().createDownloadUrl(
    row.storageKey,
    { contentType: row.contentType, fileName: row.storageKey.split("/").pop() ?? "file" },
    expiresInSeconds,
  );
  return { url, expiresAt: new Date(now.getTime() + expiresInSeconds * 1000).toISOString() };
}
