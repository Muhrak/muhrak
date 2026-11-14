import {
  UPLOAD_RULES,
  completeUploadResponseSchema,
  createUploadResponseSchema,
  uploadContentTypeSchema,
  type UploadContentType,
  type UploadPurpose,
} from "@/schemas";
import { authedRequest } from "@/features/auth/authed-request";
import type { PortalSide } from "@/features/auth/paths";
import { ApiError } from "@/lib/api";

/**
 * Send one file to private storage, as the signed-in user of `side`:
 * 1. ask the API for a signed upload link (it checks type and size),
 * 2. PUT the file straight to storage (it never passes through our servers),
 * 3. ask the API to check the stored file. Returns the upload id, which the
 *    caller then attaches to a record (logo, document).
 *
 * The checks here only give early, friendly errors; the API and storage
 * enforce them.
 */

const TYPE_NAMES: Record<UploadContentType, string> = {
  "application/pdf": "PDF",
  "image/jpeg": "JPG",
  "image/png": "PNG",
  "image/webp": "WebP",
};

export function describeRules(purpose: UploadPurpose): string {
  const rules = UPLOAD_RULES[purpose];
  const types = rules.types.map((type) => TYPE_NAMES[type]);
  const list = types.length > 1 ? `${types.slice(0, -1).join(", ")} or ${types.at(-1)}` : types[0];
  return `${list}, up to ${rules.maxBytes / (1024 * 1024)} MB`;
}

/** The `accept` attribute for a file input. */
export function acceptFor(purpose: UploadPurpose): string {
  return UPLOAD_RULES[purpose].types.join(",");
}

/** Some browsers report JPEGs as image/jpg, or give no type at all. */
function contentTypeOf(file: File): UploadContentType | null {
  const declared = file.type === "image/jpg" ? "image/jpeg" : file.type;
  const parsed = uploadContentTypeSchema.safeParse(declared);
  if (parsed.success) return parsed.data;
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "pdf") return "application/pdf";
  if (extension === "png") return "image/png";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "webp") return "image/webp";
  return null;
}

/** A friendly reason the file cannot be used here, or null if it looks fine. */
export function checkFile(purpose: UploadPurpose, file: File): string | null {
  const rules = UPLOAD_RULES[purpose];
  const type = contentTypeOf(file);
  if (!type || !rules.types.includes(type)) return `Choose a ${describeRules(purpose).split(",")[0]} file.`;
  if (file.size === 0) return "This file is empty.";
  if (file.size > rules.maxBytes) return `This file is too large. The limit is ${rules.maxBytes / (1024 * 1024)} MB.`;
  return null;
}

export async function uploadFile(side: PortalSide, purpose: UploadPurpose, file: File): Promise<string> {
  const problem = checkFile(purpose, file);
  const contentType = contentTypeOf(file);
  if (problem || !contentType) throw new ApiError(400, "bad_file", problem ?? "This file cannot be uploaded.");

  const start = await authedRequest(side, "/v1/uploads", createUploadResponseSchema, {
    method: "POST",
    body: { purpose, contentType, sizeBytes: file.size },
  });

  let response: Response;
  try {
    response = await fetch(start.uploadUrl, {
      method: "PUT",
      headers: start.headers,
      body: file,
      // The signed link is the only credential; never send cookies to storage.
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
  } catch {
    throw new ApiError(0, "network_error", "The upload did not finish. Check your connection and try again.");
  }
  if (!response.ok) {
    throw new ApiError(response.status, "upload_failed", "The upload did not finish. Please try again.");
  }

  const done = await authedRequest(side, `/v1/uploads/${start.uploadId}/complete`, completeUploadResponseSchema, {
    method: "POST",
  });
  return done.upload.id;
}
