import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  Object.assign(process.env, {
    DATABASE_URL: "postgres://test:test@localhost:5432/test",
    JWT_SECRET: "test-secret-that-is-at-least-32-characters-long",
  });
});

vi.mock("./ledger.repository", () => ({
  insertEntries: vi.fn(),
  hasPaymentEntries: vi.fn(async () => false),
  sellerBalance: vi.fn(),
  listForOrder: vi.fn(),
}));

const repo = await import("./ledger.repository");
const ledger = await import("./ledger.service");

const TX = { tx: true } as never;
const ORDER = "11111111-1111-4111-8111-111111111111";
const PAYMENT = "22222222-2222-4222-8222-222222222222";
const SELLER = "33333333-3333-4333-8333-333333333333";
const BUYER = "44444444-4444-4444-8444-444444444444";
const now = new Date("2026-11-22T08:00:00.000Z");

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(repo.hasPaymentEntries).mockResolvedValue(false);
});

type Rows = { account: string; amount: number; groupId: string; sellerUserId?: string; buyerUserId?: string }[];
const written = () => vi.mocked(repo.insertEntries).mock.calls[0]![1] as Rows;
const balanced = (rows: Rows) =>
  rows.filter((row) => row.account === "gateway").reduce((sum, row) => sum + row.amount, 0) ===
  rows.filter((row) => row.account !== "gateway").reduce((sum, row) => sum + row.amount, 0);

describe("recordPaymentCaptured", () => {
  it("writes gateway = platform fee + seller share, in one group, for the order's seller", async () => {
    await ledger.recordPaymentCaptured(TX, { orderId: ORDER, paymentId: PAYMENT, sellerUserId: SELLER, total: 20500, platformFee: 925, sellerAmount: 19575, at: now });
    const rows = written();
    expect(rows.map((row) => [row.account, row.amount])).toEqual([
      ["gateway", 20500],
      ["platform", 925],
      ["seller", 19575],
    ]);
    expect(new Set(rows.map((row) => row.groupId)).size).toBe(1);
    expect(rows.find((row) => row.account === "seller")?.sellerUserId).toBe(SELLER);
    expect(balanced(rows)).toBe(true);
  });

  it("refuses a movement that does not add up, and writes nothing", async () => {
    await expect(
      ledger.recordPaymentCaptured(TX, { orderId: ORDER, paymentId: PAYMENT, sellerUserId: SELLER, total: 20500, platformFee: 925, sellerAmount: 19000, at: now }),
    ).rejects.toBeInstanceOf(ledger.LedgerImbalance);
    expect(repo.insertEntries).not.toHaveBeenCalled();
  });

  it.each([
    ["a negative fee", { total: 100, platformFee: -1, sellerAmount: 101 }],
    ["a fractional amount", { total: 100.5, platformFee: 0.5, sellerAmount: 100 }],
    ["a zero total", { total: 0, platformFee: 0, sellerAmount: 0 }],
  ])("refuses %s", async (_label, amounts) => {
    await expect(ledger.recordPaymentCaptured(TX, { orderId: ORDER, paymentId: PAYMENT, sellerUserId: SELLER, ...amounts, at: now })).rejects.toBeInstanceOf(
      ledger.LedgerImbalance,
    );
    expect(repo.insertEntries).not.toHaveBeenCalled();
  });

  it("writes a payment only once (already in the ledger: nothing written)", async () => {
    vi.mocked(repo.hasPaymentEntries).mockResolvedValue(true);
    await ledger.recordPaymentCaptured(TX, { orderId: ORDER, paymentId: PAYMENT, sellerUserId: SELLER, total: 20500, platformFee: 925, sellerAmount: 19575, at: now });
    expect(repo.insertEntries).not.toHaveBeenCalled();
  });
});

describe("recordRefundDue", () => {
  it("holds the money as owed back to the buyer: nothing for the seller or Muhrak", async () => {
    await ledger.recordRefundDue(TX, { orderId: ORDER, paymentId: PAYMENT, buyerUserId: BUYER, amount: 20500, at: now });
    const rows = written();
    expect(rows.map((row) => [row.account, row.amount])).toEqual([
      ["gateway", 20500],
      ["buyer", 20500],
    ]);
    expect(rows.find((row) => row.account === "buyer")?.buyerUserId).toBe(BUYER);
    expect(rows.some((row) => row.account === "seller" || row.account === "platform")).toBe(false);
    expect(balanced(rows)).toBe(true);
  });
});
