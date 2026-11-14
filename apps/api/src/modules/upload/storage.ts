import { env } from "../../config/env";
import { AppError } from "../../shared/errors";
import { createS3Storage } from "./providers/s3";

/**
 * File storage, behind a small interface so the provider (Amazon S3 today)
 * can be swapped or faked in tests. Everything is private and reached only
 * through short-lived signed links, EXCEPT the `public/` folder: cleaned
 * product photos that buyers see (a bucket policy allows reading only that
 * folder). Nothing the user uploads goes to `public/` directly; only files
 * the API itself re-encoded are written there.
 */
export interface StoredObject {
  sizeBytes: number;
  /** Changes whenever the object is overwritten; used to pin checks to one version of the file. */
  etag: string;
}

export interface StorageProvider {
  /** A signed PUT link that accepts exactly this content type and size. */
  createUploadUrl(
    key: string,
    file: { contentType: string; sizeBytes: number },
    expiresInSeconds: number,
  ): Promise<{ url: string; headers: Record<string, string> }>;
  /** Size and version of a stored object, or null if there is none. */
  stat(key: string): Promise<StoredObject | null>;
  /** The first `bytes` bytes of that exact version of the object. */
  readStart(key: string, etag: string, bytes: number): Promise<Uint8Array>;
  /** The whole of that exact version of the object. */
  read(key: string, etag: string): Promise<Uint8Array>;
  /** Write a file the API produced itself (e.g. a re-encoded photo). */
  put(key: string, body: Uint8Array, file: { contentType: string; cacheControl: string }): Promise<void>;
  /** The permanent URL of a key under `public/`. */
  publicUrl(key: string): string;
  /** Copy that exact version to `toKey` (fails if the object changed since it was checked). */
  copy(fromKey: string, toKey: string, etag: string, contentType: string): Promise<void>;
  /** A signed GET link that serves the file with this content type, inline. */
  createDownloadUrl(key: string, file: { contentType: string; fileName: string }, expiresInSeconds: number): Promise<string>;
}

let storage: StorageProvider | null = null;

/** Tests replace the provider with a fake. */
export function setStorage(provider: StorageProvider | null): void {
  storage = provider;
}

export function getStorage(): StorageProvider {
  if (storage) return storage;
  const { AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, S3_BUCKET_PRIVATE } = env;
  if (!AWS_REGION || !AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY || !S3_BUCKET_PRIVATE) {
    throw new AppError(503, "storage_unavailable", "File uploads are not available right now. Please try again later.");
  }
  storage = createS3Storage({
    region: AWS_REGION,
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
    bucket: S3_BUCKET_PRIVATE,
  });
  return storage;
}
