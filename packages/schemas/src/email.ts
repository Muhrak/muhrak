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
]);
export type EmailJob = z.infer<typeof emailJobSchema>;
