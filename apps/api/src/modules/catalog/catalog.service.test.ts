import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CategoryRow, ProductRow } from "../../db/schema";
import type { ProductInput } from "../../schemas";

vi.hoisted(() => {
  Object.assign(process.env, {
    DATABASE_URL: "postgres://test:test@localhost:5432/test",
    JWT_SECRET: "test-secret-that-is-at-least-32-characters-long",
  });
});

vi.mock("./catalog.repository", () => ({
  inTransaction: vi.fn(async (work: (tx: unknown) => unknown) => work({})),
  listCategories: vi.fn(),
  findCategory: vi.fn(),
  findCategories: vi.fn(),
  insertProduct: vi.fn(),
  findProduct: vi.fn(),
  updateProductFields: vi.fn(),
  changeStatus: vi.fn(),
  replaceChildren: vi.fn(),
  findChildren: vi.fn(),
  findPhotosUsedElsewhere: vi.fn(),
  listSellerProducts: vi.fn(),
  countSellerProducts: vi.fn(),
}));
vi.mock("../seller", () => ({ isSellerVerified: vi.fn() }));
vi.mock("../upload", () => ({ attachUpload: vi.fn(), getProductPhotoUrls: vi.fn() }));

const repo = await import("./catalog.repository");
const { isSellerVerified } = await import("../seller");
const { attachUpload, getProductPhotoUrls } = await import("../upload");
const { createProduct, updateProduct, changeProductStatus, getProduct, listProducts, STATUS_TRANSITIONS } = await import("./catalog.service");

const SELLER = "11111111-1111-4111-8111-111111111111";
const OTHER_SELLER = "22222222-2222-4222-8222-222222222222";
const PRODUCT = "33333333-3333-4333-8333-333333333333";
const CATEGORY = "44444444-4444-4444-8444-444444444444";
const PHOTO = "55555555-5555-4555-8555-555555555555";
const PHOTO_2 = "66666666-6666-4666-8666-666666666666";
const now = new Date("2026-11-14T10:00:00.000Z");

const category: CategoryRow = { id: CATEGORY, slug: "electrical", name: "Electrical", sortOrder: 20, createdAt: now };

function input(overrides: Partial<ProductInput> = {}): ProductInput {
  return {
    name: "Alternator 24V 80A",
    categoryId: CATEGORY,
    partNumbers: ["AL2528SEG", "0 124 555 006"],
    brand: "Bosch",
    partSource: "aftermarket",
    condition: "new",
    price: "120.500",
    unit: "piece",
    stockQuantity: 4,
    availability: "in_stock",
    leadTimeDays: null,
    description: null,
    fitments: [{ make: "Hitachi", model: "ZW310" }],
    photoUploadIds: [PHOTO],
    ...overrides,
  };
}

function product(overrides: Partial<ProductRow> = {}): ProductRow {
  return {
    id: PRODUCT,
    sellerUserId: SELLER,
    categoryId: CATEGORY,
    name: "Alternator 24V 80A",
    brand: null,
    partSource: null,
    condition: "new",
    priceAmount: 120_500,
    priceCurrency: "OMR",
    unit: "piece",
    stockQuantity: 4,
    availability: "in_stock",
    leadTimeDays: null,
    description: null,
    status: "draft",
    version: 3,
    publishedAt: null,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

const children = (photos: string[] = [PHOTO]) => ({
  partNumbers: [],
  fitments: [],
  photos: photos.map((uploadId, position) => ({ id: `ph-${position}`, productId: PRODUCT, uploadId, position })),
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(repo.findCategory).mockResolvedValue(category);
  vi.mocked(repo.findCategories).mockResolvedValue([category]);
  vi.mocked(repo.findChildren).mockResolvedValue(children());
  vi.mocked(repo.findPhotosUsedElsewhere).mockResolvedValue([]);
  vi.mocked(repo.countSellerProducts).mockResolvedValue({ all: 0, published: 0, draft: 0, archived: 0, out_of_stock: 0 });
  vi.mocked(repo.insertProduct).mockImplementation(async (_tx, values) => product({ ...values, id: PRODUCT, version: 1 } as Partial<ProductRow>));
  vi.mocked(repo.updateProductFields).mockImplementation(async (_tx, args) => product({ ...args.fields, version: args.version + 1 } as Partial<ProductRow>));
  vi.mocked(repo.changeStatus).mockImplementation(async (args) => product({ status: args.to }));
  vi.mocked(getProductPhotoUrls).mockResolvedValue(new Map([[PHOTO, { url: "https://b/public/products/p.webp", thumbUrl: "https://b/public/products/p-thumb.webp" }]]));
  vi.mocked(isSellerVerified).mockResolvedValue(true);
});

describe("createProduct", () => {
  it("creates a draft, converts the price to integer baisa on the server, attaches the photos", async () => {
    const created = await createProduct(SELLER, input(), now);
    const values = vi.mocked(repo.insertProduct).mock.calls[0]?.[1];
    expect(values).toMatchObject({ sellerUserId: SELLER, priceAmount: 120_500, priceCurrency: "OMR" });
    expect(created.status).toBe("draft");
    expect(created.price).toEqual({ amountMinor: 120_500, currency: "OMR" });
    expect(attachUpload).toHaveBeenCalledWith(SELLER, PHOTO, "product_photo");
    const kids = vi.mocked(repo.replaceChildren).mock.calls[0]?.[2];
    expect(kids?.partNumbers).toEqual([
      { value: "AL2528SEG", normalized: "AL2528SEG" },
      { value: "0 124 555 006", normalized: "0124555006" },
    ]);
    expect(kids?.fitments).toEqual([{ make: "Hitachi", model: "ZW310", normalized: "hitachizw310" }]);
  });

  it("stores price on request as no price at all", async () => {
    await createProduct(SELLER, input({ price: null }), now);
    expect(vi.mocked(repo.insertProduct).mock.calls[0]?.[1]).toMatchObject({ priceAmount: null, priceCurrency: null });
  });

  it.each([["0"], ["0.000"]])("refuses a zero price (%s)", async (price) => {
    await expect(createProduct(SELLER, input({ price }), now)).rejects.toMatchObject({ status: 400 });
    expect(repo.insertProduct).not.toHaveBeenCalled();
  });

  it("refuses a category that does not exist (tampered id)", async () => {
    vi.mocked(repo.findCategory).mockResolvedValue(undefined);
    await expect(createProduct(SELLER, input(), now)).rejects.toMatchObject({ status: 400 });
    expect(repo.insertProduct).not.toHaveBeenCalled();
  });

  it("refuses a photo that belongs to another product", async () => {
    vi.mocked(repo.findPhotosUsedElsewhere).mockResolvedValue([PHOTO]);
    await expect(createProduct(SELLER, input(), now)).rejects.toMatchObject({ status: 400 });
    expect(attachUpload).not.toHaveBeenCalled();
  });

  it("refuses someone else's upload (the upload module says no)", async () => {
    vi.mocked(attachUpload).mockRejectedValueOnce(Object.assign(new Error("This file cannot be used."), { status: 400 }));
    await expect(createProduct(SELLER, input(), now)).rejects.toMatchObject({ status: 400 });
    expect(repo.insertProduct).not.toHaveBeenCalled();
  });

  it("drops a lead time sent for an in-stock product", async () => {
    await createProduct(SELLER, input({ availability: "in_stock", leadTimeDays: null }), now);
    expect(vi.mocked(repo.insertProduct).mock.calls[0]?.[1]).toMatchObject({ leadTimeDays: null });
  });

  it("caps products per seller", async () => {
    vi.mocked(repo.countSellerProducts).mockResolvedValue({ all: 4_000, published: 0, draft: 0, archived: 1_000, out_of_stock: 0 });
    await expect(createProduct(SELLER, input(), now)).rejects.toMatchObject({ status: 403 });
  });
});

describe("ownership", () => {
  it("another seller's product looks like it does not exist (read, edit, status)", async () => {
    vi.mocked(repo.findProduct).mockResolvedValue(product({ sellerUserId: OTHER_SELLER }));
    await expect(getProduct(SELLER, PRODUCT)).rejects.toMatchObject({ status: 404 });
    await expect(updateProduct(SELLER, PRODUCT, { version: 3, product: input() }, now)).rejects.toMatchObject({ status: 404 });
    await expect(changeProductStatus(SELLER, PRODUCT, "archive", now)).rejects.toMatchObject({ status: 404 });
    expect(repo.updateProductFields).not.toHaveBeenCalled();
    expect(repo.changeStatus).not.toHaveBeenCalled();
  });
});

describe("updateProduct", () => {
  it("saves with the version it started from, keeps existing photos, attaches only new ones", async () => {
    vi.mocked(repo.findProduct).mockResolvedValue(product());
    const saved = await updateProduct(SELLER, PRODUCT, { version: 3, product: input({ photoUploadIds: [PHOTO, PHOTO_2] }) }, now);
    expect(vi.mocked(repo.updateProductFields).mock.calls[0]?.[1]).toMatchObject({ id: PRODUCT, sellerUserId: SELLER, version: 3 });
    expect(attachUpload).toHaveBeenCalledTimes(1);
    expect(attachUpload).toHaveBeenCalledWith(SELLER, PHOTO_2, "product_photo");
    expect(saved.version).toBe(4);
  });

  it("refuses a stale edit (another tab saved first)", async () => {
    vi.mocked(repo.findProduct).mockResolvedValue(product({ version: 4 }));
    await expect(updateProduct(SELLER, PRODUCT, { version: 3, product: input() }, now)).rejects.toMatchObject({ status: 409 });
    expect(repo.updateProductFields).not.toHaveBeenCalled();
  });

  it("refuses when another save wins the race between check and write", async () => {
    vi.mocked(repo.findProduct).mockResolvedValue(product());
    vi.mocked(repo.updateProductFields).mockResolvedValue(undefined);
    await expect(updateProduct(SELLER, PRODUCT, { version: 3, product: input() }, now)).rejects.toMatchObject({ status: 409 });
    expect(repo.replaceChildren).not.toHaveBeenCalled();
  });

  it("refuses editing an archived product", async () => {
    vi.mocked(repo.findProduct).mockResolvedValue(product({ status: "archived" }));
    await expect(updateProduct(SELLER, PRODUCT, { version: 3, product: input() }, now)).rejects.toMatchObject({ status: 409 });
  });

  it("a live product cannot lose all its photos", async () => {
    vi.mocked(repo.findProduct).mockResolvedValue(product({ status: "published" }));
    await expect(updateProduct(SELLER, PRODUCT, { version: 3, product: input({ photoUploadIds: [] }) }, now)).rejects.toMatchObject({ status: 400 });
  });
});

describe("changeProductStatus", () => {
  it("publishes a verified seller's draft that has a photo", async () => {
    vi.mocked(repo.findProduct).mockResolvedValue(product());
    const live = await changeProductStatus(SELLER, PRODUCT, "publish", now);
    expect(repo.changeStatus).toHaveBeenCalledWith({ id: PRODUCT, sellerUserId: SELLER, from: ["draft"], to: "published", at: now });
    expect(live.status).toBe("published");
  });

  it("refuses to publish for a seller who is not verified", async () => {
    vi.mocked(repo.findProduct).mockResolvedValue(product());
    vi.mocked(isSellerVerified).mockResolvedValue(false);
    await expect(changeProductStatus(SELLER, PRODUCT, "publish", now)).rejects.toMatchObject({ status: 403 });
    expect(repo.changeStatus).not.toHaveBeenCalled();
  });

  it("refuses to publish without a photo", async () => {
    vi.mocked(repo.findProduct).mockResolvedValue(product());
    vi.mocked(repo.findChildren).mockResolvedValue(children([]));
    await expect(changeProductStatus(SELLER, PRODUCT, "publish", now)).rejects.toMatchObject({ status: 400 });
  });

  it.each([
    ["publish", "published"],
    ["publish", "archived"],
    ["unpublish", "draft"],
    ["restore", "published"],
    ["archive", "archived"],
  ] as const)("refuses %s from %s (not an allowed transition)", async (action, status) => {
    vi.mocked(repo.findProduct).mockResolvedValue(product({ status }));
    await expect(changeProductStatus(SELLER, PRODUCT, action, now)).rejects.toMatchObject({ status: 409 });
    expect(repo.changeStatus).not.toHaveBeenCalled();
  });

  it("a double click applies the change once (the conditional update loses the second time)", async () => {
    vi.mocked(repo.findProduct).mockResolvedValue(product());
    vi.mocked(repo.changeStatus).mockResolvedValue(undefined);
    await expect(changeProductStatus(SELLER, PRODUCT, "archive", now)).rejects.toMatchObject({ status: 409 });
  });

  it("archiving never deletes: every transition ends in a status", () => {
    expect(Object.values(STATUS_TRANSITIONS).map((t) => t.to)).toEqual(["published", "draft", "archived", "draft"]);
  });
});

describe("listProducts", () => {
  it("lists only the signed-in seller's products and refuses a tampered cursor", async () => {
    vi.mocked(repo.listSellerProducts).mockResolvedValue([product()]);
    const page = await listProducts(SELLER, { filter: "all", limit: 20 });
    expect(vi.mocked(repo.listSellerProducts).mock.calls[0]?.[0]).toMatchObject({ sellerUserId: SELLER, limit: 21 });
    expect(page.items[0]).toMatchObject({ id: PRODUCT, categoryName: "Electrical", coverThumbUrl: "https://b/public/products/p-thumb.webp" });
    await expect(listProducts(SELLER, { filter: "all", limit: 20, cursor: "not-a-cursor" })).rejects.toMatchObject({ status: 400 });
  });

  it("searches part numbers ignoring punctuation", async () => {
    vi.mocked(repo.listSellerProducts).mockResolvedValue([]);
    await listProducts(SELLER, { filter: "all", limit: 20, q: "6020/f4" });
    expect(vi.mocked(repo.listSellerProducts).mock.calls[0]?.[0].q).toEqual({ text: "6020/f4", partNumber: "6020F4" });
  });
});
