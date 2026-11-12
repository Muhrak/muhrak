import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SellerProfileData, VerificationStatus } from "@muhrak/schemas";
import type { SellerDocumentRow, SellerProfileRow } from "../../db/schema";

vi.hoisted(() => {
  Object.assign(process.env, {
    DATABASE_URL: "postgres://test:test@localhost:5432/test",
    REDIS_URL: "redis://localhost:6379",
    JWT_SECRET: "test-secret-that-is-at-least-32-characters-long",
  });
});
vi.mock("./seller.repository", () => ({
  inTransaction: vi.fn(async (work: (tx: unknown) => Promise<unknown>) => work({})),
  findProfile: vi.fn(),
  lockProfile: vi.fn(),
  insertProfile: vi.fn(),
  updateProfile: vi.fn(),
  insertVerificationEvent: vi.fn(),
  findCurrentDocuments: vi.fn(),
  findOwnDocument: vi.fn(),
  supersedeCurrentDocument: vi.fn(),
  insertDocument: vi.fn(),
}));
vi.mock("../upload", () => ({
  attachUpload: vi.fn(),
  getUploads: vi.fn(async () => []),
  getDownloadLink: vi.fn(async () => ({ url: "https://bucket.example/file?sig", expiresAt: "2026-11-12T10:05:00.000Z" })),
}));

const repo = await import("./seller.repository");
const upload = await import("../upload");
const service = await import("./seller.service");

const SELLER = "11111111-1111-4111-8111-111111111111";
const UPLOAD = "33333333-3333-4333-8333-333333333333";
const now = new Date("2026-11-12T10:00:00Z");

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
    verificationStatus: "draft",
    rejectionReason: null,
    submittedAt: null,
    reviewedAt: null,
    reviewedBy: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function input(overrides: Partial<SellerProfileData> = {}): SellerProfileData {
  return {
    companyName: "Najd Equipment",
    country: "OM",
    city: "Muscat",
    phone: "+96891234567",
    website: null,
    about: "",
    brands: [],
    vatRegistered: false,
    ...overrides,
  };
}

function doc(type: SellerDocumentRow["type"], status: SellerDocumentRow["status"] = "pending"): SellerDocumentRow {
  return {
    id: `4444444${["commercial_registration", "vat_certificate", "owner_id", "bank_proof"].indexOf(type)}-4444-4444-8444-444444444444`,
    sellerUserId: SELLER,
    type,
    uploadId: UPLOAD,
    documentNumber: null,
    status,
    rejectionReason: null,
    reviewedAt: null,
    reviewedBy: null,
    supersededAt: null,
    createdAt: now,
  };
}

const ALL_DOCS = [doc("commercial_registration"), doc("owner_id"), doc("bank_proof")];

function given(row: SellerProfileRow | undefined, documents: SellerDocumentRow[] = []) {
  vi.mocked(repo.findProfile).mockResolvedValue(row);
  vi.mocked(repo.lockProfile).mockResolvedValue(row);
  vi.mocked(repo.findCurrentDocuments).mockResolvedValue(documents);
  vi.mocked(repo.updateProfile).mockImplementation(async (_tx, _id, values) => ({ ...row!, ...values }) as SellerProfileRow);
}

function statusChanges() {
  return vi.mocked(repo.insertVerificationEvent).mock.calls.map(([, event]) => `${event.fromStatus}->${event.toStatus}`);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("verification state machine", () => {
  it("allows only the listed moves", () => {
    const all: VerificationStatus[] = ["draft", "pending", "approved", "rejected"];
    const allowed = all.flatMap((from) => all.filter((to) => service.canTransition(from, to)).map((to) => `${from}->${to}`));
    expect(allowed.sort()).toEqual(
      ["draft->pending", "pending->approved", "pending->rejected", "approved->pending", "rejected->pending"].sort(),
    );
  });

  it("requires the VAT certificate only when VAT registered", () => {
    expect(service.requiredDocuments(false)).not.toContain("vat_certificate");
    expect(service.requiredDocuments(true)).toContain("vat_certificate");
  });
});

describe("submitForReview", () => {
  it("moves a complete draft to pending and records who did it", async () => {
    given(profile(), ALL_DOCS);
    await service.submitForReview(SELLER, now);
    expect(repo.updateProfile).toHaveBeenCalledWith(expect.anything(), SELLER, expect.objectContaining({ verificationStatus: "pending", submittedAt: now }));
    expect(statusChanges()).toEqual(["draft->pending"]);
    expect(vi.mocked(repo.insertVerificationEvent).mock.calls[0]![1].actorUserId).toBe(SELLER);
  });

  it("refuses when documents are missing (VAT counted when registered)", async () => {
    given(profile({ vatRegistered: true }), ALL_DOCS);
    await expect(service.submitForReview(SELLER, now)).rejects.toMatchObject({
      status: 400,
      details: { missingDocuments: ["vat_certificate"] },
    });
    expect(repo.updateProfile).not.toHaveBeenCalled();
  });

  it("refuses without a profile, when already pending, and when already approved", async () => {
    given(undefined);
    await expect(service.submitForReview(SELLER, now)).rejects.toMatchObject({ status: 400 });
    given(profile({ verificationStatus: "pending" }), ALL_DOCS);
    await expect(service.submitForReview(SELLER, now)).rejects.toMatchObject({ status: 409 });
    given(profile({ verificationStatus: "approved" }), ALL_DOCS);
    await expect(service.submitForReview(SELLER, now)).rejects.toMatchObject({ status: 409 });
    expect(statusChanges()).toEqual([]);
  });

  it("lets a rejected seller resubmit only after replacing rejected documents", async () => {
    given(profile({ verificationStatus: "rejected" }), [doc("commercial_registration", "rejected"), doc("owner_id"), doc("bank_proof")]);
    await expect(service.submitForReview(SELLER, now)).rejects.toMatchObject({ status: 400 });
    given(profile({ verificationStatus: "rejected", rejectionReason: "CR expired" }), ALL_DOCS);
    await service.submitForReview(SELLER, now);
    expect(repo.updateProfile).toHaveBeenCalledWith(expect.anything(), SELLER, expect.objectContaining({ rejectionReason: null }));
    expect(statusChanges()).toEqual(["rejected->pending"]);
  });
});

describe("saveProfile", () => {
  it("creates a draft profile on first save", async () => {
    given(undefined);
    vi.mocked(repo.insertProfile).mockResolvedValue(profile());
    await service.saveProfile(SELLER, input(), now);
    expect(repo.insertProfile).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ userId: SELLER, companyName: "Najd Equipment" }));
  });

  it("refuses a change to company name, country or VAT status while under review, before using the upload", async () => {
    for (const change of [{ companyName: "Other" }, { country: "AE" as const }, { vatRegistered: true }]) {
      given(profile({ verificationStatus: "pending" }));
      await expect(service.saveProfile(SELLER, input({ ...change, logoUploadId: UPLOAD }), now)).rejects.toMatchObject({ status: 409 });
    }
    expect(upload.attachUpload).not.toHaveBeenCalled();
    expect(repo.updateProfile).not.toHaveBeenCalled();
  });

  it("allows other edits while under review", async () => {
    given(profile({ verificationStatus: "pending" }));
    await service.saveProfile(SELLER, input({ city: "Sohar" }), now);
    expect(repo.updateProfile).toHaveBeenCalled();
    expect(statusChanges()).toEqual([]);
  });

  it("sends an approved seller back to review when the company name changes", async () => {
    given(profile({ verificationStatus: "approved" }));
    await service.saveProfile(SELLER, input({ companyName: "Najd Equipment LLC" }), now);
    expect(statusChanges()).toEqual(["approved->pending"]);
  });

  it("keeps an approved seller verified for other edits", async () => {
    given(profile({ verificationStatus: "approved" }));
    await service.saveProfile(SELLER, input({ about: "New text" }), now);
    expect(statusChanges()).toEqual([]);
  });

  it("attaches a new logo as this seller, for the logo purpose only", async () => {
    given(profile());
    await service.saveProfile(SELLER, input({ logoUploadId: UPLOAD }), now);
    expect(upload.attachUpload).toHaveBeenCalledWith(SELLER, UPLOAD, "seller_logo");
  });

  it("does not attach again when the logo is unchanged", async () => {
    given(profile({ logoUploadId: UPLOAD }));
    await service.saveProfile(SELLER, input({ logoUploadId: UPLOAD }), now);
    expect(upload.attachUpload).not.toHaveBeenCalled();
  });
});

describe("submitDocument", () => {
  it("replaces the current document of that type, keeping the old one", async () => {
    given(profile());
    await service.submitDocument(SELLER, "owner_id", { uploadId: UPLOAD, documentNumber: null }, now);
    expect(upload.attachUpload).toHaveBeenCalledWith(SELLER, UPLOAD, "seller_document");
    expect(repo.supersedeCurrentDocument).toHaveBeenCalledWith(expect.anything(), SELLER, "owner_id");
    expect(repo.insertDocument).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ sellerUserId: SELLER, type: "owner_id", uploadId: UPLOAD }));
  });

  it("refuses without a profile, while under review, and VAT when not registered", async () => {
    given(undefined);
    await expect(service.submitDocument(SELLER, "owner_id", { uploadId: UPLOAD, documentNumber: null }, now)).rejects.toMatchObject({ status: 400 });
    given(profile({ verificationStatus: "pending" }));
    await expect(service.submitDocument(SELLER, "owner_id", { uploadId: UPLOAD, documentNumber: null }, now)).rejects.toMatchObject({ status: 409 });
    given(profile({ vatRegistered: false }));
    await expect(service.submitDocument(SELLER, "vat_certificate", { uploadId: UPLOAD, documentNumber: null }, now)).rejects.toMatchObject({ status: 400 });
    expect(upload.attachUpload).not.toHaveBeenCalled();
    expect(repo.insertDocument).not.toHaveBeenCalled();
  });

  it("refuses if the review started between the check and the write (row lock)", async () => {
    vi.mocked(repo.findProfile).mockResolvedValue(profile());
    vi.mocked(repo.lockProfile).mockResolvedValue(profile({ verificationStatus: "pending" }));
    vi.mocked(repo.findCurrentDocuments).mockResolvedValue([]);
    await expect(service.submitDocument(SELLER, "owner_id", { uploadId: UPLOAD, documentNumber: null }, now)).rejects.toMatchObject({ status: 409 });
    expect(repo.insertDocument).not.toHaveBeenCalled();
  });

  it("sends an approved seller back to review when a document changes", async () => {
    given(profile({ verificationStatus: "approved" }));
    await service.submitDocument(SELLER, "bank_proof", { uploadId: UPLOAD, documentNumber: null }, now);
    expect(statusChanges()).toEqual(["approved->pending"]);
  });
});

describe("getDocumentLink", () => {
  it("returns not found for a document that is not this seller's", async () => {
    vi.mocked(repo.findOwnDocument).mockResolvedValue(undefined);
    await expect(service.getDocumentLink(SELLER, "55555555-5555-4555-8555-555555555555")).rejects.toMatchObject({ status: 404 });
    expect(repo.findOwnDocument).toHaveBeenCalledWith("55555555-5555-4555-8555-555555555555", SELLER);
    expect(upload.getDownloadLink).not.toHaveBeenCalled();
  });
});
