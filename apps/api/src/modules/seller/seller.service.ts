import {
  DOCUMENT_LABELS,
  type AdminSellerDetail,
  type AdminSellerList,
  type AdminSellerListQuery,
  type AdminSellerStats,
  type DocumentType,
  type GccCountry,
  type ReviewSellerData,
  type SellerAccount,
  type SellerDocument,
  type SellerProfile,
  type SellerProfileData,
  type Verification,
  type VerificationStatus,
} from "../../schemas";
import type { SellerDocumentRow, SellerProfileRow } from "../../db/schema";
import { AppError, badRequest, conflict, notFound } from "../../shared/errors";
import { logger } from "../../shared/logger";
import { recordAudit } from "../audit";
import { getUsersByIds } from "../auth";
import { sendSellerChangesNeededEmail, sendSellerVerifiedEmail } from "../notification";
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
    ...(to === "approved" ? { reviewedAt: now, reviewedBy: actorUserId, rejectionReason: null } : {}),
    ...(to === "rejected" ? { reviewedAt: now, reviewedBy: actorUserId, rejectionReason: reason } : {}),
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
  const logo = await imageLink(row.logoUploadId);
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

// ---------------------------------------------------------------- admin (Day 4)

/**
 * The functions below are for the admin console only. The admin routes
 * check the admin role before calling them; every decision and every
 * document view is written to the audit log.
 */

function encodeCursor(row: SellerProfileRow, status: VerificationStatus | undefined): string {
  const at = status === "pending" ? row.submittedAt : status ? row.updatedAt : row.createdAt;
  return Buffer.from(JSON.stringify([at?.toISOString() ?? "", row.userId])).toString("base64url");
}

function decodeCursor(cursor: string | undefined): repo.ListCursor | null {
  if (!cursor) return null;
  try {
    const [at, userId] = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as [unknown, unknown];
    const date = typeof at === "string" ? new Date(at) : null;
    if (!date || Number.isNaN(date.getTime()) || typeof userId !== "string" || !/^[0-9a-f-]{36}$/i.test(userId)) {
      throw new Error("bad cursor");
    }
    return { at: date, userId };
  } catch {
    throw badRequest("This page link is not valid. Go back to the first page.");
  }
}

export async function listSellersForAdmin(query: AdminSellerListQuery): Promise<AdminSellerList> {
  const rows = await repo.listProfiles({ status: query.status, cursor: decodeCursor(query.cursor), limit: query.limit + 1 });
  const page = rows.slice(0, query.limit);
  const ids = page.map((row) => row.userId);
  const [users, documents] = await Promise.all([getUsersByIds(ids), repo.findCurrentDocumentsForSellers(ids)]);
  const userById = new Map(users.map((user) => [user.id, user]));
  const last = page.at(-1);
  return {
    items: page.map((row) => {
      const user = userById.get(row.userId);
      const required = requiredDocuments(row.vatRegistered);
      return {
        userId: row.userId,
        email: user?.email ?? "",
        fullName: user?.fullName ?? "",
        companyName: row.companyName,
        country: row.country as SellerProfile["country"],
        city: row.city,
        status: row.verificationStatus,
        documents: required.filter((type) => documents.some((doc) => doc.sellerUserId === row.userId && doc.type === type)),
        submittedAt: row.submittedAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
      };
    }),
    nextCursor: rows.length > query.limit && last ? encodeCursor(last, query.status) : null,
  };
}

export async function getSellerStatsForAdmin(): Promise<AdminSellerStats> {
  const [counts, oldest] = await Promise.all([repo.countProfilesByStatus(), repo.findOldestPendingSubmission()]);
  const by = (status: VerificationStatus) => counts.find((row) => row.status === status)?.count ?? 0;
  return {
    total: counts.reduce((sum, row) => sum + row.count, 0),
    draft: by("draft"),
    pending: by("pending"),
    approved: by("approved"),
    rejected: by("rejected"),
    oldestPendingAt: oldest?.toISOString() ?? null,
  };
}

export async function getSellerForAdmin(sellerUserId: string): Promise<AdminSellerDetail> {
  const [profile, documents, events, users] = await Promise.all([
    repo.findProfile(sellerUserId),
    repo.findCurrentDocuments(sellerUserId),
    repo.findVerificationEvents(sellerUserId),
    getUsersByIds([sellerUserId]),
  ]);
  const user = users[0];
  if (!profile || !user || user.role !== "seller") throw notFound("Seller not found");
  const actors = new Map((await getUsersByIds(events.map((event) => event.actorUserId))).map((actor) => [actor.id, actor]));
  return {
    user,
    profile: await toProfile(profile),
    documents: await toDocuments(documents),
    verification: computeVerification(profile, documents),
    history: events.map((event) => {
      const actor = actors.get(event.actorUserId);
      return {
        fromStatus: event.fromStatus,
        toStatus: event.toStatus,
        actorRole: actor?.role === "admin" ? ("admin" as const) : ("seller" as const),
        actorName: actor?.fullName ?? "Unknown",
        reason: event.reason,
        createdAt: event.createdAt.toISOString(),
      };
    }),
  };
}

/** A 5-minute link to a seller's document for an admin. Every view is audit logged (identity documents). */
export async function getDocumentLinkForAdmin(admin: { userId: string; ip: string | null }, sellerUserId: string, documentId: string) {
  const document = await repo.findOwnDocument(documentId, sellerUserId);
  if (!document) throw notFound("Document not found");
  await recordAudit({
    actorUserId: admin.userId,
    action: "seller.document_viewed",
    entityType: "seller",
    entityId: sellerUserId,
    details: { documentId: document.id, type: document.type },
    ip: admin.ip,
  });
  return getDownloadLink(document.uploadId, DOCUMENT_LINK_SECONDS);
}

/**
 * Approve or reject a seller under review. Rules:
 * - only while the seller is pending (checked under a row lock, so a double
 *   click or two admins cannot decide twice);
 * - the admin decides on exactly the documents that are current now (if
 *   the seller's documents changed since the page loaded, refuse);
 * - approving needs every required document approved;
 * - rejecting needs a reason, and every rejected document needs a reason.
 * The decision, the document results and the audit entry are saved in one
 * transaction. The email to the seller is queued after it commits.
 */
export async function reviewSeller(
  admin: { userId: string; ip: string | null },
  sellerUserId: string,
  input: ReviewSellerData,
  now = new Date(),
): Promise<AdminSellerDetail> {
  if (input.decision === "reject" && !input.reason) throw badRequest("Write the reason the seller will see.");
  for (const doc of input.documents) {
    if (doc.status === "rejected" && !doc.reason) throw badRequest("Give a reason for every rejected document.");
  }
  if (input.decision === "approve" && input.documents.some((doc) => doc.status !== "approved")) {
    throw badRequest("Approve every document before approving the seller, or reject the seller instead.");
  }
  if (new Set(input.documents.map((doc) => doc.id)).size !== input.documents.length) {
    throw badRequest("Each document can be reviewed once.");
  }

  const result = await repo.inTransaction(async (tx) => {
    const profile = await repo.lockProfile(tx, sellerUserId);
    if (!profile) throw notFound("Seller not found");
    if (profile.verificationStatus !== "pending") {
      throw conflict("This seller is not waiting for review any more. Reload the page.");
    }
    const required = requiredDocuments(profile.vatRegistered);
    const current = (await repo.findCurrentDocuments(sellerUserId, tx)).filter((doc) => required.includes(doc.type));
    const reviewedIds = new Set(input.documents.map((doc) => doc.id));
    const changed =
      current.length !== required.length || current.length !== reviewedIds.size || current.some((doc) => !reviewedIds.has(doc.id));
    if (changed) throw conflict("The seller's documents changed. Reload the page and review again.");

    const rejectedDocuments: { label: string; reason: string }[] = [];
    const reviewed: { id: string; type: DocumentType; status: string; reason: string | null }[] = [];
    for (const decision of input.documents) {
      const doc = current.find((row) => row.id === decision.id);
      if (!doc) throw conflict("The seller's documents changed. Reload the page and review again.");
      const reason = decision.status === "rejected" ? decision.reason : null;
      const ok = await repo.reviewDocument(tx, {
        id: doc.id,
        sellerUserId,
        status: decision.status,
        rejectionReason: reason,
        reviewedBy: admin.userId,
        reviewedAt: now,
      });
      if (!ok) throw conflict("The seller's documents changed. Reload the page and review again.");
      reviewed.push({ id: doc.id, type: doc.type, status: decision.status, reason });
      if (reason) rejectedDocuments.push({ label: DOCUMENT_LABELS[doc.type], reason });
    }

    await transition(tx, profile, input.decision === "approve" ? "approved" : "rejected", admin.userId, now, input.reason);
    await recordAudit(
      {
        actorUserId: admin.userId,
        action: input.decision === "approve" ? "seller.approved" : "seller.rejected",
        entityType: "seller",
        entityId: sellerUserId,
        details: { reason: input.reason, documents: reviewed },
        ip: admin.ip,
      },
      tx,
    );
    return { companyName: profile.companyName, rejectedDocuments };
  });

  // The decision is saved. A failed email must not undo it; it is logged so it can be resent.
  const seller = (await getUsersByIds([sellerUserId]))[0];
  if (seller) {
    const dedupeKey = `${sellerUserId}-${now.getTime()}`;
    try {
      await (input.decision === "approve"
        ? sendSellerVerifiedEmail({ to: seller.email, fullName: seller.fullName, companyName: result.companyName, dedupeKey })
        : sendSellerChangesNeededEmail({
            to: seller.email,
            fullName: seller.fullName,
            companyName: result.companyName,
            reason: input.reason,
            documents: result.rejectedDocuments,
            dedupeKey,
          }));
    } catch (err) {
      logger.error({ err, sellerUserId }, "Could not queue the seller decision email");
    }
  }
  return getSellerForAdmin(sellerUserId);
}

/**
 * For other modules (catalog: only verified sellers can publish). True only
 * while the company is approved; a change that sends it back to review makes
 * this false again.
 */
export async function isSellerVerified(userId: string): Promise<boolean> {
  return (await repo.findProfile(userId))?.verificationStatus === "approved";
}

// ---------------------------------------------------------------- public directory (for the storefront module)

/** What a public page may show about a verified seller. Never email, phone, website, CR or VAT. */
export interface PublicSellerProfile {
  userId: string;
  companyName: string;
  about: string;
  city: string;
  country: GccCountry;
  brands: string[];
  logoUploadId: string | null;
  verifiedAt: Date | null;
  createdAt: Date;
}

function toPublicProfile(row: SellerProfileRow): PublicSellerProfile {
  return {
    userId: row.userId,
    companyName: row.companyName,
    about: row.about,
    city: row.city,
    country: row.country as GccCountry,
    brands: row.brands,
    logoUploadId: row.logoUploadId,
    verifiedAt: row.reviewedAt,
    createdAt: row.createdAt,
  };
}

export async function listVerifiedSellerIds(): Promise<string[]> {
  return repo.findVerifiedSellerIds();
}

/** A verified seller's public profile, or undefined (not a seller, not verified, or no longer verified). */
export async function getVerifiedSellerProfile(userId: string): Promise<PublicSellerProfile | undefined> {
  const row = await repo.findVerifiedProfile(userId);
  return row ? toPublicProfile(row) : undefined;
}

export async function listVerifiedSellersPage(input: {
  ids: string[] | null;
  q: string | null;
  alsoMatchingIds: string[];
  sort: "name" | "newest";
  offset: number;
  limit: number;
}): Promise<{ rows: PublicSellerProfile[]; total: number }> {
  const filter: repo.VerifiedProfileFilter = {
    ids: input.ids,
    // Escape LIKE wildcards so a search for "50%" means the text "50%".
    q: input.q ? { pattern: `%${input.q.replace(/[\\%_]/g, (char) => `\\${char}`)}%`, alsoIds: input.alsoMatchingIds } : null,
  };
  const [rows, total] = await Promise.all([
    repo.listVerifiedProfiles({ ...filter, sort: input.sort, offset: input.offset, limit: input.limit }),
    repo.countVerifiedProfiles(filter),
  ]);
  return { rows: rows.map(toPublicProfile), total };
}

