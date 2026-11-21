import { z } from "zod";

/**
 * Payload of a "send-email" job. The API adds the job; the worker validates
 * it with this schema, renders the template and calls the email provider.
 * One entry per template, so a template's data is checked field by field.
 */
export const EMAIL_QUEUE = "email";

export const emailJobSchema = z.discriminatedUnion("template", [
  z.object({
    template: z.literal("password-reset"),
    to: z.string().email(),
    data: z.object({
      fullName: z.string(),
      resetUrl: z.string().url(),
      expiresInMinutes: z.number().int().positive(),
    }),
  }),
  z.object({
    template: z.literal("verify-email"),
    to: z.string().email(),
    data: z.object({
      fullName: z.string(),
      code: z.string().regex(/^\d{6}$/),
      expiresInMinutes: z.number().int().positive(),
    }),
  }),
  z.object({
    /** Someone signed up with an email that already has an account. */
    template: z.literal("account-exists"),
    to: z.string().email(),
    data: z.object({
      fullName: z.string(),
      loginUrl: z.string().url(),
      resetUrl: z.string().url(),
    }),
  }),
  z.object({
    template: z.literal("seller-verified"),
    to: z.string().email(),
    data: z.object({
      fullName: z.string(),
      companyName: z.string(),
      dashboardUrl: z.string().url(),
    }),
  }),
  z.object({
    template: z.literal("seller-changes-needed"),
    to: z.string().email(),
    data: z.object({
      fullName: z.string(),
      companyName: z.string(),
      reason: z.string().nullable(),
      /** Rejected documents with the reason for each. */
      documents: z.array(z.object({ label: z.string(), reason: z.string() })),
      verificationUrl: z.string().url(),
    }),
  }),
  z.object({
    /** A buyer sent the seller a quote request. */
    template: z.literal("rfq-new"),
    to: z.string().email(),
    data: z.object({
      fullName: z.string(),
      reference: z.string(),
      buyerName: z.string(),
      partName: z.string(),
      partNumber: z.string().nullable(),
      quantity: z.string(),
      neededBy: z.string(),
      deliverTo: z.string(),
      inboxUrl: z.string().url(),
    }),
  }),
  z.object({
    /** A seller sent the buyer a quotation (Day 11). */
    template: z.literal("quote-new"),
    to: z.string().email(),
    data: z.object({
      fullName: z.string(),
      quoteReference: z.string(),
      rfqReference: z.string(),
      sellerName: z.string(),
      partName: z.string(),
      itemCount: z.number().int().positive(),
      total: z.string(),
      deliveryDays: z.number().int().positive(),
      validUntil: z.string(),
      revised: z.boolean(),
      requestUrl: z.string().url(),
    }),
  }),
  z.object({
    /** An admin decided on a verified seller's updates (21 Nov 2026). */
    template: z.literal("seller-update-reviewed"),
    to: z.string().email(),
    data: z.object({
      fullName: z.string(),
      companyName: z.string(),
      approved: z.array(z.string()),
      rejected: z.array(z.object({ label: z.string(), reason: z.string() })),
      verificationUrl: z.string().url(),
    }),
  }),
]);
export type EmailJob = z.infer<typeof emailJobSchema>;
