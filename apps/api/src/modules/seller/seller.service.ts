import type {
  DocumentType,
  SellerAccount,
  SellerDocument,
  SellerProfile,
  SellerProfileData,
  Verification,
  VerificationStatus,
} from "@muhrak/schemas";
import type { SellerDocumentRow, SellerProfileRow } from "../../db/schema";
import { AppError, badRequest, conflict, notFound } from "../../shared/errors";
import { attachUpload, getDownloadLink, getUploads } from "../upload";
import * as repo from "./seller.repository";

/**
 * Seller module: company profile and verification. No HTTP and no SQL here.
 *
 * Verification is a state machine. Every status change goes through
 * `transition()`, which allows only the moves in VERIFICATION_TRANSITIONS
 * and records who made it in seller_verification_events.
 */

// ---------------------------------------------------------------- state machine

/** The only allowed status changes. */
export const VERIFICATION_TRANSITIONS: Record<VerificationStatus, readonly VerificationStatus[]> = {
  // The seller submits for review.
  draft: ["pending"],
  // An admin approves or rejects (Day 4).
  pending: ["approved", "rejected"],
  // Changing the company name, country, VAT status or a document sends a verified seller back to review.
  approved: ["pending"],
  // The seller fixes the problem and submits again.
  rejected: ["pending"],
};

export function canTransition(from: VerificationStatus, to: VerificationStatus): boolean {
  return VERIFICATION_TRANSITIONS[from].includes(to);
}

async function transition(
  tx: Parameters<Parameters<typeof repo.inTransaction>[0]>[0],
  profile: SellerProfileRow,
  to: VerificationStatus,
  actorUserId: string,
  now: Date,
  reason: string | null = null,
): Promise<SellerProfileRow> {
  const from = profile.verificationStatus;
  if (!canTransition(from, to)) {
    throw conflict(`Verification cannot move from ${from} to ${to}`);
  }
  const updated = await repo.updateProfile(tx, profile.userId, {
    verificationStatus: to,
    ...(to === "pending" ? { submittedAt: now, rejectionReason: null } : {}),
  });
  await repo.insertVerificationEvent(tx, {
    sellerUserId: profile.userId,
    fromStatus: from,
    toStatus: to,
    actorUserId,
    reason,
  });
  return updated;
}

// ---------------------------------------------------------------- rules

const BASE_DOCUMENTS: DocumentType[] = ["commercial_registration", "owner_id", "bank_proof"];

export function requiredDocuments(vatRegistered: boolean): DocumentType[] {
  return vatRegistered ? ["commercial_registration", "vat_certificate", "owner_id", "bank_proof"] : BASE_DOCUMENTS;
}

/** Fields an admin checks against the documents. Changing them needs a new review. */
function verifiedFieldsChanged(profile: SellerProfileRow, input: SellerProfileData): boolean {
  return (
    profile.companyName !== input.companyName ||
    profile.country !== input.country ||
    profile.vatRegistered !== input.vatRegistered
  );
}

const UNDER_REVIEW_MESSAGE =
  "Your company is being reviewed. You can change the company name, country, VAT status and documents after the review.";

/** How long links to view private files work. */
const IMAGE_LINK_SECONDS = 60 * 60;
const DOCUMENT_LINK_SECONDS = 5 * 60;

// ---------------------------------------------------------------- reads

function computeVerification(profile: SellerProfileRow | undefined, documents: SellerDocumentRow[]): Verification {
  const status = profile?.verificationStatus ?? "draft";
  const required = requiredDocuments(profile?.vatRegistered ?? false);
  const current = new Map(documents.map((doc) => [doc.type, doc]));
  const missing = required.filter((type) => !current.has(type));
  const anyRejected = required.some((type) => current.get(type)?.status === "rejected");
  return {
    status,
    rejectionReason: profile?.rejectionReason ?? null,
    submittedAt: profile?.submittedAt?.toISOString() ?? null,
    reviewedAt: profile?.reviewedAt?.toISOString() ?? null,
    requiredDocuments: required,
    missingDocuments: missing,
    canSubmit: Boolean(profile) && missing.length === 0 && !anyRejected && (status === "draft" || status === "rejected"),
  };
}

async function imageLink(uploadId: string | null) {
  return uploadId ? getDownloadLink(uploadId, IMAGE_LINK_SECONDS) : null;
}

async function toProfile(row: SellerProfileRow): Promise<SellerProfile> {
  const [logo, cover] = await Promise.all([imageLink(row.logoUploadId), imageLink(row.coverUploadId)]);
  return {
    companyName: row.companyName,
    country: row.country as SellerProfile["country"],
    city: row.city,
    phone: row.phone,
    website: row.website,
    about: row.about,
    brands: row.brands,
    vatRegistered: row.vatRegistered,
    logo,
    cover,
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function toDocuments(rows: SellerDocumentRow[]): Promise<SellerDocument[]> {
  const files = new Map((await getUploads(rows.map((row) => row.uploadId))).map((file) => [file.id, file]));
  return rows.map((row) => {
    const file = files.get(row.uploadId);
    return {
      id: row.id,
      type: row.type,
      status: row.status,
      documentNumber: row.documentNumber,
      rejectionReason: row.rejectionReason,
      contentType: file?.contentType ?? "application/octet-stream",
      sizeBytes: file?.sizeBytes ?? 0,
      uploadedAt: row.createdAt.toISOString(),
    };
  });
}

/** Everything the seller's own profile and verification pages show. Only ever for the signed-in seller. */
export async function getAccount(userId: string): Promise<SellerAccount> {
  const [profile, documents] = await Promise.all([repo.findProfile(userId), repo.findCurrentDocuments(userId)]);
  return {
    profile: profile ? await toProfile(profile) : null,
    documents: await toDocuments(documents),
    verification: computeVerification(profile, documents),
  };
}

/** A short-lived link to one of the seller's own documents. Another seller's document is "not found". */
export async function getDocumentLink(userId: string, documentId: string) {
  const document = await repo.findOwnDocument(documentId, userId);
  if (!document) throw notFound("Document not found");
  return getDownloadLink(document.uploadId, DOCUMENT_LINK_SECONDS);
}

// ---------------------------------------------------------------- writes

/** Create or update the company profile. */
export async function saveProfile(userId: string, input: SellerProfileData, now = new Date()): Promise<SellerAccount> {
  // Check before attaching any file, so a refused save does not use up the upload.
  const before = await repo.findProfile(userId);
  if (before?.verificationStatus === "pending" && verifiedFieldsChanged(before, input)) {
    throw conflict(UNDER_REVIEW_MESSAGE);
  }
  if (input.logoUploadId && input.logoUploadId !== before?.logoUploadId) {
    await attachUpload(userId, input.logoUploadId, "seller_logo");
  }
  if (input.coverUploadId && input.coverUploadId !== before?.coverUploadId) {
    await attachUpload(userId, input.coverUploadId, "seller_cover");
  }

  const fields = {
    companyName: input.companyName,
    country: input.country,
    city: input.city,
    phone: input.phone,
    website: input.website,
    about: input.about,
    brands: [...new Set(input.brands)],
    vatRegistered: input.vatRegistered,
    ...(input.logoUploadId !== undefined ? { logoUploadId: input.logoUploadId } : {}),
    ...(input.coverUploadId !== undefined ? { coverUploadId: input.coverUploadId } : {}),
  };

  await repo.inTransaction(async (tx) => {
    const current = await repo.lockProfile(tx, userId);
    if (!current) {
      const created = await repo.insertProfile(tx, { userId, ...fields });
      if (!created) throw conflict("Your profile was just saved from another tab. Reload and try again.");
      return;
    }
    // Checked again under the row lock: an admin may have started the review meanwhile.
    const verifiedChange = verifiedFieldsChanged(current, input);
    if (current.verificationStatus === "pending" && verifiedChange) throw conflict(UNDER_REVIEW_MESSAGE);
    const updated = await repo.updateProfile(tx, userId, fields);
    if (current.verificationStatus === "approved" && verifiedChange) {
      await transition(tx, updated, "pending", userId, now, "Company details changed after approval");
    }
  });
  return getAccount(userId);
}

/** Upload (or replace) one verification document. The old file is kept, marked as replaced. */
export async function submitDocument(
  userId: string,
  type: DocumentType,
  input: { uploadId: string; documentNumber: string | null },
  now = new Date(),
): Promise<SellerAccount> {
  const before = await repo.findProfile(userId);
  if (!before) throw badRequest("Complete your company profile first.");
  if (before.verificationStatus === "pending") throw conflict(UNDER_REVIEW_MESSAGE);
  if (type === "vat_certificate" && !before.vatRegistered) {
    throw badRequest("Mark your company as VAT registered in the company profile first.");
  }
  await attachUpload(userId, input.uploadId, "seller_document");

  await repo.inTransaction(async (tx) => {
    const profile = await repo.lockProfile(tx, userId);
    if (!profile) throw badRequest("Complete your company profile first.");
    if (profile.verificationStatus === "pending") throw conflict(UNDER_REVIEW_MESSAGE);
    await repo.supersedeCurrentDocument(tx, userId, type);
    await repo.insertDocument(tx, {
      sellerUserId: userId,
      type,
      uploadId: input.uploadId,
      documentNumber: input.documentNumber,
    });
    if (profile.verificationStatus === "approved") {
      await transition(tx, profile, "pending", userId, now, `New ${type} uploaded after approval`);
    }
  });
  return getAccount(userId);
}

/** Send the profile and documents for review. */
export async function submitForReview(userId: string, now = new Date()): Promise<SellerAccount> {
  await repo.inTransaction(async (tx) => {
    const profile = await repo.lockProfile(tx, userId);
    if (!profile) throw badRequest("Complete your company profile first.");
    if (profile.verificationStatus === "pending") throw conflict("Your company is already being reviewed.");
    if (profile.verificationStatus === "approved") throw conflict("Your company is already verified.");
    const documents = await repo.findCurrentDocuments(userId, tx);
    const verification = computeVerification(profile, documents);
    if (verification.missingDocuments.length > 0) {
      throw new AppError(400, "documents_missing", "Upload all required documents first.", {
        missingDocuments: verification.missingDocuments,
      });
    }
    if (!verification.canSubmit) throw badRequest("Replace the rejected documents before submitting again.");
    await transition(tx, profile, "pending", userId, now);
  });
  return getAccount(userId);
}
