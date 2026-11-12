import { z } from "zod";

/**
 * File uploads go straight from the browser to private storage:
 *
 * 1. POST /v1/uploads           → the API checks type and size, returns a
 *                                  short-lived signed PUT link.
 * 2. PUT <uploadUrl>             → the browser sends the file to storage.
 * 3. POST /v1/uploads/:id/complete → the API reads the stored file, checks
 *                                  its real size and type (from its bytes,
 *                                  not its name), and only then accepts it.
 *
 * An upload is then attached to one record (a logo, a document) by the
 * module that owns that record. It can be attached once, by its owner only.
 */

export const uploadPurposeSchema = z.enum(["seller_logo", "seller_document"]);
export type UploadPurpose = z.infer<typeof uploadPurposeSchema>;

export const uploadContentTypeSchema = z.enum(["application/pdf", "image/jpeg", "image/png"]);
export type UploadContentType = z.infer<typeof uploadContentTypeSchema>;

const MB = 1024 * 1024;

/** What each purpose accepts. The API enforces this; the web app uses it to warn early. */
export const UPLOAD_RULES: Record<UploadPurpose, { types: UploadContentType[]; maxBytes: number }> = {
  seller_logo: { types: ["image/png", "image/jpeg"], maxBytes: 2 * MB },
  seller_document: { types: ["application/pdf", "image/png", "image/jpeg"], maxBytes: 10 * MB },
};

export const createUploadSchema = z.object({
  purpose: uploadPurposeSchema,
  contentType: uploadContentTypeSchema,
  /** Exact size of the file in bytes. The signed link only accepts a body of this size. */
  sizeBytes: z.number().int().positive().max(10 * MB),
});
export type CreateUploadInput = z.infer<typeof createUploadSchema>;

export const createUploadResponseSchema = z.object({
  uploadId: z.string().uuid(),
  /** PUT the file here with exactly these headers. */
  uploadUrl: z.string().url(),
  headers: z.record(z.string(), z.string()),
  expiresAt: z.string(),
});
export type CreateUploadResponse = z.infer<typeof createUploadResponseSchema>;

export const uploadSchema = z.object({
  id: z.string().uuid(),
  purpose: uploadPurposeSchema,
  contentType: uploadContentTypeSchema,
  sizeBytes: z.number().int(),
  status: z.enum(["pending", "ready", "rejected"]),
});
export type Upload = z.infer<typeof uploadSchema>;

export const completeUploadResponseSchema = z.object({ upload: uploadSchema });
export type CompleteUploadResponse = z.infer<typeof completeUploadResponseSchema>;

/** A short-lived link to view a private file. */
export const fileLinkSchema = z.object({
  url: z.string().url(),
  expiresAt: z.string(),
});
export type FileLink = z.infer<typeof fileLinkSchema>;
