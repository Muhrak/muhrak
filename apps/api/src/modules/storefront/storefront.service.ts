import {
  GCC_COUNTRY_NAMES,
  STOREFRONT_PAGE_SIZE,
  type PublicSeller,
  type SellerDirectoryQuery,
  type SellerDirectoryResponse,
  type SellerProductsQuery,
  type SellerProductsResponse,
} from "../../schemas";
import { notFound } from "../../shared/errors";
import { countSellersPerCategory, getSellerCatalogStats, listPublishedProducts, sellersMatchingProductText, sellersPublishingInCategory } from "../catalog";
import { getVerifiedSellerProfile, listVerifiedSellerIds, listVerifiedSellersPage } from "../seller";
import { getPublicLogoUrls } from "../upload";

/**
 * Storefront: the public Sellers directory and seller profile pages (no
 * sign-in). It owns no tables; it combines the seller module (who is
 * verified, company details) with the catalog (live products).
 *
 * Only VERIFIED sellers appear, and only their PUBLISHED products. A seller
 * who is not (or no longer) verified is a 404, products included. Nothing
 * private is returned (no email, phone, website, CR or VAT).
 */

const NEW_SELLER_DAYS = 30;
const NOT_FOUND = "Seller not found";

export async function getDirectory(query: SellerDirectoryQuery, now = new Date()): Promise<SellerDirectoryResponse> {
  const verifiedIds = await listVerifiedSellerIds();
  const text = query.q?.trim() || null;
  const [categories, inCategory, matchingProducts] = await Promise.all([
    countSellersPerCategory(verifiedIds),
    query.category ? sellersPublishingInCategory(query.category, verifiedIds) : Promise.resolve(null),
    text ? sellersMatchingProductText(text, verifiedIds) : Promise.resolve([]),
  ]);

  const page = await listVerifiedSellersPage({
    ids: inCategory,
    q: text,
    alsoMatchingIds: matchingProducts,
    sort: query.sort,
    offset: (query.page - 1) * STOREFRONT_PAGE_SIZE,
    limit: STOREFRONT_PAGE_SIZE,
  });
  const ids = page.rows.map((row) => row.userId);
  const [stats, logos] = await Promise.all([
    getSellerCatalogStats(ids),
    getPublicLogoUrls(page.rows.flatMap((row) => (row.logoUploadId ? [row.logoUploadId] : []))),
  ]);

  return {
    items: page.rows.map((row) => {
      const stat = stats.get(row.userId);
      return {
        id: row.userId,
        companyName: row.companyName,
        city: row.city,
        countryName: GCC_COUNTRY_NAMES[row.country],
        logoUrl: row.logoUploadId ? (logos.get(row.logoUploadId) ?? null) : null,
        productCount: stat?.productCount ?? 0,
        mainCategory: stat?.mainCategory ?? null,
        coverPhotoUrl: stat?.coverPhotoUrl ?? null,
        isNew: row.verifiedAt !== null && now.getTime() - row.verifiedAt.getTime() < NEW_SELLER_DAYS * 86_400_000,
      };
    }),
    total: page.total,
    page: query.page,
    pageSize: STOREFRONT_PAGE_SIZE,
    allCount: verifiedIds.length,
    categories,
  };
}

export async function getSeller(sellerId: string): Promise<PublicSeller> {
  const profile = await getVerifiedSellerProfile(sellerId);
  if (!profile) throw notFound(NOT_FOUND);
  const [stats, logos] = await Promise.all([
    getSellerCatalogStats([sellerId]),
    getPublicLogoUrls(profile.logoUploadId ? [profile.logoUploadId] : []),
  ]);
  const stat = stats.get(sellerId);
  return {
    id: profile.userId,
    companyName: profile.companyName,
    about: profile.about,
    city: profile.city,
    countryName: GCC_COUNTRY_NAMES[profile.country],
    brands: profile.brands,
    logoUrl: profile.logoUploadId ? (logos.get(profile.logoUploadId) ?? null) : null,
    verifiedSince: profile.verifiedAt?.toISOString() ?? null,
    memberSince: profile.createdAt.toISOString(),
    productCount: stat?.productCount ?? 0,
    categories: stat?.categories ?? [],
  };
}

export async function getSellerProducts(sellerId: string, query: SellerProductsQuery): Promise<SellerProductsResponse> {
  // Not verified (or not a seller): no products either.
  if (!(await getVerifiedSellerProfile(sellerId))) throw notFound(NOT_FOUND);
  const result = await listPublishedProducts({
    sellerUserId: sellerId,
    categoryId: query.category ?? null,
    page: query.page,
    pageSize: STOREFRONT_PAGE_SIZE,
  });
  return { ...result, page: query.page, pageSize: STOREFRONT_PAGE_SIZE };
}
