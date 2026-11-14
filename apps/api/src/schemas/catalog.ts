import { z } from "zod";
import { moneySchema } from "./money-schema";

/**
 * Catalog: categories and seller products (Day 5, 14 Nov 2026).
 *
 * Fields come from real buyer requests: buyers ask by machine ("Kobelco
 * 380", "Doosan 300") and by part number ("6020/F4", "AL2528SEG"), in many
 * units ("5 carton", "4 set", "2 pcs"), and care about lead time.
 */

// ---------------------------------------------------------------- categories

export const categorySchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
});
export type Category = z.infer<typeof categorySchema>;

export const categoriesResponseSchema = z.object({ categories: z.array(categorySchema) });
export type CategoriesResponse = z.infer<typeof categoriesResponseSchema>;

// ---------------------------------------------------------------- product fields

export const productStatusSchema = z.enum(["draft", "published", "archived"]);
export type ProductStatus = z.infer<typeof productStatusSchema>;

export const productConditionSchema = z.enum(["new", "used", "refurbished"]);
export type ProductCondition = z.infer<typeof productConditionSchema>;

export const productPartSourceSchema = z.enum(["genuine", "aftermarket"]);
export type ProductPartSource = z.infer<typeof productPartSourceSchema>;

export const productUnitSchema = z.enum(["piece", "pair", "set", "kit", "box", "carton", "metre", "litre"]);
export type ProductUnit = z.infer<typeof productUnitSchema>;

export const productAvailabilitySchema = z.enum(["in_stock", "on_order"]);
export type ProductAvailability = z.infer<typeof productAvailabilitySchema>;

export const PRODUCT_LIMITS = {
  /** Figma "Add product": up to 6 photos, the first is the cover. */
  photos: 6,
  partNumbers: 10,
  fitments: 20,
  /** Largest price: 99,999,999.999 OMR. */
  maxPriceMinor: 99_999_999_999,
  maxStock: 1_000_000,
  maxLeadTimeDays: 365,
} as const;

/** Labels shown to people (the same words on the seller and buyer side). */
export const CONDITION_LABELS: Record<ProductCondition, string> = { new: "New", used: "Used", refurbished: "Refurbished" };
export const PART_SOURCE_LABELS: Record<ProductPartSource, string> = { genuine: "Genuine (OEM)", aftermarket: "Aftermarket" };
export const UNIT_LABELS: Record<ProductUnit, { one: string; many: string }> = {
  piece: { one: "piece", many: "pieces" },
  pair: { one: "pair", many: "pairs" },
  set: { one: "set", many: "sets" },
  kit: { one: "kit", many: "kits" },
  box: { one: "box", many: "boxes" },
  carton: { one: "carton", many: "cartons" },
  metre: { one: "metre", many: "metres" },
  litre: { one: "litre", many: "litres" },
};

/**
 * Part numbers are matched ignoring case, spaces and punctuation:
 * "6020/F4", "6020-f4" and "6020 F4" are the same part number.
 */
export function normalizePartNumber(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** "Kobelco" + "SK 380" -> "kobelcosk380": what machine search matches on. */
export function normalizeFitment(make: string, model: string): string {
  return `${make} ${model}`.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const text = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((value) => (value ? value : null));

/** A price typed by the seller, in OMR: digits with up to 3 decimals ("120", "120.5", "120.500"). */
export const priceInputSchema = z
  .string()
  .trim()
  .regex(/^\d{1,8}(\.\d{1,3})?$/, "Enter a price such as 120.000 (OMR, up to 3 decimals)");

export const fitmentSchema = z.object({
  make: text(40).min(1, "Enter the machine make, e.g. Kobelco"),
  model: text(60).min(1, "Enter the model, e.g. SK380"),
});
export type Fitment = z.infer<typeof fitmentSchema>;

/**
 * Create a product (always starts as a draft) or replace its fields.
 * The price is sent as a decimal string and converted to integer baisa on
 * the server; `null` means "price on request". Photos are upload ids
 * (purpose product_photo) in display order; the first is the cover.
 */
export const productInputSchema = z
  .object({
    name: text(120).min(3, "Enter a product name of at least 3 characters"),
    categoryId: z.string().uuid("Choose a category"),
    /** The main part number first, then alternatives / cross references. */
    partNumbers: z
      .array(text(40).min(1))
      .max(PRODUCT_LIMITS.partNumbers, `Up to ${PRODUCT_LIMITS.partNumbers} part numbers`)
      .refine((values) => values.every((value) => normalizePartNumber(value).length > 0), "A part number needs letters or digits")
      .refine(
        (values) => new Set(values.map(normalizePartNumber)).size === values.length,
        "The same part number is listed twice",
      ),
    brand: optionalText(60),
    partSource: productPartSourceSchema.nullable(),
    condition: productConditionSchema,
    price: priceInputSchema.nullable(),
    unit: productUnitSchema,
    stockQuantity: z.number().int().min(0).max(PRODUCT_LIMITS.maxStock).nullable(),
    availability: productAvailabilitySchema,
    leadTimeDays: z.number().int().min(1).max(PRODUCT_LIMITS.maxLeadTimeDays).nullable(),
    description: optionalText(2000),
    fitments: z.array(fitmentSchema).max(PRODUCT_LIMITS.fitments, `Up to ${PRODUCT_LIMITS.fitments} machines`),
    photoUploadIds: z
      .array(z.string().uuid())
      .max(PRODUCT_LIMITS.photos, `Up to ${PRODUCT_LIMITS.photos} photos`)
      .refine((ids) => new Set(ids).size === ids.length, "The same photo is listed twice"),
  })
  .refine((input) => input.availability === "on_order" || input.leadTimeDays === null, {
    path: ["leadTimeDays"],
    message: "Lead time is only for products made or ordered on request",
  })
  .refine((input) => input.availability === "in_stock" || input.leadTimeDays !== null, {
    path: ["leadTimeDays"],
    message: "Enter how many days it takes to have it ready",
  });
export type ProductInput = z.infer<typeof productInputSchema>;

/** PUT /v1/seller/products/:id: the fields plus the version the edit started from. */
export const productUpdateSchema = z.object({
  version: z.number().int().positive(),
  product: productInputSchema,
});
export type ProductUpdate = z.infer<typeof productUpdateSchema>;

/** POST /v1/seller/products/:id/status */
export const productStatusActionSchema = z.object({
  action: z.enum(["publish", "unpublish", "archive", "restore"]),
});
export type ProductStatusAction = z.infer<typeof productStatusActionSchema>["action"];

// ---------------------------------------------------------------- responses

export const productPhotoSchema = z.object({
  uploadId: z.string().uuid(),
  /** Public URL of the cleaned photo (metadata stripped, max 1600 px). */
  url: z.string().url(),
  /** Public URL of the 480 px thumbnail. */
  thumbUrl: z.string().url(),
});
export type ProductPhoto = z.infer<typeof productPhotoSchema>;

export const productSchema = z.object({
  id: z.string().uuid(),
  status: productStatusSchema,
  name: z.string(),
  category: categorySchema,
  partNumbers: z.array(z.string()),
  brand: z.string().nullable(),
  partSource: productPartSourceSchema.nullable(),
  condition: productConditionSchema,
  /** Null = price on request. */
  price: moneySchema.nullable(),
  unit: productUnitSchema,
  stockQuantity: z.number().int().nullable(),
  availability: productAvailabilitySchema,
  leadTimeDays: z.number().int().nullable(),
  description: z.string().nullable(),
  fitments: z.array(fitmentSchema),
  photos: z.array(productPhotoSchema),
  version: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
  publishedAt: z.string().nullable(),
});
export type Product = z.infer<typeof productSchema>;

export const productResponseSchema = z.object({ product: productSchema });
export type ProductResponse = z.infer<typeof productResponseSchema>;

/** One row of the seller's product list. */
export const productSummarySchema = z.object({
  id: z.string().uuid(),
  status: productStatusSchema,
  name: z.string(),
  partNumber: z.string().nullable(),
  categoryName: z.string(),
  price: moneySchema.nullable(),
  unit: productUnitSchema,
  stockQuantity: z.number().int().nullable(),
  coverThumbUrl: z.string().url().nullable(),
  updatedAt: z.string(),
});
export type ProductSummary = z.infer<typeof productSummarySchema>;

/** Tabs of the seller's product list (Figma "Seller – Products"). "all" = everything not archived. */
export const productListFilterSchema = z.enum(["all", "published", "draft", "out_of_stock", "archived"]);
export type ProductListFilter = z.infer<typeof productListFilterSchema>;

export const productListQuerySchema = z.object({
  filter: productListFilterSchema.default("all"),
  /** Search by name or part number. */
  q: z.string().trim().max(60).optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type ProductListQuery = z.infer<typeof productListQuerySchema>;

export const productListResponseSchema = z.object({
  items: z.array(productSummarySchema),
  nextCursor: z.string().nullable(),
  counts: z.record(productListFilterSchema, z.number().int()),
});
export type ProductListResponse = z.infer<typeof productListResponseSchema>;
