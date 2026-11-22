import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PaymentRow } from "../../db/schema";

vi.hoisted(() => {
  Object.assign(process.env, {
    DATABASE_URL: "postgres://test:test@localhost:5432/test",
    JWT_SECRET: "test-secret-that-is-at-least-32-characters-long",
  });
});

const TX = { tx: true };
vi.mock("./payment.repository", () => ({
  inTransaction: vi.fn(async (work: (tx: unknown) => unknown) => work(TX)),
  findPayment: vi.fn(),
  lockPayment: vi.fn(),
  findPendingForOrder: vi.fn(),
  insertPending: vi.fn(),
  setCheckout: vi.fn(),
  closePending: vi.fn(),
  markSucceeded: vi.fn(),
  insertEvent: vi.fn(),
  finishEvent: vi.fn(),
  latestForOrders: vi.fn(),
  expireStale: vi.fn(),
}));
vi.mock("../order", () => ({ getOrderForPayment: vi.fn(), markOrderPaid: vi.fn() }));
vi.mock("../ledger", () => ({ recordPaymentCaptured: vi.fn(), recordRefundDue: vi.fn() }));

const repo = await import("./payment.repository");
const { getOrderForPayment, markOrderPaid } = await import("../order");
const { recordPaymentCaptured, recordRefundDue } = await import("../ledger");
const { createFakePaymentProvider, FAKE_SIGNATURE_HEADER } = await import("./providers/fake");
const service = await import("./payment.service");

const BUYER = "11111111-1111-4111-8111-111111111111";
const OTHER_BUYER = "22222222-2222-4222-8222-222222222222";
const SELLER = "33333333-3333-4333-8333-333333333333";
const ORDER = "99999999-9999-4999-8999-999999999999";
const PAYMENT = "55555555-5555-4555-8555-555555555555";
const now = new Date("2026-11-22T08:00:00.000Z");
const SECRET = "fake-gateway-secret-for-tests-0123456789";
const gateway = createFakePaymentProvider({ secret: SECRET, webAppUrl: "http://localhost:3000" });

function order(overrides: Record<string, unknown> = {}) {
  return {
    id: ORDER,
    reference: "OR-1001",
    buyerUserId: BUYER,
    sellerUserId: SELLER,
    status: "awaiting_payment",
    currency: "OMR",
    totalAmount: 20500,
    platformFeeAmount: 925,
    sellerAmount: 19575,
    paymentDueAt: new Date(now.getTime() + 24 * 3_600_000),
    ...overrides,
  };
}

function payment(overrides: Partial<PaymentRow> = {}): PaymentRow {
  return {
    id: PAYMENT,
    orderId: ORDER,
    buyerUserId: BUYER,
    provider: "fake",
    providerPaymentId: "fake_abc12345",
    status: "pending",
    currency: "OMR",
    amount: 20500,
    refundReason: null,
    checkoutUrl: "http://localhost:3000/buyer/orders/x/test-checkout",
    checkoutExpiresAt: new Date(now.getTime() + 30 * 60_000),
    succeededAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/** A webhook exactly as the gateway would send it. */
function webhook(type: "payment.succeeded" | "payment.failed" | "payment.expired" = "payment.succeeded", overrides: { amountMinor?: number; currency?: string; providerPaymentId?: string } = {}) {
  return gateway.signEvent({ type, providerPaymentId: overrides.providerPaymentId ?? "fake_abc12345", reference: PAYMENT, amountMinor: overrides.amountMinor ?? 20500, currency: overrides.currency ?? "OMR" });
}

beforeEach(() => {
  vi.clearAllMocks();
  service.setPaymentProviderForTests(gateway);
  vi.mocked(getOrderForPayment).mockResolvedValue(order() as never);
  vi.mocked(repo.insertEvent).mockResolvedValue("event-row-1");
  vi.mocked(repo.lockPayment).mockResolvedValue(payment());
  vi.mocked(repo.markSucceeded).mockImplementation(async (_tx, input) => payment({ status: "succeeded", refundReason: input.refundReason, succeededAt: now }));
});

// ---------------------------------------------------------------- start paying

describe("startPayment", () => {
  it("opens a checkout for the order's total, read from the database (the client sends no amount)", async () => {
    vi.mocked(repo.findPendingForOrder).mockResolvedValue(undefined);
    vi.mocked(repo.insertPending).mockResolvedValue(payment({ providerPaymentId: null, checkoutUrl: null, checkoutExpiresAt: null }));
    vi.mocked(repo.setCheckout).mockResolvedValue(payment());
    const result = await service.startPayment(BUYER, ORDER, now);
    expect(repo.insertPending).toHaveBeenCalledWith(expect.objectContaining({ orderId: ORDER, buyerUserId: BUYER, amount: 20500, currency: "OMR", provider: "fake" }));
    expect(result.paymentId).toBe(PAYMENT);
    expect(result.checkoutUrl).toContain(`/buyer/orders/${ORDER}/test-checkout`);
  });

  it("another buyer, or the seller, cannot pay someone else's order: not found", async () => {
    await expect(service.startPayment(OTHER_BUYER, ORDER, now)).rejects.toMatchObject({ status: 404 });
    await expect(service.startPayment(SELLER, ORDER, now)).rejects.toMatchObject({ status: 404 });
    expect(repo.insertPending).not.toHaveBeenCalled();
  });

  it.each([["paid"], ["cancelled"]])("a %s order cannot be paid", async (status) => {
    vi.mocked(getOrderForPayment).mockResolvedValue(order({ status }) as never);
    await expect(service.startPayment(BUYER, ORDER, now)).rejects.toMatchObject({ status: 409 });
    expect(repo.insertPending).not.toHaveBeenCalled();
  });

  it("an order past its time to pay cannot be paid", async () => {
    vi.mocked(getOrderForPayment).mockResolvedValue(order({ paymentDueAt: now }) as never);
    await expect(service.startPayment(BUYER, ORDER, now)).rejects.toMatchObject({ status: 409 });
  });

  it("with payments off (no gateway set), nothing is created", async () => {
    service.setPaymentProviderForTests(null);
    await expect(service.startPayment(BUYER, ORDER, now)).rejects.toMatchObject({ status: 503 });
    expect(repo.insertPending).not.toHaveBeenCalled();
  });

  it("paying again while a checkout is open returns the same checkout (one live checkout, so no double charge)", async () => {
    vi.mocked(repo.findPendingForOrder).mockResolvedValue(payment());
    const result = await service.startPayment(BUYER, ORDER, now);
    expect(result.paymentId).toBe(PAYMENT);
    expect(repo.insertPending).not.toHaveBeenCalled();
  });

  it("a closed checkout is replaced by a new attempt", async () => {
    vi.mocked(repo.findPendingForOrder).mockResolvedValue(payment({ checkoutExpiresAt: new Date(now.getTime() - 1) }));
    vi.mocked(repo.insertPending).mockResolvedValue(payment({ id: "66666666-6666-4666-8666-666666666666", providerPaymentId: null }));
    vi.mocked(repo.setCheckout).mockResolvedValue(payment());
    await service.startPayment(BUYER, ORDER, now);
    expect(repo.closePending).toHaveBeenCalledWith({ id: PAYMENT, to: "expired", at: now });
    expect(repo.insertPending).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------- webhook

describe("handleWebhook", () => {
  it("a signed success marks the order paid, the payment succeeded and writes the ledger, in ONE transaction", async () => {
    vi.mocked(markOrderPaid).mockResolvedValue(order({ status: "paid" }) as never);
    const { rawBody, headers } = webhook();
    const result = await service.handleWebhook("fake", rawBody, headers, now);
    expect(result).toEqual({ status: 200, outcome: "applied: order paid" });
    expect(repo.lockPayment).toHaveBeenCalledWith(TX, PAYMENT);
    expect(markOrderPaid).toHaveBeenCalledWith(TX, { orderId: ORDER, at: now });
    expect(repo.markSucceeded).toHaveBeenCalledWith(TX, expect.objectContaining({ id: PAYMENT, refundReason: null }));
    expect(recordPaymentCaptured).toHaveBeenCalledWith(TX, expect.objectContaining({ orderId: ORDER, paymentId: PAYMENT, sellerUserId: SELLER, total: 20500, platformFee: 925, sellerAmount: 19575 }));
    expect(repo.finishEvent).toHaveBeenCalledWith(TX, expect.objectContaining({ outcome: "applied: order paid" }));
  });

  it("a forged webhook (wrong secret) is refused: nothing stored or changed", async () => {
    const forger = createFakePaymentProvider({ secret: "someone-elses-secret-that-is-long-enough", webAppUrl: "http://x" });
    const { rawBody, headers } = forger.signEvent({ type: "payment.succeeded", providerPaymentId: "fake_abc12345", reference: PAYMENT, amountMinor: 20500, currency: "OMR" });
    const result = await service.handleWebhook("fake", rawBody, headers, now);
    expect(result.status).toBe(400);
    expect(repo.insertEvent).not.toHaveBeenCalled();
    expect(markOrderPaid).not.toHaveBeenCalled();
  });

  it("a tampered body (amount changed after signing) is refused", async () => {
    const { rawBody, headers } = webhook();
    const tampered = Buffer.from(rawBody.toString("utf8").replace("20500", "1"));
    expect((await service.handleWebhook("fake", tampered, headers, now)).status).toBe(400);
    expect(repo.insertEvent).not.toHaveBeenCalled();
  });

  it("no signature, or a webhook for another gateway name, is refused", async () => {
    const { rawBody, headers } = webhook();
    expect((await service.handleWebhook("fake", rawBody, { ...headers, [FAKE_SIGNATURE_HEADER]: undefined }, now)).status).toBe(400);
    expect((await service.handleWebhook("stripe", rawBody, headers, now)).status).toBe(404);
    expect(repo.insertEvent).not.toHaveBeenCalled();
  });

  it("a replayed or retried event (same event id) changes nothing", async () => {
    vi.mocked(repo.insertEvent).mockResolvedValue(undefined);
    const { rawBody, headers } = webhook();
    expect(await service.handleWebhook("fake", rawBody, headers, now)).toEqual({ status: 200, outcome: "duplicate" });
    expect(repo.lockPayment).not.toHaveBeenCalled();
    expect(markOrderPaid).not.toHaveBeenCalled();
    expect(recordPaymentCaptured).not.toHaveBeenCalled();
  });

  it.each([
    ["a smaller amount", { amountMinor: 1 }],
    ["a larger amount", { amountMinor: 99999 }],
    ["another currency", { currency: "USD" }],
  ])("%s than asked for is never accepted: the event is kept as a mismatch, nothing else changes", async (_label, overrides) => {
    const { rawBody, headers } = webhook("payment.succeeded", overrides);
    const result = await service.handleWebhook("fake", rawBody, headers, now);
    expect(result.outcome).toMatch(/^mismatch/);
    expect(markOrderPaid).not.toHaveBeenCalled();
    expect(repo.markSucceeded).not.toHaveBeenCalled();
    expect(recordPaymentCaptured).not.toHaveBeenCalled();
  });

  it("a success for a gateway payment id that is not this payment's is a mismatch", async () => {
    const { rawBody, headers } = webhook("payment.succeeded", { providerPaymentId: "fake_other999" });
    expect((await service.handleWebhook("fake", rawBody, headers, now)).outcome).toMatch(/^mismatch/);
    expect(markOrderPaid).not.toHaveBeenCalled();
  });

  it("an event for an unknown payment is stored and ignored", async () => {
    vi.mocked(repo.lockPayment).mockResolvedValue(undefined);
    const { rawBody, headers } = webhook();
    expect((await service.handleWebhook("fake", rawBody, headers, now)).outcome).toBe("ignored: unknown payment");
    expect(markOrderPaid).not.toHaveBeenCalled();
  });

  it("paid twice: a second success for an already paid order is kept as owed back to the buyer, never counted", async () => {
    vi.mocked(markOrderPaid).mockResolvedValue(undefined);
    vi.mocked(getOrderForPayment).mockResolvedValue(order({ status: "paid" }) as never);
    const { rawBody, headers } = webhook();
    const result = await service.handleWebhook("fake", rawBody, headers, now);
    expect(result.outcome).toMatch(/refund due/);
    expect(repo.markSucceeded).toHaveBeenCalledWith(TX, expect.objectContaining({ refundReason: service.REFUND_REASONS.paidTwice }));
    expect(recordRefundDue).toHaveBeenCalledWith(TX, expect.objectContaining({ buyerUserId: BUYER, amount: 20500 }));
    expect(recordPaymentCaptured).not.toHaveBeenCalled();
  });

  it("money that arrives after the order was cancelled is owed back to the buyer", async () => {
    vi.mocked(markOrderPaid).mockResolvedValue(undefined);
    vi.mocked(getOrderForPayment).mockResolvedValue(order({ status: "cancelled" }) as never);
    const { rawBody, headers } = webhook();
    await service.handleWebhook("fake", rawBody, headers, now);
    expect(repo.markSucceeded).toHaveBeenCalledWith(TX, expect.objectContaining({ refundReason: service.REFUND_REASONS.orderClosed }));
    expect(recordPaymentCaptured).not.toHaveBeenCalled();
  });

  it("a late success for an attempt that had expired still pays an order that is awaiting payment", async () => {
    vi.mocked(repo.lockPayment).mockResolvedValue(payment({ status: "expired" }));
    vi.mocked(markOrderPaid).mockResolvedValue(order({ status: "paid" }) as never);
    const { rawBody, headers } = webhook();
    expect((await service.handleWebhook("fake", rawBody, headers, now)).outcome).toBe("applied: order paid");
  });

  it("a success for a payment that already succeeded changes nothing", async () => {
    vi.mocked(repo.lockPayment).mockResolvedValue(payment({ status: "succeeded", succeededAt: now }));
    const { rawBody, headers } = webhook();
    expect((await service.handleWebhook("fake", rawBody, headers, now)).outcome).toBe("ignored: payment is succeeded");
    expect(markOrderPaid).not.toHaveBeenCalled();
  });

  it("a failure closes the pending attempt; the order stays awaiting payment", async () => {
    vi.mocked(repo.closePending).mockResolvedValue(payment({ status: "failed" }));
    const { rawBody, headers } = webhook("payment.failed");
    expect((await service.handleWebhook("fake", rawBody, headers, now)).outcome).toBe("applied: failed");
    expect(repo.closePending).toHaveBeenCalledWith({ id: PAYMENT, to: "failed", at: now }, TX);
    expect(markOrderPaid).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------- test gateway

describe("completeTestPayment", () => {
  it("only the payment's own buyer can complete a test payment", async () => {
    vi.mocked(repo.findPayment).mockResolvedValue(payment());
    await expect(service.completeTestPayment(OTHER_BUYER, PAYMENT, { outcome: "succeeded" }, now)).rejects.toMatchObject({ status: 404 });
    expect(repo.insertEvent).not.toHaveBeenCalled();
  });

  it("goes through the normal signed webhook path", async () => {
    vi.mocked(repo.findPayment).mockResolvedValue(payment());
    vi.mocked(markOrderPaid).mockResolvedValue(order({ status: "paid" }) as never);
    expect(await service.completeTestPayment(BUYER, PAYMENT, { outcome: "succeeded" }, now)).toEqual({ outcome: "applied: order paid" });
    expect(recordPaymentCaptured).toHaveBeenCalled();
  });

  it("does not exist when the real gateway (or none) is set", async () => {
    service.setPaymentProviderForTests(null);
    await expect(service.completeTestPayment(BUYER, PAYMENT, { outcome: "succeeded" }, now)).rejects.toMatchObject({ status: 404 });
  });
});
