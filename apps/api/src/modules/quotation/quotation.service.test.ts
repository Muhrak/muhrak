import { beforeEach, describe, expect, it, vi } from "vitest";
import type { QuotationRow } from "../../db/schema";
import { quoteCreateSchema, type QuoteCreateInput } from "../../schemas";

vi.hoisted(() => {
  Object.assign(process.env, {
    DATABASE_URL: "postgres://test:test@localhost:5432/test",
    JWT_SECRET: "test-secret-that-is-at-least-32-characters-long",
  });
});

const TX = { tx: true };
vi.mock("./quotation.repository", () => ({
  inTransaction: vi.fn(async (work: (tx: unknown) => unknown) => work(TX)),
  findQuote: vi.fn(),
  findByKey: vi.fn(),
  countForRfq: vi.fn(),
  supersedeActive: vi.fn(),
  insertQuote: vi.fn(),
  insertItems: vi.fn(),
  listItems: vi.fn(async () => []),
  listForRfq: vi.fn(),
  transition: vi.fn(),
  expireDue: vi.fn(),
}));
vi.mock("../auth", () => ({ getUsersByIds: vi.fn() }));
vi.mock("../notification", () => ({ sendNewQuoteEmail: vi.fn() }));
vi.mock("../rfq", () => ({ getRfqForQuote: vi.fn(), markRfqQuoted: vi.fn() }));
vi.mock("../seller", () => ({ getSellerForQuote: vi.fn() }));
vi.mock("../../shared/jobs", () => ({ wakeWorker: vi.fn(), enqueueJob: vi.fn(async () => true) }));

const repo = await import("./quotation.repository");
const { getUsersByIds } = await import("../auth");
const { sendNewQuoteEmail } = await import("../notification");
const { getRfqForQuote, markRfqQuoted } = await import("../rfq");
const { getSellerForQuote } = await import("../seller");
const { enqueueJob } = await import("../../shared/jobs");
const service = await import("./quotation.service");

const BUYER = "11111111-1111-4111-8111-111111111111";
const OTHER_BUYER = "22222222-2222-4222-8222-222222222222";
const SELLER = "33333333-3333-4333-8333-333333333333";
const OTHER_SELLER = "44444444-4444-4444-8444-444444444444";
const RFQ = "77777777-7777-4777-8777-777777777777";
const OTHER_RFQ = "99999999-9999-4999-8999-999999999999";
const KEY = "88888888-8888-4888-8888-888888888888";
const QUOTE = "55555555-5555-4555-8555-555555555555";
const now = new Date("2026-11-21T08:00:00.000Z");

function input(overrides: Partial<QuoteCreateInput> = {}): QuoteCreateInput {
  return {
    rfqId: RFQ,
    quoteKey: KEY,
    items: [
      { partNumber: "B3206050", description: "PISTON", details: null, quantity: 1, unitPrice: "438.300" },
      { partNumber: "B3206390", description: "CHISEL", details: null, quantity: 2, unitPrice: "168.245" },
    ],
    shipping: "180",
    deliveryDays: 10,
    validDays: 15,
    terms: null,
    notes: null,
    ...overrides,
  };
}

function rfq(overrides: Record<string, unknown> = {}) {
  return {
    id: RFQ,
    reference: "RQ-1042",
    status: "open" as const,
    buyerUserId: BUYER,
    sellerUserId: SELLER,
    partName: "Breaker piston",
    partNumber: "B3206050",
    quantity: 1,
    deliveryCity: "Ruwi",
    deliveryCountry: "OM" as const,
    ...overrides,
  };
}

function quoteRow(overrides: Partial<QuotationRow> = {}): QuotationRow {
  return {
    id: QUOTE,
    number: 1001,
    rfqId: RFQ,
    sellerUserId: SELLER,
    buyerUserId: BUYER,
    quoteKey: KEY,
    status: "active",
    currency: "OMR",
    subtotalAmount: 774_790,
    shippingAmount: 180_000,
    vatRateBp: 500,
    vatAmount: 47_740,
    totalAmount: 1_002_530,
    deliveryDays: 10,
    validDays: 15,
    validUntil: new Date(now.getTime() + 15 * 86_400_000),
    terms: null,
    notes: null,
    sellerCompanyName: "Oriental Equipments LLC",
    sellerCity: "Al Mawaleh",
    sellerCountry: "OM",
    buyerName: "Towell Engineering Group",
    deliveryCity: "Ruwi",
    deliveryCountry: "OM",
    closedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

const buyerUser = { id: BUYER, email: "buyer@example.com", fullName: "Towell Engineering Group", role: "buyer" as const, createdAt: now.toISOString() };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(repo.listItems).mockResolvedValue([]);
  vi.mocked(repo.findByKey).mockResolvedValue(undefined);
  vi.mocked(repo.countForRfq).mockResolvedValue(0);
  vi.mocked(repo.supersedeActive).mockResolvedValue(undefined);
  vi.mocked(repo.insertQuote).mockImplementation(async (_tx, values) => quoteRow({ ...values, validUntil: values.validUntil as Date }));
  vi.mocked(getRfqForQuote).mockResolvedValue(rfq());
  vi.mocked(markRfqQuoted).mockResolvedValue(true);
  vi.mocked(getSellerForQuote).mockResolvedValue({ companyName: "Oriental Equipments LLC", city: "Al Mawaleh", country: "OM", vatRegistered: true });
  vi.mocked(getUsersByIds).mockResolvedValue([buyerUser]);
});

// ---------------------------------------------------------------- amounts

describe("computeQuoteAmounts", () => {
  it("matches the developer's reference quotation to the baisa (15 items, shipping 180, VAT 5%)", () => {
    const prices: [number, string][] = [
      [1, "438.300"], [1, "117.300"], [1, "91.000"], [1, "55.500"], [1, "16.790"], [2, "168.245"], [1, "11.500"], [1, "26.565"],
      [2, "3.500"], [1, "35.700"], [2, "168.245"], [1, "181.700"], [1, "5.750"], [1, "42.550"], [1, "231.150"],
    ];
    const items = prices.map(([quantity, unitPrice]) => ({ partNumber: null, description: "Part", details: null, quantity, unitPrice }));
    const amounts = service.computeQuoteAmounts(items, "180", true);
    expect(amounts.subtotalAmount).toBe(1_933_785);
    expect(amounts.vatAmount).toBe(105_689); // 5% of 2,113.785 = 105.68925, half up
    expect(amounts.totalAmount).toBe(2_219_474);
    expect(amounts.items[5]).toMatchObject({ unitPriceAmount: 168_245, amount: 336_490 });
  });

  it("charges no VAT when the seller is not VAT registered", () => {
    const amounts = service.computeQuoteAmounts(input().items, "0", false);
    expect(amounts).toMatchObject({ vatRateBp: 0, vatAmount: 0, shippingAmount: 0, totalAmount: amounts.subtotalAmount });
  });

  it("rounds VAT half up to the nearest baisa", () => {
    // 0.010 OMR -> VAT 0.0005 -> 1 baisa; 0.009 -> 0.00045 -> 0.
    expect(service.computeQuoteAmounts([{ partNumber: null, description: "Washer", details: null, quantity: 1, unitPrice: "0.010" }], "0", true).vatAmount).toBe(1);
    expect(service.computeQuoteAmounts([{ partNumber: null, description: "Washer", details: null, quantity: 1, unitPrice: "0.009" }], "0", true).vatAmount).toBe(0);
  });

  it("refuses a total above the cap instead of losing precision", () => {
    const items = Array.from({ length: 50 }, () => ({ partNumber: null, description: "Engine", details: null, quantity: 100_000, unitPrice: "99999999.999" }));
    expect(() => service.computeQuoteAmounts(items, "0", true)).toThrow(/too large/);
  });

  it("refuses a zero price", () => {
    expect(() => service.computeQuoteAmounts([{ partNumber: null, description: "Bolt", details: null, quantity: 1, unitPrice: "0.000" }], "0", false)).toThrow();
  });
});

describe("quoteCreateSchema", () => {
  it("drops amounts sent by the client (subtotal, VAT, total, currency): the server computes them", () => {
    const parsed = quoteCreateSchema.parse({ ...input(), total: 1, vat: 0, subtotal: 1, currency: "KWD", vatRateBp: 0 });
    expect(parsed).not.toHaveProperty("total");
    expect(parsed).not.toHaveProperty("vat");
    expect(parsed).not.toHaveProperty("currency");
  });

  it("refuses a zero price, negative or float quantities, too many items, and a validity over 30 days", () => {
    const item = input().items[0]!;
    expect(quoteCreateSchema.safeParse(input({ items: [{ ...item, unitPrice: "0" }] })).success).toBe(false);
    expect(quoteCreateSchema.safeParse(input({ items: [{ ...item, unitPrice: "-5" }] })).success).toBe(false);
    expect(quoteCreateSchema.safeParse(input({ items: [{ ...item, quantity: 1.5 }] })).success).toBe(false);
    expect(quoteCreateSchema.safeParse(input({ items: [{ ...item, quantity: 0 }] })).success).toBe(false);
    expect(quoteCreateSchema.safeParse(input({ items: Array.from({ length: 51 }, () => item) })).success).toBe(false);
    expect(quoteCreateSchema.safeParse(input({ items: [] })).success).toBe(false);
    expect(quoteCreateSchema.safeParse(input({ validDays: 31 })).success).toBe(false);
    expect(quoteCreateSchema.safeParse(input({ shipping: "1.2345" })).success).toBe(false);
  });
});

// ---------------------------------------------------------------- send

describe("createQuote", () => {
  it("computes the amounts on the server, marks the request quoted and queues the email and chat card in the same transaction", async () => {
    const { quote, created } = await service.createQuote(SELLER, input(), now);
    expect(created).toBe(true);
    expect(markRfqQuoted).toHaveBeenCalledWith(TX, { rfqId: RFQ, sellerUserId: SELLER, at: now });
    const values = vi.mocked(repo.insertQuote).mock.calls[0]![1];
    // 438.300 + 2 x 168.245 = 774.790; + 180 shipping; VAT 5% of 954.790 = 47.7395 -> 47.740
    expect(values).toMatchObject({
      buyerUserId: BUYER,
      sellerUserId: SELLER,
      currency: "OMR",
      subtotalAmount: 774_790,
      shippingAmount: 180_000,
      vatRateBp: 500,
      vatAmount: 47_740,
      totalAmount: 1_002_530,
      sellerCompanyName: "Oriental Equipments LLC",
      buyerName: "Towell Engineering Group",
      deliveryCity: "Ruwi",
    });
    expect(values.validUntil).toEqual(new Date("2026-12-06T08:00:00.000Z"));
    expect(repo.insertItems).toHaveBeenCalledWith(TX, QUOTE, [
      expect.objectContaining({ position: 1, unitPriceAmount: 438_300, amount: 438_300 }),
      expect.objectContaining({ position: 2, unitPriceAmount: 168_245, amount: 336_490 }),
    ]);
    expect(sendNewQuoteEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "buyer@example.com", quoteReference: "QT-1001", total: "OMR 1,002.530", revised: false, rfqId: RFQ }),
      TX,
    );
    expect(enqueueJob).toHaveBeenCalledWith("chat", "post-quote-card", { quoteId: QUOTE }, expect.objectContaining({ dedupeKey: `chat-quote-${QUOTE}`, tx: TX }));
    expect(quote).toMatchObject({ reference: "QT-1001", status: "active", rfqReference: "RQ-1042", total: { amountMinor: 1_002_530, currency: "OMR" } });
  });

  it("a revision replaces the active quotation and tells the buyer it is revised", async () => {
    vi.mocked(getRfqForQuote).mockResolvedValue(rfq({ status: "quoted" }));
    vi.mocked(repo.supersedeActive).mockResolvedValue("old-quote");
    await service.createQuote(SELLER, input(), now);
    expect(repo.supersedeActive).toHaveBeenCalledWith(TX, RFQ, now);
    expect(sendNewQuoteEmail).toHaveBeenCalledWith(expect.objectContaining({ revised: true }), TX);
  });

  it("another seller's request is not found, and nothing is written", async () => {
    await expect(service.createQuote(OTHER_SELLER, input(), now)).rejects.toMatchObject({ status: 404 });
    expect(repo.inTransaction).not.toHaveBeenCalled();
  });

  it("an unknown request is not found", async () => {
    vi.mocked(getRfqForQuote).mockResolvedValue(undefined);
    await expect(service.createQuote(SELLER, input(), now)).rejects.toMatchObject({ status: 404 });
  });

  it.each(["expired", "cancelled", "declined"] as const)("a %s request cannot be quoted", async (status) => {
    vi.mocked(getRfqForQuote).mockResolvedValue(rfq({ status }));
    await expect(service.createQuote(SELLER, input(), now)).rejects.toMatchObject({ status: 409 });
    expect(repo.insertQuote).not.toHaveBeenCalled();
  });

  it("an unverified seller cannot send a quotation", async () => {
    vi.mocked(getSellerForQuote).mockResolvedValue(undefined);
    await expect(service.createQuote(SELLER, input(), now)).rejects.toMatchObject({ status: 403 });
    expect(repo.inTransaction).not.toHaveBeenCalled();
  });

  it("charges no VAT for a seller who is not VAT registered", async () => {
    vi.mocked(getSellerForQuote).mockResolvedValue({ companyName: "Small Shop", city: "Sohar", country: "OM", vatRegistered: false });
    await service.createQuote(SELLER, input(), now);
    expect(vi.mocked(repo.insertQuote).mock.calls[0]![1]).toMatchObject({ vatRateBp: 0, vatAmount: 0, totalAmount: 954_790 });
  });

  it("a double submit (same form key) returns the first quotation: no second row, email or card", async () => {
    vi.mocked(repo.findByKey).mockResolvedValue(quoteRow());
    const { created, quote } = await service.createQuote(SELLER, input(), now);
    expect(created).toBe(false);
    expect(quote.id).toBe(QUOTE);
    expect(repo.inTransaction).not.toHaveBeenCalled();
    expect(sendNewQuoteEmail).not.toHaveBeenCalled();
  });

  it("a form key reused for another request is refused", async () => {
    vi.mocked(repo.findByKey).mockResolvedValue(quoteRow({ rfqId: OTHER_RFQ }));
    await expect(service.createQuote(SELLER, input(), now)).rejects.toMatchObject({ status: 400 });
  });

  it("two simultaneous submits of one form: the second finds the first after the lock and writes nothing", async () => {
    vi.mocked(repo.findByKey).mockResolvedValueOnce(undefined).mockResolvedValueOnce(quoteRow());
    const { created } = await service.createQuote(SELLER, input(), now);
    expect(created).toBe(false);
    expect(repo.supersedeActive).not.toHaveBeenCalled();
    expect(repo.insertQuote).not.toHaveBeenCalled();
    expect(sendNewQuoteEmail).not.toHaveBeenCalled();
  });

  it("a key race on another request undoes the transaction (the request is not left quoted without a quotation)", async () => {
    vi.mocked(repo.findByKey)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(quoteRow({ rfqId: OTHER_RFQ }))
      .mockResolvedValueOnce(quoteRow({ rfqId: OTHER_RFQ }));
    await expect(service.createQuote(SELLER, input(), now)).rejects.toMatchObject({ status: 400 });
    expect(repo.insertQuote).not.toHaveBeenCalled();
  });

  it("the request expired or changed while sending (conditional update refused): conflict, nothing written", async () => {
    vi.mocked(markRfqQuoted).mockResolvedValue(false);
    vi.mocked(getRfqForQuote).mockResolvedValueOnce(rfq()).mockResolvedValueOnce(rfq({ status: "expired" }));
    await expect(service.createQuote(SELLER, input(), now)).rejects.toMatchObject({ status: 409 });
    expect(repo.insertQuote).not.toHaveBeenCalled();
    expect(sendNewQuoteEmail).not.toHaveBeenCalled();
  });

  it("stops at the per-request cap of quotations", async () => {
    vi.mocked(repo.countForRfq).mockResolvedValue(20);
    await expect(service.createQuote(SELLER, input(), now)).rejects.toMatchObject({ status: 409 });
    expect(repo.insertQuote).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------- withdraw

describe("withdrawQuote", () => {
  it("the seller withdraws their active quotation", async () => {
    vi.mocked(repo.findQuote).mockResolvedValue(quoteRow());
    vi.mocked(repo.transition).mockResolvedValue(quoteRow({ status: "withdrawn", closedAt: now }));
    const quote = await service.withdrawQuote(SELLER, QUOTE, now);
    expect(repo.transition).toHaveBeenCalledWith({ id: QUOTE, sellerUserId: SELLER, from: ["active"], to: "withdrawn", at: now });
    expect(quote.status).toBe("withdrawn");
  });

  it("another seller's quotation is not found", async () => {
    vi.mocked(repo.findQuote).mockResolvedValue(quoteRow());
    await expect(service.withdrawQuote(OTHER_SELLER, QUOTE, now)).rejects.toMatchObject({ status: 404 });
    expect(repo.transition).not.toHaveBeenCalled();
  });

  it("a buyer id cannot withdraw (not the seller): not found", async () => {
    vi.mocked(repo.findQuote).mockResolvedValue(quoteRow());
    await expect(service.withdrawQuote(BUYER, QUOTE, now)).rejects.toMatchObject({ status: 404 });
  });

  it.each([
    ["superseded", {}],
    ["withdrawn", {}],
    ["expired", { status: "active" as const, validUntil: new Date(now.getTime() - 1) }],
  ])("a %s quotation cannot be withdrawn", async (_label, overrides) => {
    vi.mocked(repo.findQuote).mockResolvedValue(quoteRow({ status: _label === "expired" ? "active" : (_label as "superseded"), closedAt: now, ...overrides }));
    vi.mocked(repo.transition).mockResolvedValue(undefined);
    await expect(service.withdrawQuote(SELLER, QUOTE, now)).rejects.toMatchObject({ status: 409 });
  });
});

// ---------------------------------------------------------------- reading

describe("reading quotations", () => {
  it("the buyer and the seller of the request can read it", async () => {
    vi.mocked(repo.findQuote).mockResolvedValue(quoteRow());
    await expect(service.getQuote("buyer", BUYER, QUOTE, now)).resolves.toMatchObject({ id: QUOTE });
    await expect(service.getQuote("seller", SELLER, QUOTE, now)).resolves.toMatchObject({ id: QUOTE });
  });

  it("another buyer, another seller, or the wrong side gets not found", async () => {
    vi.mocked(repo.findQuote).mockResolvedValue(quoteRow());
    await expect(service.getQuote("buyer", OTHER_BUYER, QUOTE, now)).rejects.toMatchObject({ status: 404 });
    await expect(service.getQuote("seller", OTHER_SELLER, QUOTE, now)).rejects.toMatchObject({ status: 404 });
    // A seller id on the buyer side (or the other way round) never matches.
    await expect(service.getQuote("buyer", SELLER, QUOTE, now)).rejects.toMatchObject({ status: 404 });
    await expect(service.getQuote("seller", BUYER, QUOTE, now)).rejects.toMatchObject({ status: 404 });
  });

  it("an active quotation past its validity reads as expired before the sweep runs", async () => {
    vi.mocked(repo.findQuote).mockResolvedValue(quoteRow({ validUntil: new Date(now.getTime() - 1000) }));
    await expect(service.getQuote("buyer", BUYER, QUOTE, now)).resolves.toMatchObject({ status: "expired" });
  });

  it("listing another user's request is not found", async () => {
    await expect(service.listQuotes("buyer", OTHER_BUYER, { rfqId: RFQ, limit: 20 }, now)).rejects.toMatchObject({ status: 404 });
    await expect(service.listQuotes("seller", OTHER_SELLER, { rfqId: RFQ, limit: 20 }, now)).rejects.toMatchObject({ status: 404 });
    expect(repo.listForRfq).not.toHaveBeenCalled();
  });

  it("a tampered list cursor is refused", async () => {
    await expect(service.listQuotes("buyer", BUYER, { rfqId: RFQ, limit: 20, cursor: "not-a-cursor" }, now)).rejects.toMatchObject({ status: 400 });
  });

  it("the PDF is only for the request's buyer or seller, and is a real PDF", async () => {
    vi.mocked(repo.findQuote).mockResolvedValue(quoteRow());
    vi.mocked(repo.listItems).mockResolvedValue([
      { quotationId: QUOTE, position: 1, partNumber: "B3206050", description: "PISTON", details: null, quantity: 1, unitPriceAmount: 438_300, amount: 438_300 },
    ]);
    await expect(service.getQuotePdf("buyer", OTHER_BUYER, QUOTE, now)).rejects.toMatchObject({ status: 404 });
    const { filename, pdf } = await service.getQuotePdf("buyer", BUYER, QUOTE, now);
    expect(filename).toBe("Muhrak-Quotation-QT-1001.pdf");
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  });
});
