import { z } from "zod";
import { publicUserSchema } from "./auth";
import {
  documentStatusSchema,
  documentTypeSchema,
  gccCountrySchema,
  sellerDocumentSchema,
  sellerProfileSchema,
  verificationSchema,
  verificationStatusSchema,
} from "./seller";

/**
 * Admin console: seller verification queue and review (Day 4).
 * Every endpoint needs an admin session; every decision is audit logged.
 */

/** GET /v1/admin/sellers?status=&cursor=&limit= */
export const adminSellerListQuerySchema = z.object({
  status: verificationStatusSchema.optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type AdminSellerListQuery = z.infer<typeof adminSellerListQuerySchema>;

export const adminSellerSummarySchema = z.object({
  userId: z.string().uuid(),
  email: z.string(),
  fullName: z.string(),
  companyName: z.string(),
  country: gccCountrySchema,
  city: z.string(),
  status: verificationStatusSchema,
  /** Required documents the seller has uploaded, e.g. ["commercial_registration", "owner_id"]. */
  documents: z.array(documentTypeSchema),
  submittedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type AdminSellerSummary = z.infer<typeof adminSellerSummarySchema>;

export const adminSellerListSchema = z.object({
  items: z.array(adminSellerSummarySchema),
  /** Pass back as `cursor` for the next page; null on the last page. */
  nextCursor: z.string().nullable(),
});
export type AdminSellerList = z.infer<typeof adminSellerListSchema>;

/** GET /v1/admin/sellers/stats */
export const adminSellerStatsSchema = z.object({
  total: z.number().int(),
  draft: z.number().int(),
  pending: z.number().int(),
  approved: z.number().int(),
  rejected: z.number().int(),
  /** When the oldest seller in the queue submitted, or null if the queue is empty. */
  oldestPendingAt: z.string().nullable(),
});
export type AdminSellerStats = z.infer<typeof adminSellerStatsSchema>;

export const verificationEventSchema = z.object({
  fromStatus: verificationStatusSchema,
  toStatus: verificationStatusSchema,
  /** "seller" or "admin": who made the change. */
  actorRole: z.enum(["seller", "admin"]),
  actorName: z.string(),
  reason: z.string().nullable(),
  createdAt: z.string(),
});
export type VerificationEvent = z.infer<typeof verificationEventSchema>;

/** GET /v1/admin/sellers/:userId */
export const adminSellerDetailSchema = z.object({
  user: publicUserSchema,
  profile: sellerProfileSchema,
  documents: z.array(sellerDocumentSchema),
  verification: verificationSchema,
  history: z.array(verificationEventSchema),
});
export type AdminSellerDetail = z.infer<typeof adminSellerDetailSchema>;

const reasonText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .regex(/^(?:[^\p{Cc}]|\r|\n)*$/u, "Use plain text only");

/**
 * POST /v1/admin/sellers/:userId/review. The admin decides on every
 * current document; the API refuses the review if the documents changed
 * since the page was loaded.
 */
export const reviewSellerSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  /** Shown to the seller. Required when rejecting. */
  reason: reasonText(500).optional().transform((value) => value || null),
  documents: z
    .array(
      z.object({
        id: z.string().uuid(),
        status: documentStatusSchema.exclude(["pending"]),
        /** Required when the document is rejected. Shown to the seller. */
        reason: reasonText(300).optional().transform((value) => value || null),
      }),
    )
    .min(1)
    .max(10),
});
export type ReviewSellerInput = z.input<typeof reviewSellerSchema>;
export type ReviewSellerData = z.output<typeof reviewSellerSchema>;
