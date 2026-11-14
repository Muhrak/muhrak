import { z } from "zod";
import { productConditionSchema, productUnitSchema } from "./catalog";
import { moneySchema } from "./money-schema";

/**
 * Public storefront (buyer side, no sign-in needed): the Sellers directory
 * and each seller's profile page (Figma "Buyer – Manufacturers v2" and
 * "Buyer – Manufacturer Profile v2", renamed to Sellers).
 *
 * Only VERIFIED sellers and their PUBLISHED products appear. Nothing
 * private is ever returned: no email, phone, website, CR or VAT details
 * (buyers reach sellers through Muhrak, where payment happens).
 */

export const STOREFRONT_PAGE_SIZE = 8; // Figma: "Showing 1–8 of …", 4 per row

export const storefrontCategoryCountSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  count: z.number().int(),
});
export type StorefrontCategoryCount = z.infer<typeof storefrontCategoryCountSchema>;

export const sellerDirectoryQuerySchema = z.object({
  /** Company name, brand, machine model or part number. */
  q: z.string().trim().max(60).optional(),
  category: z.string().uuid().optional(),
  sort: z.enum(["name", "newest"]).default("name"),
  page: z.coerce.number().int().min(1).max(1000).default(1),
});
export type SellerDirectoryQuery = z.infer<typeof sellerDirectoryQuerySchema>;

export const sellerCardSchema = z.object({
  id: z.string().uuid(),
  companyName: z.string(),
  city: z.string(),
  countryName: z.string(),
  logoUrl: z.string().url().nullable(),
  productCount: z.number().int(),
  /** The seller's most common category, e.g. "Hydraulics". */
  mainCategory: z.string().nullable(),
  /** Photo of their newest live product, for the card. */
  coverPhotoUrl: z.string().url().nullable(),
  /** Verified in the last 30 days. */
  isNew: z.boolean(),
});
export type SellerCard = z.infer<typeof sellerCardSchema>;

export const sellerDirectoryResponseSchema = z.object({
  items: z.array(sellerCardSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
  /** Tabs: "All" plus each category with at least one seller. */
  allCount: z.number().int(),
  categories: z.array(storefrontCategoryCountSchema),
});
export type SellerDirectoryResponse = z.infer<typeof sellerDirectoryResponseSchema>;

export const publicSellerSchema = z.object({
  id: z.string().uuid(),
  companyName: z.string(),
  about: z.string(),
  city: z.string(),
  countryName: z.string(),
  brands: z.array(z.string()),
  logoUrl: z.string().url().nullable(),
  verifiedSince: z.string().nullable(),
  memberSince: z.string(),
  productCount: z.number().int(),
  categories: z.array(storefrontCategoryCountSchema),
});
export type PublicSeller = z.infer<typeof publicSellerSchema>;

export const publicSellerResponseSchema = z.object({ seller: publicSellerSchema });
export type PublicSellerResponse = z.infer<typeof publicSellerResponseSchema>;

export const sellerProductsQuerySchema = z.object({
  category: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
});
export type SellerProductsQuery = z.infer<typeof sellerProductsQuerySchema>;

export const publicProductCardSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  partNumber: z.string().nullable(),
  categoryName: z.string(),
  condition: productConditionSchema,
  price: moneySchema.nullable(),
  unit: productUnitSchema,
  photoUrl: z.string().url().nullable(),
  isNew: z.boolean(),
});
export type PublicProductCard = z.infer<typeof publicProductCardSchema>;

export const sellerProductsResponseSchema = z.object({
  items: z.array(publicProductCardSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});
export type SellerProductsResponse = z.infer<typeof sellerProductsResponseSchema>;
