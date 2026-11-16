import { z } from "zod";
import { normalizePartNumber, PRODUCT_LIMITS } from "./catalog";

/**
 * AI part identification (Day 6, 16 Nov 2026). A photo goes in; suggested
 * product fields come out, each with a confidence level. The model only
 * FILLS fields: the seller (or buyer) checks and edits them, and nothing
 * is saved or published from AI output on its own.
 */

/** Background job queue for AI calls (src/worker). */
export const AI_QUEUE = "ai";

export const aiConfidenceSchema = z.enum(["high", "medium", "low"]);
export type AiConfidence = z.infer<typeof aiConfidenceSchema>;

// ---------------------------------------------------------------- model output

/**
 * Text from the model is cut to the product form's limits instead of
 * failing the whole answer: a long description is still useful.
 */
const clipped = (max: number) =>
  z
    .string()
    .nullable()
    .transform((value) => {
      const text = value?.replace(/\s+/g, " ").trim().slice(0, max) ?? "";
      return text.length > 0 ? text : null;
    });

const field = <T extends z.ZodTypeAny>(value: T) => z.object({ value, confidence: aiConfidenceSchema });

/**
 * Exactly what the model must return (the provider also sends this shape
 * as the response schema). Anything else is refused: the identification
 * fails and the user fills in the form by hand.
 */
export const aiModelOutputSchema = z.object({
  /** False when the photo does not show a vehicle or machine part; the other fields are then ignored. */
  isPart: z.boolean(),
  name: field(clipped(120)),
  brand: field(clipped(60)),
  /** Part numbers readable on the part or its label, main one first. */
  partNumbers: field(
    z
      .array(z.string())
      .max(20)
      .transform((values) => {
        const seen = new Set<string>();
        const result: string[] = [];
        for (const raw of values) {
          const value = raw.trim().slice(0, 40);
          const key = normalizePartNumber(value);
          if (!key || seen.has(key)) continue;
          seen.add(key);
          result.push(value);
        }
        return result.slice(0, PRODUCT_LIMITS.partNumbers);
      }),
  ),
  /** One of the category slugs given in the prompt, or null. */
  categorySlug: field(clipped(60)),
  fitments: field(
    z
      .array(z.object({ make: z.string(), model: z.string() }))
      .max(20)
      .transform((values) =>
        values
          .map((item) => ({ make: item.make.trim().slice(0, 40), model: item.model.trim().slice(0, 60) }))
          .filter((item) => item.make && item.model)
          .slice(0, PRODUCT_LIMITS.fitments),
      ),
  ),
  description: field(clipped(1000)),
});
export type AiModelOutput = z.infer<typeof aiModelOutputSchema>;

// ---------------------------------------------------------------- API

export const createAiIdentificationSchema = z.object({
  /** A ready photo the caller uploaded (purpose product_photo). */
  uploadId: z.string().uuid(),
});
export type CreateAiIdentificationInput = z.infer<typeof createAiIdentificationSchema>;

export const aiIdentificationStatusSchema = z.enum(["pending", "running", "done", "failed"]);
export type AiIdentificationStatus = z.infer<typeof aiIdentificationStatusSchema>;

/** What the form is pre-filled with. A field with value null was not recognised. */
export const aiSuggestionSchema = z.object({
  isPart: z.boolean(),
  name: field(z.string().nullable()),
  brand: field(z.string().nullable()),
  partNumbers: field(z.array(z.string())),
  category: field(z.object({ id: z.string().uuid(), name: z.string() }).nullable()),
  fitments: field(z.array(z.object({ make: z.string(), model: z.string() }))),
  description: field(z.string().nullable()),
});
export type AiSuggestion = z.infer<typeof aiSuggestionSchema>;

export const aiIdentificationSchema = z.object({
  id: z.string().uuid(),
  uploadId: z.string().uuid(),
  /** pending/running: ask again shortly. failed: show the manual form. */
  status: aiIdentificationStatusSchema,
  suggestion: aiSuggestionSchema.nullable(),
  createdAt: z.string(),
});
export type AiIdentification = z.infer<typeof aiIdentificationSchema>;

export const aiIdentificationResponseSchema = z.object({ identification: aiIdentificationSchema });
export type AiIdentificationResponse = z.infer<typeof aiIdentificationResponseSchema>;

/** Whether to offer "fill from photo" to the signed-in user right now. */
export const aiStatusResponseSchema = z.object({ available: z.boolean() });
export type AiStatusResponse = z.infer<typeof aiStatusResponseSchema>;

/** Error code when AI cannot be used right now (off, budget reached, daily limit): show the manual form. */
export const AI_UNAVAILABLE_CODE = "ai_unavailable";
