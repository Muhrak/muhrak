import { z } from "zod";
import { productAvailabilitySchema, productConditionSchema, productUnitSchema } from "./catalog";
import { moneySchema } from "./money-schema";

/**
 * Public part search (Day 8, the non-AI route): a buyer types a part
 * number, a part name or a machine and sees live products of VERIFIED
 * sellers, best match first. No sign-in needed; nothing private returned.
 */

export const PART_SEARCH_PAGE_SIZE = 20;

export const partSearchQuerySchema = z.object({
  /** Part number ("6020/F4"), part name ("breaker bushing") or machine ("Kobelco SK380"). */
  q: z.string().trim().min(2, "Type at least 2 characters").max(80),
  category: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).max(50).default(1),
});
export type PartSearchQuery = z.infer<typeof partSearchQuerySchema>;

/**
 * How a product matched (strongest first):
 * - exact: its main part number is the one searched
 * - alternative: one of its other part numbers (cross reference), or a part number starting with it
 * - fits: it fits the machine searched
 * - related: every word appears in its name, brand or machines
 */
export const partMatchSchema = z.enum(["exact", "alternative", "fits", "related"]);
export type PartMatch = z.infer<typeof partMatchSchema>;

export const PART_MATCH_LABELS: Record<PartMatch, string> = {
  exact: "Exact match",
  alternative: "Cross reference",
  fits: "Fits your machine",
  related: "Related part",
};

export const partSearchResultSchema = z.object({
  productId: z.string().uuid(),
  name: z.string(),
  partNumber: z.string().nullable(),
  brand: z.string().nullable(),
  condition: productConditionSchema,
  categoryName: z.string(),
  /** First machine it fits, e.g. "Kobelco SK380". */
  fitment: z.string().nullable(),
  /** Null = price on request. */
  price: moneySchema.nullable(),
  unit: productUnitSchema,
  stockQuantity: z.number().int().nullable(),
  availability: productAvailabilitySchema,
  leadTimeDays: z.number().int().nullable(),
  /** 480 px cover photo. */
  photoUrl: z.string().url().nullable(),
  match: partMatchSchema,
  seller: z.object({
    id: z.string().uuid(),
    companyName: z.string(),
    city: z.string(),
    countryName: z.string(),
  }),
});
export type PartSearchResult = z.infer<typeof partSearchResultSchema>;

export const partSearchResponseSchema = z.object({
  items: z.array(partSearchResultSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});
export type PartSearchResponse = z.infer<typeof partSearchResponseSchema>;
