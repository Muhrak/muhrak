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
]);
export type EmailJob = z.infer<typeof emailJobSchema>;
