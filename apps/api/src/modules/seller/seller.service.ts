import {
  DOCUMENT_LABELS,
  type AdminSellerDetail,
  type AdminSellerList,
  type AdminSellerListQuery,
  type AdminSellerStats,
  type DocumentType,
  type GccCountry,
  type ReviewSellerData,
  type ReviewSellerUpdateData,
  type SellerAccount,
  type SellerDocument,
  type SellerProfile,
  type SellerProfileData,
  type SellerProfileUpdate,
  type Verification,
  type VerificationStatus,
} from "../../schemas";
import type { SellerDocumentRow, SellerProfileRow, SellerProfileUpdateRow } from "../../db/schema";
import { AppError, badRequest, conflict, notFound } from "../../shared/errors";
import { logger } from "../../shared/logger";
import { recordAudit } from "../audit";
import { getUsersByIds } from "../auth";
import { sendSellerChangesNeededEmail, sendSellerUpdateReviewedEmail, sendSellerVerifiedEmail } from "../notification";
import { attachUpload, getDownloadLink, getUploads } from "../upload";
import * as repo from "./seller.repository";

/**
 * Seller module: company profile and verification. No HTTP and no SQL here.
 *
 * Verification is a state machine. Every status change goes through
 * `transition()`, which allows only the moves in VERIFICATION_TRANSITIONS
 * and records who made it in seller_verification_events.
 *
 * Updates after verification (developer decision, 21 Nov 2026): a VERIFIED
 * seller who replaces a document or changes the company name, country or
 * VAT status stays verified. The change is saved as an UPDATE for an admin
 * to review; the approved document and details stay in force (store,
 * products, quotations) until the admin approves it. A bank account proof
 * update holds payouts until approved (`hasPendingBankProofUpdate`).
 */

// ---------------------------------------------------------------- state machine

/** The only allowed status changes. */
export const VERIFICATION_TRANSITIONS: Record<VerificationStatus, readonly VerificationStatus[]> = {
  // The seller submits for review.
  draft: ["pending"],
  // An admin approves or rejects (Day 4).
  pending: ["approved", "rejected"],
  // A verified seller stays verified: changes are reviewed as updates (21 Nov 2026), not a new review.
  approved: [],
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

function computeVerification(profile: SellerProfileRow | undefined, documents: SellerDocumentRow[], updatePending = false): Verification {
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
    updatePending: status === "approved" && updatePending,
  };
}

function toProfileUpdate(row: SellerProfileUpdateRow | undefined): SellerProfileUpdate | null {
  if (!row) return null;
  return {
    id: row.id,
    companyName: row.companyName,
    country: row.country as GccCountry,
    vatRegistered: row.vatRegistered,
    status: row.status,
    rejectionReason: row.rejectionReason,
    submittedAt: row.createdAt.toISOString(),
  };
}

/** The open updates of a seller and whether any still waits for review. */
async function openUpdates(userId: string, ex?: repo.Executor) {
  const [documentUpdates, profileUpdate] = await Promise.all([repo.findOpenDocumentUpdates(userId, ex), repo.findOpenProfileUpdate(userId, ex)]);
  const waiting = documentUpdates.some((doc) => doc.status === "pending") || profileUpdate?.status === "pending";
  return { documentUpdates, profileUpdate, waiting };
}

/** Keep the admin "Updates" queue time in step with what still waits (inside the caller's transaction). */
async function refreshUpdateQueue(tx: repo.Tx, userId: string): Promise<void> {
  await repo.updateProfile(tx, userId, { updateSubmittedAt: await repo.oldestPendingUpdateAt(tx, userId) });
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
  const [profile, documents, updates] = await Promise.all([repo.findProfile(userId), repo.findCurrentDocuments(userId), openUpdates(userId)]);
  const verified = profile?.verificationStatus === "approved";
  return {
    profile: profile ? await toProfile(profile) : null,
    documents: await toDocuments(documents),
    verification: computeVerification(profile, documents, updates.waiting),
    documentUpdates: verified ? await toDocuments(updates.documentUpdates) : [],
    profileUpdate: verified ? toProfileUpdate(updates.profileUpdate) : null,
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
    if (current.verificationStatus !== "approved") {
      await repo.updateProfile(tx, userId, fields);
      return;
    }

    // Verified: the other fields change now; the company name, country and VAT
    // status stay as approved and the new values wait for an admin (an update).
    const { companyName: _name, country: _country, vatRegistered: _vat, ...otherFields } = fields;
    await repo.updateProfile(tx, userId, otherFields);
    const open = await repo.findOpenProfileUpdate(userId, tx);
    if (!verifiedChange) {
      // Back to the approved values: nothing to review any more.
      if (open) await repo.supersedeOpenProfileUpdate(tx, userId, now);
    } else {
      const same = open?.status === "pending" && open.companyName === input.companyName && open.country === input.country && open.vatRegistered === input.vatRegistered;
      if (!same) {
        if (open) await repo.supersedeOpenProfileUpdate(tx, userId, now);
        await repo.insertProfileUpdate(tx, {
          sellerUserId: userId,
          companyName: input.companyName,
          country: input.country,
          vatRegistered: input.vatRegistered,
          createdAt: now,
        });
      }
    }
    await refreshUpdateQueue(tx, userId);
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
  if (type === "vat_certificate" && !(await vatCertificateAllowed(before))) {
    throw badRequest("Mark your company as VAT registered in the company profile first.");
  }
  await attachUpload(userId, input.uploadId, "seller_document");

  await repo.inTransaction(async (tx) => {
    const profile = await repo.lockProfile(tx, userId);
    if (!profile) throw badRequest("Complete your company profile first.");
    if (profile.verificationStatus === "pending") throw conflict(UNDER_REVIEW_MESSAGE);
    if (profile.verificationStatus === "approved") {
      // Verified: the document in force stays; the new file is an update for an admin to review.
      await repo.supersedeOpenDocumentUpdate(tx, userId, type, now);
      await repo.insertDocument(tx, {
        sellerUserId: userId,
        type,
        uploadId: input.uploadId,
        documentNumber: input.documentNumber,
        isUpdate: true,
        createdAt: now,
      });
      await refreshUpdateQueue(tx, userId);
      return;
    }
    await repo.supersedeCurrentDocument(tx, userId, type);
    await repo.insertDocument(tx, {
      sellerUserId: userId,
      type,
      uploadId: input.uploadId,
      documentNumber: input.documentNumber,
    });
  });
  return getAccount(userId);
}

/** A VAT certificate fits a VAT-registered company, or a verified one asking to become VAT registered. */
async function vatCertificateAllowed(profile: SellerProfileRow): Promise<boolean> {
  if (profile.vatRegistered) return true;
  if (profile.verificationStatus !== "approved") return false;
  const open = await repo.findOpenProfileUpdate(profile.userId);
  return open?.status === "pending" && open.vatRegistered;
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

function encodeCursor(row: SellerProfileRow, status: VerificationStatus | "updates" | undefined): string {
  const at = status === "updates" ? row.updateSubmittedAt : status === "pending" ? row.submittedAt : status ? row.updatedAt : row.createdAt;
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
  const rows = await repo.listProfiles({ status: query.status, queue: query.queue, cursor: decodeCursor(query.cursor), limit: query.limit + 1 });
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
        updateSubmittedAt: row.updateSubmittedAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
      };
    }),
    nextCursor: rows.length > query.limit && last ? encodeCursor(last, query.queue ?? query.status) : null,
  };
}

export async function getSellerStatsForAdmin(): Promise<AdminSellerStats> {
  const [counts, oldest, updates] = await Promise.all([repo.countProfilesByStatus(), repo.findOldestPendingSubmission(), repo.countUpdateQueue()]);
  const by = (status: VerificationStatus) => counts.find((row) => row.status === status)?.count ?? 0;
  return {
    total: counts.reduce((sum, row) => sum + row.count, 0),
    draft: by("draft"),
    pending: by("pending"),
    approved: by("approved"),
    rejected: by("rejected"),
    oldestPendingAt: oldest?.toISOString() ?? null,
    updates: updates.count,
    oldestUpdateAt: updates.oldest?.toISOString() ?? null,
  };
}

export async function getSellerForAdmin(sellerUserId: string): Promise<AdminSellerDetail> {
  const [profile, documents, events, users, updates] = await Promise.all([
    repo.findProfile(sellerUserId),
    repo.findCurrentDocuments(sellerUserId),
    repo.findVerificationEvents(sellerUserId),
    getUsersByIds([sellerUserId]),
    openUpdates(sellerUserId),
  ]);
  const user = users[0];
  if (!profile || !user || user.role !== "seller") throw notFound("Seller not found");
  const actors = new Map((await getUsersByIds(events.map((event) => event.actorUserId))).map((actor) => [actor.id, actor]));
  return {
    user,
    profile: await toProfile(profile),
    documents: await toDocuments(documents),
    verification: computeVerification(profile, documents, updates.waiting),
    documentUpdates: profile.verificationStatus === "approved" ? await toDocuments(updates.documentUpdates) : [],
    profileUpdate: profile.verificationStatus === "approved" ? toProfileUpdate(updates.profileUpdate) : null,
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
 * Decide on a VERIFIED seller's updates (21 Nov 2026). Rules:
 * - only while the seller is verified, under the profile row lock (two
 *   admins or a double click cannot decide twice);
 * - the admin decides on exactly the updates waiting now (a newer file or
 *   new details since the page loaded: 409);
 * - every rejected update needs a reason;
 * - becoming VAT registered needs a VAT certificate in force or approved in
 *   the same decision.
 * An approved document replaces the old one (kept, marked replaced); approved
 * details move into the profile. The seller stays verified either way.
 * Decisions and the audit entry are one transaction; the email follows.
 */
export async function reviewSellerUpdate(
  admin: { userId: string; ip: string | null },
  sellerUserId: string,
  input: ReviewSellerUpdateData,
  now = new Date(),
): Promise<AdminSellerDetail> {
  const decisions = [...input.documents, ...(input.profileUpdate ? [input.profileUpdate] : [])];
  if (decisions.length === 0) throw badRequest("There is nothing to decide.");
  if (decisions.some((item) => item.status === "rejected" && !item.reason)) throw badRequest("Give a reason for every rejected update.");
  if (new Set(decisions.map((item) => item.id)).size !== decisions.length) throw badRequest("Each update can be decided once.");

  const STALE = "The seller's updates changed. Reload the page and review again.";
  const result = await repo.inTransaction(async (tx) => {
    const profile = await repo.lockProfile(tx, sellerUserId);
    if (!profile) throw notFound("Seller not found");
    if (profile.verificationStatus !== "approved") throw conflict("Updates can only be reviewed for a verified seller. Reload the page.");

    const waitingDocs = (await repo.findOpenDocumentUpdates(sellerUserId, tx)).filter((doc) => doc.status === "pending");
    const openProfile = await repo.findOpenProfileUpdate(sellerUserId, tx);
    const waitingProfile = openProfile?.status === "pending" ? openProfile : undefined;
    const sameDocs =
      waitingDocs.length === input.documents.length && waitingDocs.every((doc) => input.documents.some((item) => item.id === doc.id));
    const sameProfile = (waitingProfile?.id ?? null) === (input.profileUpdate?.id ?? null);
    if (!sameDocs || !sameProfile) throw conflict(STALE);

    const approvedVatCertificate = input.documents.some(
      (item) => item.status === "approved" && waitingDocs.find((doc) => doc.id === item.id)?.type === "vat_certificate",
    );
    if (waitingProfile && input.profileUpdate?.status === "approved" && waitingProfile.vatRegistered && !profile.vatRegistered) {
      const inForce = (await repo.findCurrentDocuments(sellerUserId, tx)).some((doc) => doc.type === "vat_certificate" && doc.status === "approved");
      if (!inForce && !approvedVatCertificate) {
        throw badRequest("Becoming VAT registered needs a VAT certificate. Approve the seller's VAT certificate too, or reject the change.");
      }
    }

    const approved: string[] = [];
    const rejected: { label: string; reason: string }[] = [];
    const audit: { kind: string; id: string; status: string; reason: string | null }[] = [];

    for (const item of input.documents) {
      const doc = waitingDocs.find((row) => row.id === item.id);
      if (!doc) throw conflict(STALE);
      // The approved update replaces the document in force (kept, marked replaced).
      if (item.status === "approved") await repo.supersedeCurrentDocument(tx, sellerUserId, doc.type);
      const reason = item.status === "rejected" ? item.reason : null;
      const ok = await repo.reviewDocumentUpdate(tx, {
        id: doc.id,
        sellerUserId,
        status: item.status,
        rejectionReason: reason,
        reviewedBy: admin.userId,
        reviewedAt: now,
      });
      if (!ok) throw conflict(STALE);
      audit.push({ kind: doc.type, id: doc.id, status: item.status, reason });
      if (item.status === "approved") approved.push(DOCUMENT_LABELS[doc.type]);
      else rejected.push({ label: DOCUMENT_LABELS[doc.type], reason: reason ?? "" });
    }

    let companyName = profile.companyName;
    if (waitingProfile && input.profileUpdate) {
      const reason = input.profileUpdate.status === "rejected" ? input.profileUpdate.reason : null;
      const ok = await repo.reviewProfileUpdate(tx, {
        id: waitingProfile.id,
        sellerUserId,
        status: input.profileUpdate.status,
        rejectionReason: reason,
        reviewedBy: admin.userId,
        reviewedAt: now,
      });
      if (!ok) throw conflict(STALE);
      if (input.profileUpdate.status === "approved") {
        await repo.updateProfile(tx, sellerUserId, {
          companyName: waitingProfile.companyName,
          country: waitingProfile.country,
          vatRegistered: waitingProfile.vatRegistered,
        });
        companyName = waitingProfile.companyName;
        approved.push("Company details");
      } else {
        rejected.push({ label: "Company details", reason: reason ?? "" });
      }
      audit.push({
        kind: "company_details",
        id: waitingProfile.id,
        status: input.profileUpdate.status,
        reason,
      });
    }

    await refreshUpdateQueue(tx, sellerUserId);
    await recordAudit(
      {
        actorUserId: admin.userId,
        action: "seller.update_reviewed",
        entityType: "seller",
        entityId: sellerUserId,
        details: {
          decisions: audit,
          ...(waitingProfile
            ? {
                companyDetails: {
                  from: { companyName: profile.companyName, country: profile.country, vatRegistered: profile.vatRegistered },
                  to: { companyName: waitingProfile.companyName, country: waitingProfile.country, vatRegistered: waitingProfile.vatRegistered },
                },
              }
            : {}),
        },
        ip: admin.ip,
      },
      tx,
    );
    return { companyName, approved, rejected };
  });

  // The decisions are saved. A failed email must not undo them; it is logged.
  const seller = (await getUsersByIds([sellerUserId]))[0];
  if (seller) {
    try {
      await sendSellerUpdateReviewedEmail({
        to: seller.email,
        fullName: seller.fullName,
        companyName: result.companyName,
        approved: result.approved,
        rejected: result.rejected,
        dedupeKey: `${sellerUserId}-${now.getTime()}`,
      });
    } catch (err) {
      logger.error({ err, sellerUserId }, "Could not queue the seller update email");
    }
  }
  return getSellerForAdmin(sellerUserId);
}

/**
 * For the payout module (Day 15): true while a new bank account proof waits
 * for review. Payouts to this seller must wait until it is approved, so a
 * taken-over account cannot redirect money (developer decision, 21 Nov 2026).
 */
export async function hasPendingBankProofUpdate(sellerUserId: string): Promise<boolean> {
  return repo.hasPendingBankProofUpdate(sellerUserId);
}

/**
 * For other modules (catalog: only verified sellers can publish). True only
 * while the company is approved. A verified seller's pending update does not
 * change this (21 Nov 2026).
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


/** Verified sellers among `userIds`, with what a public page may show. */
export async function getVerifiedSellerProfiles(userIds: string[]): Promise<Map<string, PublicSellerProfile>> {
  const rows = await repo.findProfilesByIds([...new Set(userIds)]);
  return new Map(rows.filter((row) => row.verificationStatus === "approved").map((row) => [row.userId, toPublicProfile(row)]));
}

/**
 * Company name and place of sellers, whatever their status now (an old
 * quote request keeps showing who it went to). Public fields only.
 */
export async function getSellerCompanies(userIds: string[]): Promise<Map<string, { companyName: string; city: string; country: GccCountry }>> {
  const rows = await repo.findProfilesByIds([...new Set(userIds)]);
  return new Map(rows.map((row) => [row.userId, { companyName: row.companyName, city: row.city, country: row.country as GccCountry }]));
}

// ---------------------------------------------------------------- for the quotation module (Day 11)

/**
 * What a quotation needs about its seller, ONLY while the seller is verified
 * (an unverified seller cannot send quotations). Never email or phone.
 */
export async function getSellerForQuote(
  userId: string,
): Promise<{ companyName: string; city: string; country: GccCountry; vatRegistered: boolean } | undefined> {
  const row = await repo.findProfile(userId);
  if (!row || row.verificationStatus !== "approved") return undefined;
  return { companyName: row.companyName, city: row.city, country: row.country as GccCountry, vatRegistered: row.vatRegistered };
}
