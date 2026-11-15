import { z } from "zod";
import { productUnitSchema } from "./catalog";
import { gccCountrySchema } from "./seller";

/**
 * Quote requests (RFQs), Day 9. A buyer asks ONE seller for a price on one
 * of that seller's live products (developer decision, 15 Nov 2026: one
 * seller per request, as in Figma "Request quote – Sent v2"). To ask three
 * sellers, the buyer sends three requests.
 *
 * Lifecycle (transitions in rfq.service.ts, one place):
 *   open -> quoted    (seller sends a quotation; Day 11)
 *   open -> declined  (seller)
 *   open -> cancelled (buyer)
 *   open -> expired   (no answer within RFQ_EXPIRY_DAYS)
 */

/** An unanswered request closes by itself after this many days (developer decision, 15 Nov 2026). */
export const RFQ_EXPIRY_DAYS = 7;

export const RFQ_LIMITS = {
  maxQuantity: 100_000,
  /** Open requests one buyer can have at a time (abuse cap). */
  maxOpenPerBuyer: 50,
} as const;

export const rfqStatusSchema = z.enum(["open", "quoted", "declined", "cancelled", "expired"]);
export type RfqStatus = z.infer<typeof rfqStatusSchema>;

export const RFQ_STATUS_LABELS: Record<RfqStatus, string> = {
  open: "Waiting for reply",
  quoted: "Quoted",
  declined: "Declined",
  cancelled: "Cancelled",
  expired: "Expired",
};

export const rfqNeededBySchema = z.enum(["asap", "one_week", "two_weeks", "one_month", "flexible"]);
export type RfqNeededBy = z.infer<typeof rfqNeededBySchema>;

export const RFQ_NEEDED_BY_LABELS: Record<RfqNeededBy, string> = {
  asap: "As soon as possible",
  one_week: "Within 1 week",
  two_weeks: "Within 2 weeks",
  one_month: "Within 1 month",
  flexible: "No rush",
};

/** Plain single-line text: no control characters (they break emails, logs and layouts). */
const line = (min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .regex(/^[^\p{Cc}]*$/u, "Use plain text only");

const optionalLine = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .regex(/^[^\p{Cc}]*$/u, "Use plain text only")
    .nullable()
    .transform((value) => (value ? value : null));

/** Multi-line text: newlines allowed, other control characters not. */
const optionalParagraph = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .regex(/^(?:[^\p{Cc}]|\r|\n)*$/u, "Use plain text only")
    .nullable()
    .transform((value) => (value ? value : null));

/**
 * POST /v1/buyer/rfqs. The seller, the unit and the product are taken from
 * the product on the server, never from the client. `requestKey` is made by
 * the browser when the form opens: sending the same form twice (double
 * click, retry after a lost answer) returns the first request instead of
 * creating a second one.
 */
export const rfqCreateSchema = z.object({
  productId: z.string().uuid(),
  requestKey: z.string().uuid(),
  /** What the buyer needs, in their words (prefilled from the product). */
  partName: line(2, 120),
  partNumber: optionalLine(40),
  /** Machine it is for, e.g. "Kobelco SK380". */
  fitment: optionalLine(100),
  quantity: z.number().int().min(1, "At least 1").max(RFQ_LIMITS.maxQuantity, "Too many"),
  neededBy: rfqNeededBySchema,
  deliveryCountry: gccCountrySchema,
  deliveryCity: line(2, 60),
  note: optionalParagraph(1000),
});
export type RfqCreateInput = z.infer<typeof rfqCreateSchema>;

/** POST /v1/seller/rfqs/:id/decline */
export const rfqDeclineSchema = z.object({
  /** Optional: shown to the buyer. */
  reason: optionalLine(300).default(null),
});
export type RfqDeclineInput = z.infer<typeof rfqDeclineSchema>;

/** List tabs. Buyer: All / Open / Quoted / Closed. Seller: All / New (= open) / Replied (= quoted) / Closed. */
export const rfqListFilterSchema = z.enum(["all", "open", "quoted", "closed"]);
export type RfqListFilter = z.infer<typeof rfqListFilterSchema>;

export const rfqListQuerySchema = z.object({
  filter: rfqListFilterSchema.default("all"),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type RfqListQuery = z.infer<typeof rfqListQuerySchema>;

const rfqBaseSchema = z.object({
  id: z.string().uuid(),
  /** Human reference, e.g. "RQ-1001". */
  reference: z.string(),
  status: rfqStatusSchema,
  partName: z.string(),
  partNumber: z.string().nullable(),
  fitment: z.string().nullable(),
  quantity: z.number().int(),
  unit: productUnitSchema,
  neededBy: rfqNeededBySchema,
  deliveryCity: z.string(),
  deliveryCountryName: z.string(),
  note: z.string().nullable(),
  declineReason: z.string().nullable(),
  product: z.object({
    id: z.string().uuid(),
    name: z.string(),
    photoUrl: z.string().url().nullable(),
  }),
  createdAt: z.string(),
  expiresAt: z.string(),
  closedAt: z.string().nullable(),
});

/** What the buyer sees: the seller's public name and place, never contact details. */
export const buyerRfqSchema = rfqBaseSchema.extend({
  seller: z.object({
    id: z.string().uuid(),
    companyName: z.string(),
    city: z.string(),
    countryName: z.string(),
  }),
});
export type BuyerRfq = z.infer<typeof buyerRfqSchema>;

/** What the seller sees: the buyer's name only (no email or phone; they deal through Muhrak). */
export const sellerRfqSchema = rfqBaseSchema.extend({
  buyer: z.object({ name: z.string() }),
  /** False until the seller first opens it (the unread dot). */
  seen: z.boolean(),
});
export type SellerRfq = z.infer<typeof sellerRfqSchema>;

export const rfqCountsSchema = z.record(rfqListFilterSchema, z.number().int());

export const buyerRfqListResponseSchema = z.object({
  items: z.array(buyerRfqSchema),
  nextCursor: z.string().nullable(),
  counts: rfqCountsSchema,
});
export type BuyerRfqListResponse = z.infer<typeof buyerRfqListResponseSchema>;

export const sellerRfqListResponseSchema = z.object({
  items: z.array(sellerRfqSchema),
  nextCursor: z.string().nullable(),
  counts: rfqCountsSchema,
  /** Requests the seller has not opened yet (sidebar badge). */
  unseen: z.number().int(),
});
export type SellerRfqListResponse = z.infer<typeof sellerRfqListResponseSchema>;

export const buyerRfqResponseSchema = z.object({ rfq: buyerRfqSchema });
export type BuyerRfqResponse = z.infer<typeof buyerRfqResponseSchema>;

export const sellerRfqResponseSchema = z.object({ rfq: sellerRfqSchema });
export type SellerRfqResponse = z.infer<typeof sellerRfqResponseSchema>;
