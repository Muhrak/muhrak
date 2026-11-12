import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SellerDocumentRow, SellerProfileRow } from "../../db/schema";

vi.hoisted(() => {
  Object.assign(process.env, {
    DATABASE_URL: "postgres://test:test@localhost:5432/test",
    REDIS_URL: "redis://localhost:6379",
    JWT_SECRET: "test-secret-that-is-at-least-32-characters-long",
  });
});
vi.mock("./seller.repository", () => ({
  inTransaction: vi.fn(async (work: (tx: unknown) => Promise<unknown>) => work({ tx: true })),
  findProfile: vi.fn(),
  lockProfile: vi.fn(),
  updateProfile: vi.fn(),
  insertVerificationEvent: vi.fn(),
  findCurrentDocuments: vi.fn(),
  findOwnDocument: vi.fn(),
  findVerificationEvents: vi.fn(async () => []),
  reviewDocument: vi.fn(async () => true),
}));
vi.mock("../upload", () => ({
  attachUpload: vi.fn(),
  getUploads: vi.fn(async () => []),
  getDownloadLink: vi.fn(async () => ({ url: "https://bucket.example/file?sig", expiresAt: "2026-11-12T10:05:00.000Z" })),
}));
vi.mock("../audit", () => ({ recordAudit: vi.fn() }));
vi.mock("../notification", () => ({ sendSellerVerifiedEmail: vi.fn(), sendSellerChangesNeededEmail: vi.fn() }));
vi.mock("../auth", () => ({
  getUsersByIds: vi.fn(async (ids: string[]) =>
    ids.map((id) => ({ id, email: "seller@najd.om", fullName: "Najd Equipment", role: id === ADMIN ? "admin" : "seller", createdAt: "2026-11-12T00:00:00.000Z" })),
  ),
}));

const ADMIN = "99999999-9999-4999-8999-999999999999";
const SELLER = "11111111-1111-4111-8111-111111111111";
const repo = await import("./seller.repository");
const { recordAudit } = await import("../audit");
const notification = await import("../notification");
const { reviewSeller, getDocumentLinkForAdmin } = await import("./seller.service");

const now = new Date("2026-11-12T10:00:00Z");
const admin = { userId: ADMIN, ip: "1.2.3.4" };

function profile(overrides: Partial<SellerProfileRow> = {}): SellerProfileRow {
  return {
    userId: SELLER,
    companyName: "Najd Equipment",
    country: "OM",
    city: "Muscat",
    phone: "+96891234567",
    website: null,
    about: "",
    brands: [],
    vatRegistered: false,
    logoUploadId: null,
    verificationStatus: "pending",
    rejectionReason: null,
    submittedAt: now,
    reviewedAt: null,
    reviewedBy: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

const DOC_IDS = {
  commercial_registration: "a0000000-0000-4000-8000-000000000001",
  owner_id: "a0000000-0000-4000-8000-000000000002",
  bank_proof: "a0000000-0000-4000-8000-000000000003",
} as const;

function docs(): SellerDocumentRow[] {
  return (Object.keys(DOC_IDS) as (keyof typeof DOC_IDS)[]).map((type) => ({
    id: DOC_IDS[type],
    sellerUserId: SELLER,
    type,
    uploadId: "b0000000-0000-4000-8000-000000000001",
    documentNumber: null,
    status: "pending",
    rejectionReason: null,
    reviewedAt: null,
    reviewedBy: null,
    supersededAt: null,
    createdAt: now,
  }));
}

const allApproved = () => Object.values(DOC_IDS).map((id) => ({ id, status: "approved" as const, reason: null }));

function given(row: SellerProfileRow | undefined, documents = docs()) {
  vi.mocked(repo.findProfile).mockResolvedValue(row);
  vi.mocked(repo.lockProfile).mockResolvedValue(row);
  vi.mocked(repo.findCurrentDocuments).mockResolvedValue(documents);
  vi.mocked(repo.updateProfile).mockImplementation(async (_tx, _id, values) => ({ ...row!, ...values }) as SellerProfileRow);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(repo.reviewDocument).mockResolvedValue(true);
});

describe("reviewSeller", () => {
  it("approves: documents, status, history and audit in one transaction, then emails the seller", async () => {
    given(profile());
    await reviewSeller(admin, SELLER, { decision: "approve", reason: null, documents: allApproved() }, now);
    expect(repo.reviewDocument).toHaveBeenCalledTimes(3);
    expect(repo.updateProfile).toHaveBeenCalledWith(
      expect.anything(),
      SELLER,
      expect.objectContaining({ verificationStatus: "approved", reviewedBy: ADMIN, reviewedAt: now }),
    );
    expect(repo.insertVerificationEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ fromStatus: "pending", toStatus: "approved", actorUserId: ADMIN }));
    // The audit entry is written with the transaction, not separately.
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "seller.approved", actorUserId: ADMIN, entityId: SELLER, ip: "1.2.3.4" }), { tx: true });
    expect(notification.sendSellerVerifiedEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "seller@najd.om" }));
  });

  it("rejects with reasons, and tells the seller which documents to replace", async () => {
    given(profile());
    const documents = allApproved().map((doc) =>
      doc.id === DOC_IDS.owner_id ? { id: doc.id, status: "rejected" as const, reason: "ID has expired" } : doc,
    );
    await reviewSeller(admin, SELLER, { decision: "reject", reason: "Please upload a valid ID.", documents }, now);
    expect(repo.updateProfile).toHaveBeenCalledWith(
      expect.anything(),
      SELLER,
      expect.objectContaining({ verificationStatus: "rejected", rejectionReason: "Please upload a valid ID." }),
    );
    expect(notification.sendSellerChangesNeededEmail).toHaveBeenCalledWith(
      expect.objectContaining({ documents: [{ label: "Owner national ID", reason: "ID has expired" }] }),
    );
  });

  it("refuses when the seller is not under review (double click, second admin)", async () => {
    for (const status of ["draft", "approved", "rejected"] as const) {
      given(profile({ verificationStatus: status }));
      await expect(reviewSeller(admin, SELLER, { decision: "approve", reason: null, documents: allApproved() }, now)).rejects.toMatchObject({ status: 409 });
    }
    expect(repo.reviewDocument).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
    expect(notification.sendSellerVerifiedEmail).not.toHaveBeenCalled();
  });

  it("refuses when the documents differ from the ones reviewed (missing, extra or replaced)", async () => {
    given(profile());
    const missing = allApproved().slice(0, 2);
    await expect(reviewSeller(admin, SELLER, { decision: "approve", reason: null, documents: missing }, now)).rejects.toMatchObject({ status: 409 });
    const swapped = [...missing, { id: "c0000000-0000-4000-8000-000000000009", status: "approved" as const, reason: null }];
    await expect(reviewSeller(admin, SELLER, { decision: "approve", reason: null, documents: swapped }, now)).rejects.toMatchObject({ status: 409 });
    vi.mocked(repo.reviewDocument).mockResolvedValueOnce(false);
    await expect(reviewSeller(admin, SELLER, { decision: "approve", reason: null, documents: allApproved() }, now)).rejects.toMatchObject({ status: 409 });
    expect(repo.updateProfile).not.toHaveBeenCalled();
  });

  it("refuses to approve with a rejected document, and to reject without reasons", async () => {
    given(profile());
    const oneRejected = allApproved().map((doc, i) => (i === 0 ? { ...doc, status: "rejected" as const, reason: "Blurry" } : doc));
    await expect(reviewSeller(admin, SELLER, { decision: "approve", reason: null, documents: oneRejected }, now)).rejects.toMatchObject({ status: 400 });
    await expect(reviewSeller(admin, SELLER, { decision: "reject", reason: null, documents: oneRejected }, now)).rejects.toMatchObject({ status: 400 });
    const noDocReason = allApproved().map((doc, i) => (i === 0 ? { ...doc, status: "rejected" as const, reason: null } : doc));
    await expect(reviewSeller(admin, SELLER, { decision: "reject", reason: "Fix it", documents: noDocReason }, now)).rejects.toMatchObject({ status: 400 });
    const duplicate = [...allApproved(), allApproved()[0]!];
    await expect(reviewSeller(admin, SELLER, { decision: "approve", reason: null, documents: duplicate }, now)).rejects.toMatchObject({ status: 400 });
    expect(repo.lockProfile).not.toHaveBeenCalled();
  });

  it("keeps the decision when the email cannot be queued", async () => {
    given(profile());
    vi.mocked(notification.sendSellerVerifiedEmail).mockRejectedValueOnce(new Error("queue down"));
    await expect(reviewSeller(admin, SELLER, { decision: "approve", reason: null, documents: allApproved() }, now)).resolves.toBeDefined();
    expect(repo.updateProfile).toHaveBeenCalled();
  });
});

describe("getDocumentLinkForAdmin", () => {
  it("audit logs every view, and only finds the document under that seller", async () => {
    vi.mocked(repo.findOwnDocument).mockResolvedValue(docs()[0]);
    await getDocumentLinkForAdmin(admin, SELLER, DOC_IDS.commercial_registration);
    expect(repo.findOwnDocument).toHaveBeenCalledWith(DOC_IDS.commercial_registration, SELLER);
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "seller.document_viewed", actorUserId: ADMIN }));
    vi.mocked(repo.findOwnDocument).mockResolvedValue(undefined);
    await expect(getDocumentLinkForAdmin(admin, SELLER, DOC_IDS.owner_id)).rejects.toMatchObject({ status: 404 });
  });
});
