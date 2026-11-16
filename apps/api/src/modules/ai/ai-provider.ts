/**
 * The AI vision model, behind a small interface so the provider can be
 * swapped (Google Gemini today, developer decision 16 Nov 2026) or faked in
 * tests. A provider only turns a photo into raw JSON: the service validates
 * it with Zod, maps it to our fields, and records the cost.
 */

export interface ModelUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface IdentifyPartInput {
  /** The cleaned photo (re-encoded, no metadata). */
  image: Uint8Array;
  mimeType: string;
  /** The categories the model may choose from. */
  categories: { slug: string; name: string }[];
}

export interface IdentifyPartResult {
  /** The model's answer, parsed from JSON but NOT validated yet. */
  output: unknown;
  usage: ModelUsage;
}

export interface AiProvider {
  /** e.g. "gemini" (stored with each identification). */
  readonly name: string;
  readonly model: string;
  identifyPart(input: IdentifyPartInput): Promise<IdentifyPartResult>;
}

/**
 * A failed model call. `retryable` for rate limits, server errors and
 * timeouts; not for a refused request or an unusable answer. `usage` is set
 * when the call was billed anyway (an answer came back but was unusable).
 */
export class AiProviderError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly usage?: ModelUsage,
  ) {
    super(message);
    this.name = "AiProviderError";
  }
}
