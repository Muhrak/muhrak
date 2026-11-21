import { z } from "zod";
import { priceInputSchema } from "./catalog";
import { moneySchema } from "./money-schema";

/**
 * Quotations (Day 11, 21 Nov 2026). The seller of a quote request answers
 * with a priced quotation, laid out like the developer's reference
 * (refs/seller quotation .pdf): several items (part number + description,
 * quantity, rate, amount), shipping, VAT, total, terms and notes. The buyer
 * sees it as a card in the chat, on their request, by email, and as a PDF.
 *
 * Developer decisions (21 Nov 2026):
 * - Several items per quotation (the first is filled in from the request).
 * - VAT 5% of (items + shipping), only when the seller's company is VAT
 *   registered; computed by the server, never typed by the seller.
 * - The PDF shows Muhrak's contact details, never the buyer's or the
 *   seller's own email or phone (deals and payment stay on Muhrak).
 * - One ACTIVE quotation per request: a revised quotation replaces the
 *   previous one (kept as "superseded"); the seller can withdraw it.
 *
 * Every amount is computed on the server from the item prices and
 * quantities; the client never sends a subtotal, VAT or total.
 *
 * Lifecycle (QUOTE_TRANSITIONS in quotation.service.ts, one place):
 *   active -> withdrawn   (seller)
 *   active -> superseded  (seller sends a revised quotation)
 *   active -> expired     (valid-until date passed)
 *   active -> accepted    (buyer; Day 12, with the order)
 */

export const QUOTE_LIMITS = {
  maxItems: 50,
  maxQuantity: 100_000,
  /** Days a quotation can stay valid (default 15, as in the reference). */
  minValidDays: 1,
  maxValidDays: 30,
  defaultValidDays: 15,
  /** Delivery time the seller promises, in days after payment. */
  maxDeliveryDays: 365,
  /** Largest total of one quotation: 10,000,000.000 OMR (keeps every sum a safe integer). */
  maxTotalMinor: 10_000_000_000,
  /** Quotations (including revisions) one request can have: an abuse cap. */
  maxPerRfq: 20,
} as const;

/** VAT rate in basis points (500 = 5%), applied only for VAT-registered sellers (developer decision, 21 Nov 2026). */
export const QUOTE_VAT_RATE_BP = 500;

export const quoteStatusSchema = z.enum(["active", "withdrawn", "superseded", "expired"]);
export type QuoteStatus = z.infer<typeof quoteStatusSchema>;

export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  active: "Valid",
  withdrawn: "Withdrawn",
  superseded: "Replaced by a newer quote",
  expired: "Expired",
};

/** Plain single-line text: no control characters. */
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
    .transform((value) => (value ? value.replace(/\r\n?/g, "\n") : null));

export const quoteItemInputSchema = z.object({
  /** e.g. "B3206050" or "007040/B3007040". */
  partNumber: optionalLine(60),
  /** e.g. "PISTON". */
  description: line(2, 120),
  /** Extra lines under the item, e.g. a kit's contents ("Set", "270801-00418 SIDE DAMPER-A 4pcs"). */
  details: optionalParagraph(600),
  quantity: z.number().int().min(1, "At least 1").max(QUOTE_LIMITS.maxQuantity, "Too many"),
  /** Rate per unit in OMR, as typed ("438.3"); converted to baisa on the server. */
  unitPrice: priceInputSchema.refine((value) => /[1-9]/.test(value), "Enter a price above 0"),
});
export type QuoteItemInput = z.infer<typeof quoteItemInputSchema>;

/**
 * POST /v1/seller/quotes. `quoteKey` is made by the browser when the form
 * opens: sending the same form twice returns the first quotation.
 */
export const quoteCreateSchema = z.object({
  rfqId: z.string().uuid(),
  quoteKey: z.string().uuid(),
  items: z.array(quoteItemInputSchema).min(1, "Add at least one item").max(QUOTE_LIMITS.maxItems, `At most ${QUOTE_LIMITS.maxItems} items`),
  /** Shipping in OMR; "0" for free shipping. */
  shipping: priceInputSchema,
  deliveryDays: z.number().int().min(1, "At least 1 day").max(QUOTE_LIMITS.maxDeliveryDays, "At most 365 days"),
  validDays: z.number().int().min(QUOTE_LIMITS.minValidDays).max(QUOTE_LIMITS.maxValidDays, `At most ${QUOTE_LIMITS.maxValidDays} days`),
  /** The seller's own terms, one per line (added after Muhrak's standard terms). */
  terms: optionalParagraph(1000),
  /** "Additional notes" on the quotation. */
  notes: optionalParagraph(1000),
});
export type QuoteCreateInput = z.infer<typeof quoteCreateSchema>;

/** GET /v1/{buyer|seller}/quotes?rfqId=…: the quotations of one request, newest first. */
export const quoteListQuerySchema = z.object({
  rfqId: z.string().uuid(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(20).default(20),
});
export type QuoteListQuery = z.infer<typeof quoteListQuerySchema>;

export const quoteItemSchema = z.object({
  position: z.number().int(),
  partNumber: z.string().nullable(),
  description: z.string(),
  details: z.string().nullable(),
  quantity: z.number().int(),
  unitPrice: moneySchema,
  amount: moneySchema,
});
export type QuoteItem = z.infer<typeof quoteItemSchema>;

/**
 * A quotation, the same for its buyer and its seller (both are on the
 * document). Names and places are a copy taken when it was sent, so the
 * document never changes afterwards. No email or phone of either side.
 */
export const quoteSchema = z.object({
  id: z.string().uuid(),
  /** Human reference, e.g. "QT-1001". */
  reference: z.string(),
  rfqId: z.string().uuid(),
  rfqReference: z.string(),
  status: quoteStatusSchema,
  items: z.array(quoteItemSchema),
  subtotal: moneySchema,
  shipping: moneySchema,
  /** Basis points (500 = 5%); 0 when the seller is not VAT registered. */
  vatRateBp: z.number().int(),
  vat: moneySchema,
  total: moneySchema,
  deliveryDays: z.number().int(),
  validDays: z.number().int(),
  validUntil: z.string(),
  terms: z.string().nullable(),
  notes: z.string().nullable(),
  seller: z.object({ id: z.string().uuid(), companyName: z.string(), city: z.string(), countryName: z.string() }),
  buyer: z.object({ name: z.string(), deliveryCity: z.string(), deliveryCountryName: z.string() }),
  createdAt: z.string(),
  closedAt: z.string().nullable(),
});
export type Quote = z.infer<typeof quoteSchema>;

export const quoteResponseSchema = z.object({ quote: quoteSchema });
export type QuoteResponse = z.infer<typeof quoteResponseSchema>;

export const quoteListResponseSchema = z.object({
  items: z.array(quoteSchema),
  nextCursor: z.string().nullable(),
});
export type QuoteListResponse = z.infer<typeof quoteListResponseSchema>;
