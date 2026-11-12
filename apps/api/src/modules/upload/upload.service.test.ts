import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UploadRow } from "../../db/schema";

vi.hoisted(() => {
  Object.assign(process.env, {
    DATABASE_URL: "postgres://test:test@localhost:5432/test",
    REDIS_URL: "redis://localhost:6379",
    JWT_SECRET: "test-secret-that-is-at-least-32-characters-long",
  });
});
vi.mock("./upload.repository", () => ({
  insertUpload: vi.fn(),
  findUpload: vi.fn(),
  findUploads: vi.fn(),
  markReady: vi.fn(),
  markRejected: vi.fn(),
  attach: vi.fn(),
}));
vi.mock("../../shared/redis", () => ({
  getRedis: () => {
    throw new Error("no redis in tests");
  },
}));

const repo = await import("./upload.repository");
const { setStorage } = await import("./storage");
const { createUpload, completeUpload, attachUpload, pendingKey, UPLOAD_COMPLETE_WINDOW_MS } = await import("./upload.service");

const SELLER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const UPLOAD = "33333333-3333-4333-8333-333333333333";
const now = new Date("2026-11-12T10:00:00Z");

const PDF = new TextEncoder().encode("%PDF-1.4\n%âãÏÓ\n1 0 obj<<>>endobj\n");
const EXE = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00]);

const storage = {
  createUploadUrl: vi.fn(async () => ({ url: "https://bucket.example/pending/x?sig", headers: { "Content-Type": "application/pdf" } })),
  stat: vi.fn(),
  readStart: vi.fn(),
  copy: vi.fn(),
  createDownloadUrl: vi.fn(),
};

function row(overrides: Partial<UploadRow> = {}): UploadRow {
  return {
    id: UPLOAD,
    ownerUserId: SELLER,
    purpose: "seller_document",
    contentType: "application/pdf",
    sizeBytes: PDF.length,
    storageKey: `files/seller_document/${UPLOAD}.pdf`,
    status: "pending",
    rejectedReason: null,
    completedAt: null,
    attachedAt: null,
    createdAt: new Date(now.getTime() - 60_000),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  setStorage(storage);
  vi.mocked(repo.insertUpload).mockImplementation(async (values) => row({ ...values, id: values.id ?? UPLOAD } as Partial<UploadRow>));
});

describe("createUpload", () => {
  it("signs a link for the pending key with the exact type and size", async () => {
    const result = await createUpload({ userId: SELLER, role: "seller" }, { purpose: "seller_document", contentType: "application/pdf", sizeBytes: 1000 }, now);
    const [key, file] = storage.createUploadUrl.mock.calls[0] as unknown as [string, { contentType: string; sizeBytes: number }];
    expect(key).toBe(pendingKey(result.uploadId));
    expect(file).toEqual({ contentType: "application/pdf", sizeBytes: 1000 });
    const inserted = vi.mocked(repo.insertUpload).mock.calls[0]![0];
    expect(inserted.storageKey).toMatch(/^files\/seller_document\/[0-9a-f-]{36}\.pdf$/);
  });

  it("refuses a buyer uploading seller files", async () => {
    await expect(
      createUpload({ userId: SELLER, role: "buyer" }, { purpose: "seller_logo", contentType: "image/png", sizeBytes: 10 }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("refuses a type or size the purpose does not allow", async () => {
    const seller = { userId: SELLER, role: "seller" as const };
    await expect(createUpload(seller, { purpose: "seller_logo", contentType: "application/pdf", sizeBytes: 10 })).rejects.toMatchObject({ status: 400 });
    await expect(createUpload(seller, { purpose: "seller_logo", contentType: "image/png", sizeBytes: 2 * 1024 * 1024 + 1 })).rejects.toMatchObject({ status: 400 });
    expect(repo.insertUpload).not.toHaveBeenCalled();
  });
});

describe("completeUpload", () => {
  it("accepts a file whose bytes match, copying exactly the checked version", async () => {
    vi.mocked(repo.findUpload).mockResolvedValue(row());
    storage.stat.mockResolvedValue({ sizeBytes: PDF.length, etag: '"v1"' });
    storage.readStart.mockResolvedValue(PDF);
    vi.mocked(repo.markReady).mockResolvedValue(row({ status: "ready" }));

    const upload = await completeUpload(SELLER, UPLOAD, now);
    expect(upload.status).toBe("ready");
    expect(storage.readStart).toHaveBeenCalledWith(pendingKey(UPLOAD), '"v1"', PDF.length);
    expect(storage.copy).toHaveBeenCalledWith(pendingKey(UPLOAD), row().storageKey, '"v1"', "application/pdf");
  });

  it("treats someone else's upload as not found", async () => {
    vi.mocked(repo.findUpload).mockResolvedValue(row({ ownerUserId: OTHER }));
    await expect(completeUpload(SELLER, UPLOAD, now)).rejects.toMatchObject({ status: 404 });
    expect(storage.stat).not.toHaveBeenCalled();
  });

  it("rejects a renamed file (an .exe declared as PDF)", async () => {
    vi.mocked(repo.findUpload).mockResolvedValue(row({ sizeBytes: EXE.length }));
    storage.stat.mockResolvedValue({ sizeBytes: EXE.length, etag: '"v1"' });
    storage.readStart.mockResolvedValue(EXE);
    await expect(completeUpload(SELLER, UPLOAD, now)).rejects.toMatchObject({ status: 400 });
    expect(repo.markRejected).toHaveBeenCalled();
    expect(storage.copy).not.toHaveBeenCalled();
  });

  it("rejects a stored file of a different size", async () => {
    vi.mocked(repo.findUpload).mockResolvedValue(row());
    storage.stat.mockResolvedValue({ sizeBytes: PDF.length + 1, etag: '"v1"' });
    await expect(completeUpload(SELLER, UPLOAD, now)).rejects.toMatchObject({ status: 400 });
    expect(repo.markRejected).toHaveBeenCalled();
    expect(storage.copy).not.toHaveBeenCalled();
  });

  it("refuses an upload started too long ago", async () => {
    vi.mocked(repo.findUpload).mockResolvedValue(row({ createdAt: new Date(now.getTime() - UPLOAD_COMPLETE_WINDOW_MS - 1) }));
    await expect(completeUpload(SELLER, UPLOAD, now)).rejects.toMatchObject({ status: 400 });
  });

  it("is safe to repeat once ready, and a rejected file stays rejected", async () => {
    vi.mocked(repo.findUpload).mockResolvedValue(row({ status: "ready" }));
    await expect(completeUpload(SELLER, UPLOAD, now)).resolves.toMatchObject({ status: "ready" });
    vi.mocked(repo.findUpload).mockResolvedValue(row({ status: "rejected" }));
    await expect(completeUpload(SELLER, UPLOAD, now)).rejects.toMatchObject({ status: 400 });
    expect(storage.stat).not.toHaveBeenCalled();
  });
});

describe("attachUpload", () => {
  it("passes owner and purpose to the conditional update, and fails when it matches nothing", async () => {
    vi.mocked(repo.attach).mockResolvedValue(undefined);
    await expect(attachUpload(OTHER, UPLOAD, "seller_logo")).rejects.toMatchObject({ status: 400 });
    expect(repo.attach).toHaveBeenCalledWith(UPLOAD, OTHER, "seller_logo");
  });
});
