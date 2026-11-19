import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RfqRow } from "../../db/schema";
import type { RfqCreateInput } from "../../schemas";

vi.hoisted(() => {
  Object.assign(process.env, {
    DATABASE_URL: "postgres://test:test@localhost:5432/test",
    JWT_SECRET: "test-secret-that-is-at-least-32-characters-long",
  });
});

const TX = { tx: true };
vi.mock("./rfq.repository", () => ({
  inTransaction: vi.fn(async (work: (tx: unknown) => unknown) => work(TX)),
  insertRfq: vi.fn(),
  expireStaleForProduct: vi.fn(),
  findByRequestKey: vi.fn(),
  findRfq: vi.fn(),
  countOpenForBuyer: vi.fn(),
  listRfqs: vi.fn(),
  countRfqs: vi.fn(),
  transition: vi.fn(),
  markSeen: vi.fn(),
  expireDue: vi.fn(),
}));
vi.mock("../auth", () => ({ getUsersByIds: vi.fn() }));
vi.mock("../catalog", () => ({ getLiveProductForRfq: vi.fn(), getProductSnapshots: vi.fn() }));
vi.mock("../notification", () => ({ sendNewRfqEmail: vi.fn() }));
vi.mock("../seller", () => ({ getSellerCompanies: vi.fn(), isSellerVerified: vi.fn() }));
vi.mock("../../shared/jobs", () => ({ wakeWorker: vi.fn(), enqueueJob: vi.fn(async () => true) }));
vi.mock("../ai", () => ({ getIdentificationPhotoUpload: vi.fn() }));
vi.mock("../upload", () => ({ getDownloadLink: vi.fn() }));

const repo = await import("./rfq.repository");
const { getUsersByIds } = await import("../auth");
const { getLiveProductForRfq, getProductSnapshots } = await import("../catalog");
const { sendNewRfqEmail } = await import("../notification");
const { getSellerCompanies, isSellerVerified } = await import("../seller");
const { getIdentificationPhotoUpload } = await import("../ai");
const { getDownloadLink } = await import("../upload");
const { notFound } = await import("../../shared/errors");
const service = await import("./rfq.service");

const BUYER = "11111111-1111-4111-8111-111111111111";
const OTHER_BUYER = "22222222-2222-4222-8222-222222222222";
const SELLER = "33333333-3333-4333-8333-333333333333";
const OTHER_SELLER = "44444444-4444-4444-8444-444444444444";
const PRODUCT = "55555555-5555-4555-8555-555555555555";
const OTHER_PRODUCT = "66666666-6666-4666-8666-666666666666";
const RFQ = "77777777-7777-4777-8777-777777777777";
const KEY = "88888888-8888-4888-8888-888888888888";
const now = new Date("2026-11-15T10:00:00.000Z");

function input(overrides: Partial<RfqCreateInput> = {}): RfqCreateInput {
  return {
    productId: PRODUCT,
    requestKey: KEY,
    partName: "Breaker front head bushing",
    partNumber: "15-FB-02",
    fitment: "Korvex KHB-1550",
    quantity: 2,
    neededBy: "one_week",
    deliveryCountry: "OM",
    deliveryCity: "Muscat",
    note: null,
    ...overrides,
  };
}

function row(overrides: Partial<RfqRow> = {}): RfqRow {
  return {
    id: RFQ,
    number: 1001,
    buyerUserId: BUYER,
    sellerUserId: SELLER,
    productId: PRODUCT,
    requestKey: KEY,
    partName: "Breaker front head bushing",
    partNumber: "15-FB-02",
    fitment: "Korvex KHB-1550",
    quantity: 2,
    unit: "set",
    neededBy: "one_week",
    deliveryCountry: "OM",
    deliveryCity: "Muscat",
    note: null,
    buyerPhotoUploadId: null,
    chatOpenedAt: null,
    status: "open",
    sellerSeenAt: null,
    declineReason: null,
    expiresAt: new Date(now.getTime() + 7 * 86_400_000),
    closedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

const user = (id: string, role: "buyer" | "seller", name: string) => ({
  id,
  email: `${name.toLowerCase().replace(/\s/g, ".")}@example.com`,
  fullName: name,
  role,
  createdAt: now.toISOString(),
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(repo.findByRequestKey).mockResolvedValue(undefined);
  vi.mocked(repo.countOpenForBuyer).mockResolvedValue(0);
  vi.mocked(repo.insertRfq).mockImplementation(async (_tx, values) => row({ ...values, unit: values.unit, expiresAt: values.expiresAt as Date }));
  vi.mocked(getLiveProductForRfq).mockResolvedValue({ id: PRODUCT, sellerUserId: SELLER, name: "Front head bushing", unit: "set" });
  vi.mocked(isSellerVerified).mockResolvedValue(true);
  vi.mocked(getUsersByIds).mockResolvedValue([user(SELLER, "seller", "Najd Equipment"), user(BUYER, "buyer", "Khalid Al Amri")]);
  vi.mocked(getProductSnapshots).mockResolvedValue(new Map([[PRODUCT, { id: PRODUCT, name: "Front head bushing", photoUrl: null }]]));
  vi.mocked(getSellerCompanies).mockResolvedValue(new Map([[SELLER, { companyName: "Najd Equipment", city: "Riyadh", country: "SA" as const }]]));
});

describe("createRfq", () => {
  it("takes the seller and unit from the live product, expires in 7 days, and queues the seller email in the same transaction", async () => {
    const { rfq, created } = await service.createRfq(BUYER, input(), now);
    expect(created).toBe(true);
    const values = vi.mocked(repo.insertRfq).mock.calls[0]![1];
    expect(values).toMatchObject({ buyerUserId: BUYER, sellerUserId: SELLER, productId: PRODUCT, unit: "set" });
    expect(values.expiresAt).toEqual(new Date("2026-11-22T10:00:00.000Z"));
    expect(sendNewRfqEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "najd.equipment@example.com", reference: "RQ-1001", quantity: "2 sets", rfqId: RFQ }),
      TX,
    );
    expect(rfq).toMatchObject({ reference: "RQ-1001", status: "open", seller: { companyName: "Najd Equipment", countryName: "Saudi Arabia" } });
    // Day 10: the chat is opened by a job queued in the same transaction, once per request.
    const { enqueueJob } = await import("../../shared/jobs");
    expect(enqueueJob).toHaveBeenCalledWith("chat", "open-rfq-chat", { rfqId: RFQ }, expect.objectContaining({ dedupeKey: `chat-open-${RFQ}`, tx: TX }));
  });

  it("a double submit (same request key) returns the first request: no second row, no second email", async () => {
    vi.mocked(repo.findByRequestKey).mockResolvedValue(row());
    const { rfq, created } = await service.createRfq(BUYER, input(), now);
    expect(created).toBe(false);
    expect(rfq.id).toBe(RFQ);
    expect(repo.insertRfq).not.toHaveBeenCalled();
    expect(sendNewRfqEmail).not.toHaveBeenCalled();
  });

  it("refuses a request key reused for another product", async () => {
    vi.mocked(repo.findByRequestKey).mockResolvedValue(row({ productId: OTHER_PRODUCT }));
    await expect(service.createRfq(BUYER, input(), now)).rejects.toMatchObject({ status: 400 });
    expect(repo.insertRfq).not.toHaveBeenCalled();
  });

  it("404 for a product that is not live, and for a seller who is not verified", async () => {
    vi.mocked(getLiveProductForRfq).mockResolvedValueOnce(undefined);
    await expect(service.createRfq(BUYER, input(), now)).rejects.toMatchObject({ status: 404 });
    vi.mocked(isSellerVerified).mockResolvedValueOnce(false);
    await expect(service.createRfq(BUYER, input(), now)).rejects.toMatchObject({ status: 404 });
    expect(repo.insertRfq).not.toHaveBeenCalled();
  });

  it("404 when the 'buyer' account is not a buyer (tampered or wrong side)", async () => {
    vi.mocked(getUsersByIds).mockResolvedValue([user(SELLER, "seller", "Najd"), user(BUYER, "seller", "Not a buyer")]);
    await expect(service.createRfq(BUYER, input(), now)).rejects.toMatchObject({ status: 404 });
    expect(repo.insertRfq).not.toHaveBeenCalled();
  });

  it("caps open requests per buyer", async () => {
    vi.mocked(repo.countOpenForBuyer).mockResolvedValue(50);
    await expect(service.createRfq(BUYER, input(), now)).rejects.toMatchObject({ status: 403 });
    expect(repo.insertRfq).not.toHaveBeenCalled();
  });

  it("409 when the buyer already has an open request for this product (no email)", async () => {
    vi.mocked(repo.insertRfq).mockResolvedValue(undefined);
    await expect(service.createRfq(BUYER, input(), now)).rejects.toMatchObject({ status: 409 });
    expect(sendNewRfqEmail).not.toHaveBeenCalled();
  });

  it("two simultaneous submits of the same form: the loser gets the winner's request", async () => {
    vi.mocked(repo.insertRfq).mockResolvedValue(undefined);
    vi.mocked(repo.findByRequestKey).mockResolvedValueOnce(undefined).mockResolvedValueOnce(row());
    const { rfq, created } = await service.createRfq(BUYER, input(), now);
    expect(created).toBe(false);
    expect(rfq.id).toBe(RFQ);
  });

  it("closes this buyer's stale open request for the product before inserting", async () => {
    await service.createRfq(BUYER, input(), now);
    expect(repo.expireStaleForProduct).toHaveBeenCalledWith(TX, { buyerUserId: BUYER, productId: PRODUCT, at: now });
  });
});

describe("the buyer's photo (Muhrak AI)", () => {
  const IDENT = "99999999-9999-4999-8999-999999999999";
  const PHOTO = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

  it("attaches the photo of the buyer's OWN finished photo search, checked by the AI module", async () => {
    vi.mocked(getIdentificationPhotoUpload).mockResolvedValue(PHOTO);
    const { rfq } = await service.createRfq(BUYER, input({ identificationId: IDENT }), now);
    expect(getIdentificationPhotoUpload).toHaveBeenCalledWith(BUYER, IDENT);
    expect(vi.mocked(repo.insertRfq).mock.calls[0]![1]).toMatchObject({ buyerPhotoUploadId: PHOTO });
    expect(rfq).toMatchObject({ hasBuyerPhoto: true, buyerPhotoUrl: null });
  });

  it("refuses another buyer's (or an unfinished) photo search: 404, nothing saved, no email", async () => {
    vi.mocked(getIdentificationPhotoUpload).mockRejectedValue(notFound("Photo search not found"));
    await expect(service.createRfq(BUYER, input({ identificationId: IDENT }), now)).rejects.toMatchObject({ status: 404 });
    expect(repo.insertRfq).not.toHaveBeenCalled();
    expect(sendNewRfqEmail).not.toHaveBeenCalled();
  });

  it("without a photo search nothing is attached", async () => {
    await service.createRfq(BUYER, input(), now);
    expect(getIdentificationPhotoUpload).not.toHaveBeenCalled();
    expect(vi.mocked(repo.insertRfq).mock.calls[0]![1]).toMatchObject({ buyerPhotoUploadId: null });
  });

  it("the request's seller and buyer get a 10-minute link; lists never carry one", async () => {
    vi.mocked(repo.findRfq).mockResolvedValue(row({ buyerPhotoUploadId: PHOTO, sellerSeenAt: now }));
    vi.mocked(getDownloadLink).mockResolvedValue({ url: "https://bucket.example/signed", expiresAt: now.toISOString() });
    await expect(service.getSellerRfq(SELLER, RFQ, now)).resolves.toMatchObject({ hasBuyerPhoto: true, buyerPhotoUrl: "https://bucket.example/signed" });
    await expect(service.getBuyerRfq(BUYER, RFQ, now)).resolves.toMatchObject({ buyerPhotoUrl: "https://bucket.example/signed" });
    expect(getDownloadLink).toHaveBeenCalledWith(PHOTO, service.BUYER_PHOTO_LINK_SECONDS, now);

    vi.mocked(repo.listRfqs).mockResolvedValue([row({ buyerPhotoUploadId: PHOTO })]);
    vi.mocked(repo.countRfqs).mockResolvedValue({ all: 1, open: 1, quoted: 0, closed: 0, unseen: 1 });
    const list = await service.listSellerRfqs(SELLER, { filter: "all", limit: 20 }, now);
    expect(list.items[0]).toMatchObject({ hasBuyerPhoto: true, buyerPhotoUrl: null });
    expect(getDownloadLink).toHaveBeenCalledTimes(2);
  });

  it("another seller or buyer never gets a link (404 before any link is made)", async () => {
    vi.mocked(repo.findRfq).mockResolvedValue(row({ buyerPhotoUploadId: PHOTO }));
    await expect(service.getSellerRfq(OTHER_SELLER, RFQ, now)).rejects.toMatchObject({ status: 404 });
    await expect(service.getBuyerRfq(OTHER_BUYER, RFQ, now)).rejects.toMatchObject({ status: 404 });
    expect(getDownloadLink).not.toHaveBeenCalled();
  });
});

describe("ownership", () => {
  it("a buyer cannot see or cancel another buyer's request (404)", async () => {
    vi.mocked(repo.findRfq).mockResolvedValue(row({ buyerUserId: OTHER_BUYER }));
    await expect(service.getBuyerRfq(BUYER, RFQ, now)).rejects.toMatchObject({ status: 404 });
    await expect(service.cancelRfq(BUYER, RFQ, now)).rejects.toMatchObject({ status: 404 });
    expect(repo.transition).not.toHaveBeenCalled();
  });

  it("a seller cannot see or decline a request sent to another seller (404), and it is not marked seen", async () => {
    vi.mocked(repo.findRfq).mockResolvedValue(row({ sellerUserId: OTHER_SELLER }));
    await expect(service.getSellerRfq(SELLER, RFQ, now)).rejects.toMatchObject({ status: 404 });
    await expect(service.declineRfq(SELLER, RFQ, null, now)).rejects.toMatchObject({ status: 404 });
    expect(repo.markSeen).not.toHaveBeenCalled();
    expect(repo.transition).not.toHaveBeenCalled();
  });

  it("the seller sees the buyer's name only, never their email", async () => {
    vi.mocked(repo.findRfq).mockResolvedValue(row());
    vi.mocked(repo.markSeen).mockResolvedValue(row({ sellerSeenAt: now }));
    const rfq = await service.getSellerRfq(SELLER, RFQ, now);
    expect(rfq.buyer).toEqual({ name: "Khalid Al Amri" });
    expect(rfq.seen).toBe(true);
    expect(JSON.stringify(rfq)).not.toContain("@");
  });

  it("the buyer sees the seller's public name and place, never contact details", async () => {
    vi.mocked(repo.findRfq).mockResolvedValue(row());
    const rfq = await service.getBuyerRfq(BUYER, RFQ, now);
    expect(rfq.seller).toEqual({ id: SELLER, companyName: "Najd Equipment", city: "Riyadh", countryName: "Saudi Arabia" });
    expect(JSON.stringify(rfq)).not.toContain("@");
  });
});

describe("transitions", () => {
  it("only an open request can change, and only to the listed status", () => {
    for (const t of Object.values(service.RFQ_TRANSITIONS)) expect(t.from).toEqual(["open"]);
    expect(service.RFQ_TRANSITIONS.cancel).toMatchObject({ by: "buyer", to: "cancelled" });
    expect(service.RFQ_TRANSITIONS.decline).toMatchObject({ by: "seller", to: "declined" });
  });

  it("cancel is a conditional update scoped to the buyer", async () => {
    vi.mocked(repo.findRfq).mockResolvedValue(row());
    vi.mocked(repo.transition).mockResolvedValue(row({ status: "cancelled", closedAt: now }));
    const rfq = await service.cancelRfq(BUYER, RFQ, now);
    expect(repo.transition).toHaveBeenCalledWith({ id: RFQ, owner: { buyerUserId: BUYER }, from: ["open"], to: "cancelled", at: now });
    expect(rfq.status).toBe("cancelled");
  });

  it("decline is scoped to the seller and keeps the reason", async () => {
    vi.mocked(repo.findRfq).mockResolvedValue(row());
    vi.mocked(repo.transition).mockResolvedValue(row({ status: "declined", closedAt: now, declineReason: "Out of stock" }));
    await service.declineRfq(SELLER, RFQ, "Out of stock", now);
    expect(repo.transition).toHaveBeenCalledWith(
      expect.objectContaining({ owner: { sellerUserId: SELLER }, from: ["open"], to: "declined", declineReason: "Out of stock" }),
    );
  });

  it("409 for an illegal change (cancel a declined request) or a lost race (double click)", async () => {
    vi.mocked(repo.transition).mockResolvedValue(undefined);
    vi.mocked(repo.findRfq).mockResolvedValue(row({ status: "declined", closedAt: now }));
    await expect(service.cancelRfq(BUYER, RFQ, now)).rejects.toMatchObject({ status: 409 });
    vi.mocked(repo.findRfq).mockResolvedValue(row());
    await expect(service.declineRfq(SELLER, RFQ, null, now)).rejects.toMatchObject({ status: 409 });
  });

  it("an open request past its time shows as expired and cannot be cancelled or declined", async () => {
    const late = new Date(now.getTime() + 8 * 86_400_000);
    vi.mocked(repo.findRfq).mockResolvedValue(row());
    vi.mocked(repo.transition).mockResolvedValue(undefined);
    expect((await service.getBuyerRfq(BUYER, RFQ, late)).status).toBe("expired");
    await expect(service.cancelRfq(BUYER, RFQ, late)).rejects.toMatchObject({ status: 409, message: expect.stringContaining("expired") });
  });

  it("the expiry sweep runs in batches until none is left", async () => {
    vi.mocked(repo.expireDue).mockResolvedValueOnce(500).mockResolvedValueOnce(3);
    expect(await service.expireDueRfqs(now)).toBe(503);
    expect(repo.expireDue).toHaveBeenCalledTimes(2);
  });
});

describe("lists", () => {
  it("a tampered page cursor is a 400, not a query", async () => {
    await expect(service.listBuyerRfqs(BUYER, { filter: "all", limit: 20, cursor: "bm90LWpzb24" }, now)).rejects.toMatchObject({ status: 400 });
    expect(repo.listRfqs).not.toHaveBeenCalled();
  });

  it("lists only the caller's own requests, and the seller list carries the unseen count", async () => {
    vi.mocked(repo.listRfqs).mockResolvedValue([row()]);
    vi.mocked(repo.countRfqs).mockResolvedValue({ all: 1, open: 1, quoted: 0, closed: 0, unseen: 1 });
    const page = await service.listSellerRfqs(SELLER, { filter: "open", limit: 20 }, now);
    expect(repo.listRfqs).toHaveBeenCalledWith(expect.objectContaining({ side: "seller", userId: SELLER, filter: "open" }));
    expect(page.unseen).toBe(1);
    expect(page.counts).toEqual({ all: 1, open: 1, quoted: 0, closed: 0 });
  });
});
