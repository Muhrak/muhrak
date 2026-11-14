import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  Object.assign(process.env, {
    DATABASE_URL: "postgres://test:test@localhost:5432/test",
    JWT_SECRET: "test-secret-that-is-at-least-32-characters-long",
  });
});

vi.mock("../seller", () => ({
  getVerifiedSellerProfile: vi.fn(),
  listVerifiedSellerIds: vi.fn(),
  listVerifiedSellersPage: vi.fn(),
}));
vi.mock("../catalog", () => ({
  countSellersPerCategory: vi.fn(),
  getSellerCatalogStats: vi.fn(),
  listPublishedProducts: vi.fn(),
  sellersMatchingProductText: vi.fn(),
  sellersPublishingInCategory: vi.fn(),
}));
vi.mock("../upload", () => ({ getPublicLogoUrls: vi.fn() }));

const seller = await import("../seller");
const catalog = await import("../catalog");
const { getPublicLogoUrls } = await import("../upload");
const { getDirectory, getSeller, getSellerProducts } = await import("./storefront.service");

const now = new Date("2026-11-14T12:00:00Z");
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CATEGORY = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const profile = (userId: string, verifiedDaysAgo: number) => ({
  userId,
  companyName: userId === A ? "Gulf Breaker Parts" : "Najd Equipment",
  about: "Breaker parts",
  city: "Muscat",
  country: "OM" as const,
  brands: ["Soosan"],
  logoUploadId: `${userId.slice(0, 8)}-logo`,
  verifiedAt: new Date(now.getTime() - verifiedDaysAgo * 86_400_000),
  createdAt: new Date("2026-11-01T00:00:00Z"),
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(seller.listVerifiedSellerIds).mockResolvedValue([A, B]);
  vi.mocked(seller.listVerifiedSellersPage).mockResolvedValue({ rows: [profile(A, 3), profile(B, 90)], total: 2 });
  vi.mocked(catalog.countSellersPerCategory).mockResolvedValue([{ id: CATEGORY, name: "Hydraulics", count: 1 }]);
  vi.mocked(catalog.sellersPublishingInCategory).mockResolvedValue([A]);
  vi.mocked(catalog.sellersMatchingProductText).mockResolvedValue([]);
  vi.mocked(catalog.getSellerCatalogStats).mockResolvedValue(
    new Map([[A, { productCount: 3, mainCategory: "Hydraulics", coverPhotoUrl: "https://b/public/products/p.webp", categories: [] }]]),
  );
  vi.mocked(getPublicLogoUrls).mockResolvedValue(new Map([[`${A.slice(0, 8)}-logo`, "https://b/public/logos/a.webp"]]));
});

describe("getDirectory", () => {
  it("lists verified sellers with counts, logo, cover and the New badge (verified < 30 days)", async () => {
    const page = await getDirectory({ sort: "name", page: 1 }, now);
    expect(page.allCount).toBe(2);
    expect(page.items[0]).toEqual({
      id: A,
      companyName: "Gulf Breaker Parts",
      city: "Muscat",
      countryName: "Oman",
      logoUrl: "https://b/public/logos/a.webp",
      productCount: 3,
      mainCategory: "Hydraulics",
      coverPhotoUrl: "https://b/public/products/p.webp",
      isNew: true,
    });
    expect(page.items[1]).toMatchObject({ id: B, productCount: 0, isNew: false, logoUrl: null });
  });

  it("filters by category and search only among VERIFIED sellers", async () => {
    await getDirectory({ sort: "name", page: 2, category: CATEGORY, q: "6020/F4" }, now);
    expect(catalog.sellersPublishingInCategory).toHaveBeenCalledWith(CATEGORY, [A, B]);
    expect(catalog.sellersMatchingProductText).toHaveBeenCalledWith("6020/F4", [A, B]);
    expect(seller.listVerifiedSellersPage).toHaveBeenCalledWith(
      expect.objectContaining({ ids: [A], q: "6020/F4", offset: 8, limit: 8 }),
    );
  });

  it("never returns private company data", async () => {
    const page = await getDirectory({ sort: "name", page: 1 }, now);
    const json = JSON.stringify(page);
    for (const field of ["email", "phone", "website", "vat", "documents", "crNumber"]) expect(json.toLowerCase()).not.toContain(field);
  });
});

describe("getSeller / getSellerProducts", () => {
  it("a seller who is not (or no longer) verified is a 404, products included", async () => {
    vi.mocked(seller.getVerifiedSellerProfile).mockResolvedValue(undefined);
    await expect(getSeller(A)).rejects.toMatchObject({ status: 404 });
    await expect(getSellerProducts(A, { page: 1 })).rejects.toMatchObject({ status: 404 });
    expect(catalog.listPublishedProducts).not.toHaveBeenCalled();
  });

  it("shows a verified seller's public profile without private fields", async () => {
    vi.mocked(seller.getVerifiedSellerProfile).mockResolvedValue(profile(A, 3));
    const result = await getSeller(A);
    expect(result).toMatchObject({ id: A, companyName: "Gulf Breaker Parts", countryName: "Oman", productCount: 3 });
    expect(Object.keys(result).sort()).toEqual(
      ["about", "brands", "categories", "city", "companyName", "countryName", "id", "logoUrl", "memberSince", "productCount", "verifiedSince"].sort(),
    );
  });

  it("pages a verified seller's live products", async () => {
    vi.mocked(seller.getVerifiedSellerProfile).mockResolvedValue(profile(A, 3));
    vi.mocked(catalog.listPublishedProducts).mockResolvedValue({ items: [], total: 0 });
    await getSellerProducts(A, { page: 3, category: CATEGORY });
    expect(catalog.listPublishedProducts).toHaveBeenCalledWith({ sellerUserId: A, categoryId: CATEGORY, page: 3, pageSize: 8 });
  });
});
