import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OrderRow } from "../../db/schema";
import { orderCreateSchema, type OrderCreateInput } from "../../schemas";

vi.hoisted(() => {
  Object.assign(process.env, {
    DATABASE_URL: "postgres://test:test@localhost:5432/test",
    JWT_SECRET: "test-secret-that-is-at-least-32-characters-long",
    PLATFORM_FEE_BP: "500",
  });
});

const TX = { tx: true };
vi.mock("./order.repository", () => ({
  inTransaction: vi.fn(async (work: (tx: unknown) => unknown) => work(TX)),
  findOrder: vi.fn(),
  findByKey: vi.fn(),
  findLiveForQuotation: vi.fn(),
  insertOrder: vi.fn(),
  insertEvent: vi.fn(),
  markPaid: vi.fn(),
  cancelByBuyer: vi.fn(),
  cancelDue: vi.fn(),
  listFor: vi.fn(),
  latestForBuyer: vi.fn(),
  findMany: vi.fn(),
}));
vi.mock("../auth", () => ({ getUsersByIds: vi.fn() }));
vi.mock("../quotation", () => ({
  getQuoteForOrder: vi.fn(),
  getQuoteReferences: vi.fn(async () => new Map([["55555555-5555-4555-8555-555555555555", "QT-1001"]])),
  acceptQuoteForOrder: vi.fn(),
  releaseQuoteForOrder: vi.fn(),
}));
vi.mock("../rfq", () => ({ lockRfqForOrder: vi.fn() }));

const repo = await import("./order.repository");
const { getUsersByIds } = await import("../auth");
const { getQuoteForOrder, acceptQuoteForOrder, releaseQuoteForOrder } = await import("../quotation");
const { lockRfqForOrder } = await import("../rfq");
const service = await import("./order.service");

const BUYER = "11111111-1111-4111-8111-111111111111";
const OTHER_BUYER = "22222222-2222-4222-8222-222222222222";
const SELLER = "33333333-3333-4333-8333-333333333333";
const OTHER_SELLER = "44444444-4444-4444-8444-444444444444";
const QUOTE = "55555555-5555-4555-8555-555555555555";
const OTHER_QUOTE = "66666666-6666-4666-8666-666666666666";
const RFQ = "77777777-7777-4777-8777-777777777777";
const KEY = "88888888-8888-4888-8888-888888888888";
const ORDER = "99999999-9999-4999-8999-999999999999";
const now = new Date("2026-11-22T08:00:00.000Z");

function quote(overrides: Record<string, unknown> = {}) {
  return {
    id: QUOTE,
    reference: "QT-1001",
    rfqId: RFQ,
    buyerUserId: BUYER,
    sellerUserId: SELLER,
    status: "active",
    currency: "OMR",
    subtotalAmount: 18500,
    shippingAmount: 2000,
    vatRateBp: 0,
    vatAmount: 0,
    totalAmount: 20500,
    deliveryDays: 7,
    validUntil: new Date(now.getTime() + 86_400_000),
    sellerCompanyName: "DQC",
    deliveryCity: "Muscat",
    deliveryCountry: "OM",
    ...overrides,
  };
}

function input(overrides: Partial<OrderCreateInput> = {}): OrderCreateInput {
  return {
    quotationId: QUOTE,
    orderKey: KEY,
    delivery: { recipientName: "Misfar", phone: "+968 9123 4567", addressLine: "Way 3021, Building 12, Al Khoud", notes: null },
    ...overrides,
  };
}

function orderRow(overrides: Partial<OrderRow> = {}): OrderRow {
  return {
    id: ORDER,
    number: 1001,
    buyerUserId: BUYER,
    sellerUserId: SELLER,
    rfqId: RFQ,
    quotationId: QUOTE,
    orderKey: KEY,
    status: "awaiting_payment",
    currency: "OMR",
    subtotalAmount: 18500,
    shippingAmount: 2000,
    vatRateBp: 0,
    vatAmount: 0,
    totalAmount: 20500,
    platformFeeBp: 500,
    platformFeeAmount: 925,
    sellerAmount: 19575,
    deliveryDays: 7,
    sellerCompanyName: "DQC",
    buyerName: "Misfar",
    recipientName: "Misfar",
    recipientPhone: "+968 9123 4567",
    addressLine: "Way 3021, Building 12, Al Khoud",
    deliveryNotes: null,
    deliveryCity: "Muscat",
    deliveryCountry: "OM",
    paymentDueAt: new Date(now.getTime() + 24 * 3_600_000),
    paidAt: null,
    cancelledAt: null,
    cancelReason: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(repo.findByKey).mockResolvedValue(undefined);
  vi.mocked(getQuoteForOrder).mockResolvedValue(quote() as never);
  vi.mocked(getUsersByIds).mockResolvedValue([{ id: BUYER, role: "buyer", fullName: "Misfar", email: "b@example.test" }] as never);
  vi.mocked(lockRfqForOrder).mockResolvedValue("quoted");
  vi.mocked(acceptQuoteForOrder).mockResolvedValue(true);
  vi.mocked(repo.insertOrder).mockImplementation(async (_tx, values) => orderRow({ platformFeeAmount: values.platformFeeAmount, sellerAmount: values.sellerAmount }));
});

// ---------------------------------------------------------------- fee

describe("computePlatformFee", () => {
  it("is the rate of the items subtotal, rounded half up to the baisa", () => {
    expect(service.computePlatformFee(18500, 500)).toBe(925);
    expect(service.computePlatformFee(10, 500)).toBe(1); // 0.5 -> 1
    expect(service.computePlatformFee(9, 500)).toBe(0); // 0.45 -> 0
    expect(service.computePlatformFee(9_999_999_999, 3000)).toBe(3_000_000_000); // no float error at the cap
    expect(service.computePlatformFee(18500, 0)).toBe(0);
  });

  it("refuses a bad subtotal or rate", () => {
    expect(() => service.computePlatformFee(0, 500)).toThrow();
    expect(() => service.computePlatformFee(1.5, 500)).toThrow();
    expect(() => service.computePlatformFee(100, 3001)).toThrow();
  });
});

describe("orderCreateSchema", () => {
  it("drops any amount sent by the client: the server copies the quotation's", () => {
    const parsed = orderCreateSchema.parse({ ...input(), total: { amountMinor: 1, currency: "OMR" }, totalAmount: 1, sellerUserId: OTHER_SELLER });
    expect(parsed).not.toHaveProperty("total");
    expect(parsed).not.toHaveProperty("totalAmount");
    expect(parsed).not.toHaveProperty("sellerUserId");
  });

  it("refuses a missing or bad phone and control characters in the address", () => {
    expect(orderCreateSchema.safeParse(input({ delivery: { ...input().delivery, phone: "call me" } })).success).toBe(false);
    expect(orderCreateSchema.safeParse(input({ delivery: { ...input().delivery, addressLine: "Way 1\u0000<script>" } })).success).toBe(false);
  });
});

// ---------------------------------------------------------------- create

describe("createOrder", () => {
  it("copies the quotation's amounts, takes Muhrak's fee from the seller's share, locks the request, accepts the quote and logs the event in ONE transaction", async () => {
    const { order, created } = await service.createOrder(BUYER, input(), now);
    expect(created).toBe(true);
    expect(lockRfqForOrder).toHaveBeenCalledWith(TX, { rfqId: RFQ, buyerUserId: BUYER });
    expect(acceptQuoteForOrder).toHaveBeenCalledWith(TX, { quotationId: QUOTE, buyerUserId: BUYER, at: now });
    const values = vi.mocked(repo.insertOrder).mock.calls[0]![1];
    expect(values).toMatchObject({
      buyerUserId: BUYER,
      sellerUserId: SELLER,
      totalAmount: 20500,
      subtotalAmount: 18500,
      platformFeeBp: 500,
      platformFeeAmount: 925,
      sellerAmount: 19575,
      deliveryCity: "Muscat",
      deliveryCountry: "OM",
      paymentDueAt: new Date(now.getTime() + 24 * 3_600_000),
    });
    expect(repo.insertEvent).toHaveBeenCalledWith(TX, expect.objectContaining({ to: "awaiting_payment", actor: "buyer", actorUserId: BUYER }));
    // The buyer never sees Muhrak's fee or the seller's share.
    expect(order.total.amountMinor).toBe(20500);
    expect(order.platformFee).toBeNull();
    expect(order.sellerAmount).toBeNull();
  });

  it("another buyer's quotation is not found, and nothing is written", async () => {
    await expect(service.createOrder(OTHER_BUYER, input(), now)).rejects.toMatchObject({ status: 404 });
    expect(repo.inTransaction).not.toHaveBeenCalled();
    expect(repo.insertOrder).not.toHaveBeenCalled();
  });

  it("a seller account id cannot order (not the quotation's buyer)", async () => {
    await expect(service.createOrder(SELLER, input(), now)).rejects.toMatchObject({ status: 404 });
  });

  it.each([
    ["expired", /expired/],
    ["withdrawn", /withdrew/],
    ["superseded", /newer quotation/],
  ])("a %s quotation cannot be ordered", async (status, message) => {
    vi.mocked(getQuoteForOrder).mockResolvedValue(quote({ status }) as never);
    await expect(service.createOrder(BUYER, input(), now)).rejects.toMatchObject({ status: 409, message: expect.stringMatching(message) });
    expect(repo.insertOrder).not.toHaveBeenCalled();
  });

  it("an already accepted quotation points to its existing order (no second order)", async () => {
    vi.mocked(getQuoteForOrder).mockResolvedValue(quote({ status: "accepted" }) as never);
    vi.mocked(repo.findLiveForQuotation).mockResolvedValue(orderRow());
    await expect(service.createOrder(BUYER, input({ orderKey: "12121212-1212-4212-8212-121212121212" }), now)).rejects.toMatchObject({
      status: 409,
      message: expect.stringMatching(/OR-1001/),
    });
    expect(repo.insertOrder).not.toHaveBeenCalled();
  });

  it("the quotation changed after it was read (revised, withdrawn or expired under the lock): conflict, nothing written", async () => {
    vi.mocked(acceptQuoteForOrder).mockResolvedValue(false);
    vi.mocked(getQuoteForOrder).mockResolvedValueOnce(quote() as never).mockResolvedValueOnce(quote({ status: "superseded" }) as never);
    await expect(service.createOrder(BUYER, input(), now)).rejects.toMatchObject({ status: 409 });
    expect(repo.insertOrder).not.toHaveBeenCalled();
    expect(repo.insertEvent).not.toHaveBeenCalled();
  });

  it("a closed request (cancelled or expired) cannot be ordered", async () => {
    vi.mocked(lockRfqForOrder).mockResolvedValue("cancelled");
    await expect(service.createOrder(BUYER, input(), now)).rejects.toMatchObject({ status: 409 });
    expect(acceptQuoteForOrder).not.toHaveBeenCalled();
    expect(repo.insertOrder).not.toHaveBeenCalled();
  });

  it("a double submit (same form key) returns the first order: no second order or event", async () => {
    vi.mocked(repo.findByKey).mockResolvedValue(orderRow());
    const { created } = await service.createOrder(BUYER, input(), now);
    expect(created).toBe(false);
    expect(repo.inTransaction).not.toHaveBeenCalled();
    expect(repo.insertOrder).not.toHaveBeenCalled();
  });

  it("two simultaneous submits: the second finds the first after the lock and writes nothing", async () => {
    vi.mocked(repo.findByKey).mockResolvedValueOnce(undefined).mockResolvedValueOnce(orderRow());
    const { created } = await service.createOrder(BUYER, input(), now);
    expect(created).toBe(false);
    expect(acceptQuoteForOrder).not.toHaveBeenCalled();
    expect(repo.insertOrder).not.toHaveBeenCalled();
  });

  it("a form key reused for another quotation is refused", async () => {
    vi.mocked(repo.findByKey).mockResolvedValue(orderRow({ quotationId: OTHER_QUOTE }));
    await expect(service.createOrder(BUYER, input(), now)).rejects.toMatchObject({ status: 400 });
  });
});

// ---------------------------------------------------------------- cancel

describe("cancelOrder", () => {
  it("the buyer cancels before paying: the quotation becomes valid again and the event is logged, in one transaction", async () => {
    vi.mocked(repo.findOrder).mockResolvedValue(orderRow());
    vi.mocked(repo.cancelByBuyer).mockResolvedValue(orderRow({ status: "cancelled", cancelledAt: now, cancelReason: service.CANCEL_REASONS.buyer }));
    const order = await service.cancelOrder(BUYER, ORDER, now);
    expect(order.status).toBe("cancelled");
    expect(releaseQuoteForOrder).toHaveBeenCalledWith(TX, { quotationId: QUOTE, at: now });
    expect(repo.insertEvent).toHaveBeenCalledWith(TX, expect.objectContaining({ from: "awaiting_payment", to: "cancelled", actor: "buyer" }));
  });

  it("another buyer or the seller cannot cancel: not found", async () => {
    vi.mocked(repo.findOrder).mockResolvedValue(orderRow());
    await expect(service.cancelOrder(OTHER_BUYER, ORDER, now)).rejects.toMatchObject({ status: 404 });
    await expect(service.cancelOrder(SELLER, ORDER, now)).rejects.toMatchObject({ status: 404 });
    expect(repo.cancelByBuyer).not.toHaveBeenCalled();
  });

  it("a paid order cannot be cancelled here (refunds are an admin action)", async () => {
    vi.mocked(repo.findOrder).mockResolvedValue(orderRow({ status: "paid", paidAt: now }));
    vi.mocked(repo.cancelByBuyer).mockResolvedValue(undefined);
    await expect(service.cancelOrder(BUYER, ORDER, now)).rejects.toMatchObject({ status: 409 });
    expect(releaseQuoteForOrder).not.toHaveBeenCalled();
  });

  it("cancelling twice (double click) gives the same answer without a second event", async () => {
    vi.mocked(repo.findOrder).mockResolvedValue(orderRow({ status: "cancelled", cancelledAt: now, cancelReason: "x" }));
    vi.mocked(repo.cancelByBuyer).mockResolvedValue(undefined);
    const order = await service.cancelOrder(BUYER, ORDER, now);
    expect(order.status).toBe("cancelled");
    expect(repo.insertEvent).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------- reading

describe("reading orders", () => {
  it("the seller does not see the delivery address or phone before the order is paid", async () => {
    vi.mocked(repo.findOrder).mockResolvedValue(orderRow());
    const order = await service.getOrder("seller", SELLER, ORDER);
    expect(order.delivery).toBeNull();
    expect(order.sellerAmount?.amountMinor).toBe(19575);
    expect(order.platformFee?.amountMinor).toBe(925);
  });

  it("the seller sees the delivery details once paid", async () => {
    vi.mocked(repo.findOrder).mockResolvedValue(orderRow({ status: "paid", paidAt: now }));
    const order = await service.getOrder("seller", SELLER, ORDER);
    expect(order.delivery).toMatchObject({ phone: "+968 9123 4567", city: "Muscat", countryName: "Oman" });
  });

  it("another buyer, another seller, or the wrong side gets not found", async () => {
    vi.mocked(repo.findOrder).mockResolvedValue(orderRow());
    await expect(service.getOrder("buyer", OTHER_BUYER, ORDER)).rejects.toMatchObject({ status: 404 });
    await expect(service.getOrder("seller", OTHER_SELLER, ORDER)).rejects.toMatchObject({ status: 404 });
    await expect(service.getOrder("seller", BUYER, ORDER)).rejects.toMatchObject({ status: 404 });
    await expect(service.getOrder("buyer", SELLER, ORDER)).rejects.toMatchObject({ status: 404 });
  });

  it("a tampered list cursor is refused", async () => {
    await expect(service.listOrders("buyer", BUYER, { cursor: "not-a-cursor", limit: 20 })).rejects.toMatchObject({ status: 400 });
  });
});

// ---------------------------------------------------------------- payment hooks and expiry

describe("markOrderPaid and expiry", () => {
  it("marks paid with a system event, only from awaiting payment", async () => {
    vi.mocked(repo.markPaid).mockResolvedValue(orderRow({ status: "paid", paidAt: now }));
    const order = await service.markOrderPaid(TX as never, { orderId: ORDER, at: now });
    expect(order?.status).toBe("paid");
    expect(repo.insertEvent).toHaveBeenCalledWith(TX, expect.objectContaining({ from: "awaiting_payment", to: "paid", actor: "system" }));

    vi.mocked(repo.markPaid).mockResolvedValue(undefined);
    vi.mocked(repo.insertEvent).mockClear();
    expect(await service.markOrderPaid(TX as never, { orderId: ORDER, at: now })).toBeUndefined();
    expect(repo.insertEvent).not.toHaveBeenCalled();
  });

  it("the sweep cancels unpaid orders past their time and makes their quotations valid again", async () => {
    vi.mocked(repo.cancelDue).mockResolvedValueOnce([{ id: ORDER, quotationId: QUOTE }]);
    expect(await service.expireUnpaidOrders(now)).toBe(1);
    expect(releaseQuoteForOrder).toHaveBeenCalledWith(TX, { quotationId: QUOTE, at: now });
    expect(repo.insertEvent).toHaveBeenCalledWith(TX, expect.objectContaining({ to: "cancelled", actor: "system" }));
  });
});
