import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  Object.assign(process.env, {
    DATABASE_URL: "postgres://test:test@localhost:5432/test",
    JWT_SECRET: "test-secret-that-is-at-least-32-characters-long",
  });
});

vi.mock("./chat.repository", () => ({ insertPhoto: vi.fn(), findPhoto: vi.fn() }));
vi.mock("../auth", () => ({ getUsersByIds: vi.fn() }));
vi.mock("../rfq", () => ({ getRfqForChat: vi.fn(), listRfqsWithoutChat: vi.fn(), markRfqChatOpened: vi.fn() }));
vi.mock("../seller", () => ({ getSellerCompanies: vi.fn() }));
vi.mock("../upload", () => ({ attachUpload: vi.fn(), getDownloadLink: vi.fn() }));
vi.mock("../../shared/jobs", () => ({ enqueueJob: vi.fn(async () => true), wakeWorker: vi.fn() }));

const repo = await import("./chat.repository");
const { getUsersByIds } = await import("../auth");
const rfqModule = await import("../rfq");
const { getSellerCompanies } = await import("../seller");
const upload = await import("../upload");
const jobs = await import("../../shared/jobs");
const { badRequest } = await import("../../shared/errors");
const { ChatProviderError, SYSTEM_USER_ID } = await import("./chat-provider");
const service = await import("./chat.service");

const BUYER = "11111111-1111-4111-8111-111111111111";
const SELLER = "22222222-2222-4222-8222-222222222222";
const STRANGER = "33333333-3333-4333-8333-333333333333";
const RFQ = "44444444-4444-4444-8444-444444444444";
const PHOTO = "55555555-5555-4555-8555-555555555555";
const now = new Date("2026-11-19T10:00:00Z");

const chat = {
  name: "fake",
  apiKey: "public-key",
  ensureSetup: vi.fn(async () => {}),
  upsertUsers: vi.fn(async () => {}),
  openChannel: vi.fn(async () => {}),
  sendMessage: vi.fn(async () => {}),
  createUserToken: vi.fn(async (userId: string) => `token-for-${userId}`),
};

const rfq = (overrides: Partial<{ chatOpenedAt: Date | null }> = {}) => ({
  id: RFQ,
  reference: "RQ-1001",
  buyerUserId: BUYER,
  sellerUserId: SELLER,
  partName: "Hydraulic oil filter",
  chatOpenedAt: now as Date | null,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  service.setChatProvider(chat);
  vi.mocked(getUsersByIds).mockResolvedValue([
    { id: BUYER, email: "b@example.com", fullName: "Khalid", role: "buyer", createdAt: now.toISOString() },
    { id: SELLER, email: "s@example.com", fullName: "Sami", role: "seller", createdAt: now.toISOString() },
  ] as never);
  vi.mocked(getSellerCompanies).mockResolvedValue(new Map([[SELLER, { companyName: "Gulf Hydraulic Parts", city: "Muscat", country: "OM" as const }]]) as never);
  vi.mocked(rfqModule.getRfqForChat).mockResolvedValue(rfq());
  vi.mocked(rfqModule.listRfqsWithoutChat).mockResolvedValue([]);
  vi.mocked(repo.insertPhoto).mockResolvedValue({ id: "p", rfqId: RFQ, uploadId: PHOTO, senderUserId: BUYER, createdAt: now });
});

describe("chat token", () => {
  it("is for the caller's OWN user only, short-lived, and names a seller by their company", async () => {
    const token = await service.issueChatToken({ userId: SELLER, role: "seller" }, now);
    expect(token).toMatchObject({ apiKey: "public-key", userId: SELLER, token: `token-for-${SELLER}` });
    expect(new Date(token.expiresAt).getTime() - now.getTime()).toBe(service.CHAT_TOKEN_MS);
    expect(chat.createUserToken).toHaveBeenCalledWith(SELLER, now, new Date(token.expiresAt));
    expect(chat.upsertUsers).toHaveBeenCalledWith([{ id: SELLER, name: "Gulf Hydraulic Parts" }]);
  });

  it("is refused for an admin (not a chat side) and when chat is off", async () => {
    await expect(service.issueChatToken({ userId: STRANGER, role: "admin" }, now)).rejects.toMatchObject({ status: 404 });
    service.setChatProvider(null);
    await expect(service.issueChatToken({ userId: BUYER, role: "buyer" }, now)).rejects.toMatchObject({ status: 503, code: "chat_unavailable" });
  });

  it("queues the caller's older requests whose chat is not open yet", async () => {
    vi.mocked(rfqModule.listRfqsWithoutChat).mockResolvedValue([RFQ]);
    await service.issueChatToken({ userId: BUYER, role: "buyer" }, now);
    expect(rfqModule.listRfqsWithoutChat).toHaveBeenCalledWith("buyer", BUYER, 50);
    expect(jobs.enqueueJob).toHaveBeenCalledWith("chat", "open-rfq-chat", { rfqId: RFQ }, expect.objectContaining({ dedupeKey: `chat-open-${RFQ}-2026-11-19T10` }));
  });

  it("hides the chat service's error from the user", async () => {
    chat.upsertUsers.mockRejectedValueOnce(new ChatProviderError("Stream POST /users answered 500 (code 1)", true));
    const error = await service.issueChatToken({ userId: BUYER, role: "buyer" }, now).catch((caught: Error) => caught);
    expect(error).toMatchObject({ status: 503 });
    expect((error as Error).message).not.toContain("Stream");
  });
});

describe("opening a conversation (background job)", () => {
  it("puts exactly the request's buyer and seller in it, created by Muhrak, and posts the card from the buyer once", async () => {
    vi.mocked(rfqModule.getRfqForChat).mockResolvedValue(rfq({ chatOpenedAt: null }));
    await service.runChatJob({ id: "j1", payload: { rfqId: RFQ } }, now);
    expect(chat.openChannel).toHaveBeenCalledWith({
      channelId: RFQ,
      memberIds: [BUYER, SELLER],
      createdById: SYSTEM_USER_ID,
      data: { rfq_id: RFQ, name: "RQ-1001 · Hydraulic oil filter" },
    });
    expect(chat.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ channelId: RFQ, userId: BUYER, messageId: `card-${RFQ}`, attachments: [{ type: "muhrak_rfq", rfq_id: RFQ }] }));
    expect(rfqModule.markRfqChatOpened).toHaveBeenCalledWith(RFQ, now);
  });

  it("does nothing for a conversation already open", async () => {
    await service.runChatJob({ id: "j1", payload: { rfqId: RFQ } }, now);
    expect(chat.openChannel).not.toHaveBeenCalled();
  });

  it("stops (no retry) on a refused call or a missing request; retries an outage", async () => {
    vi.mocked(rfqModule.getRfqForChat).mockResolvedValue(rfq({ chatOpenedAt: null }));
    chat.openChannel.mockRejectedValueOnce(new ChatProviderError("refused", false));
    await expect(service.runChatJob({ id: "j1", payload: { rfqId: RFQ } }, now)).rejects.toBeInstanceOf(service.PermanentChatJobError);
    chat.openChannel.mockRejectedValueOnce(new ChatProviderError("down", true));
    const outage = await service.runChatJob({ id: "j1", payload: { rfqId: RFQ } }, now).catch((caught: Error) => caught);
    expect(outage).not.toBeInstanceOf(service.PermanentChatJobError);
    expect(rfqModule.markRfqChatOpened).not.toHaveBeenCalled();
    vi.mocked(rfqModule.getRfqForChat).mockResolvedValue(undefined);
    await expect(service.runChatJob({ id: "j1", payload: { rfqId: RFQ } }, now)).rejects.toBeInstanceOf(service.PermanentChatJobError);
    await expect(service.runChatJob({ id: "j1", payload: { rfqId: "not-a-uuid" } }, now)).rejects.toBeInstanceOf(service.PermanentChatJobError);
  });
});

describe("photos", () => {
  it("the buyer or seller sends their own chat photo: tied to this request, posted by the API", async () => {
    await service.sendPhoto(SELLER, RFQ, PHOTO);
    expect(upload.attachUpload).toHaveBeenCalledWith(SELLER, PHOTO, "chat_photo");
    expect(repo.insertPhoto).toHaveBeenCalledWith({ rfqId: RFQ, uploadId: PHOTO, senderUserId: SELLER });
    expect(chat.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ channelId: RFQ, userId: SELLER, attachments: [{ type: "muhrak_photo", upload_id: PHOTO }] }));
  });

  it("someone outside the conversation gets 404 and nothing is attached, posted or linked", async () => {
    await expect(service.sendPhoto(STRANGER, RFQ, PHOTO)).rejects.toMatchObject({ status: 404 });
    await expect(service.getPhotoLink(STRANGER, RFQ, PHOTO, now)).rejects.toMatchObject({ status: 404 });
    expect(upload.attachUpload).not.toHaveBeenCalled();
    expect(chat.sendMessage).not.toHaveBeenCalled();
    expect(upload.getDownloadLink).not.toHaveBeenCalled();
  });

  it("someone else's, an unchecked or an already used upload is refused before anything is posted", async () => {
    vi.mocked(upload.attachUpload).mockRejectedValueOnce(badRequest("This file cannot be used. Please upload it again."));
    await expect(service.sendPhoto(BUYER, RFQ, PHOTO)).rejects.toMatchObject({ status: 400 });
    expect(repo.insertPhoto).not.toHaveBeenCalled();
    expect(chat.sendMessage).not.toHaveBeenCalled();
  });

  it("a conversation still being set up: 409", async () => {
    vi.mocked(rfqModule.getRfqForChat).mockResolvedValue(rfq({ chatOpenedAt: null }));
    await expect(service.sendPhoto(BUYER, RFQ, PHOTO)).rejects.toMatchObject({ status: 409 });
  });

  it("a link only for a photo of THIS conversation (another request's photo id: 404)", async () => {
    vi.mocked(repo.findPhoto).mockResolvedValue(undefined);
    await expect(service.getPhotoLink(BUYER, RFQ, PHOTO, now)).rejects.toMatchObject({ status: 404 });
    vi.mocked(repo.findPhoto).mockResolvedValue({ id: "p", rfqId: RFQ, uploadId: PHOTO, senderUserId: SELLER, createdAt: now });
    vi.mocked(upload.getDownloadLink).mockResolvedValue({ url: "https://bucket.example/signed", expiresAt: now.toISOString() });
    await expect(service.getPhotoLink(BUYER, RFQ, PHOTO, now)).resolves.toMatchObject({ url: "https://bucket.example/signed" });
    expect(upload.getDownloadLink).toHaveBeenCalledWith(PHOTO, service.PHOTO_LINK_SECONDS, now);
  });
});
