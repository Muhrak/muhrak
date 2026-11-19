import { AiProviderError, type AiProvider, type IdentifyPartInput, type ModelUsage } from "../ai-provider";
import { MAX_OUTPUT_TOKENS, SYSTEM_PROMPT, userPrompt } from "../prompt";

/**
 * Google Gemini (developer decision, 16 Nov 2026), called over its REST API
 * with the built-in fetch: no SDK dependency. The key goes in a header,
 * never in the URL (URLs end up in logs). Nothing from the request (photo,
 * key) is ever logged or put in an error message.
 */

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const TIMEOUT_MS = 90_000;

const confidence = { type: "STRING", enum: ["high", "medium", "low"] };
const field = (value: object) => ({
  type: "OBJECT",
  properties: { value, confidence },
  required: ["value", "confidence"],
});

/** The answer's shape, in Gemini's schema format. Must match aiModelOutputSchema. */
const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    isPart: { type: "BOOLEAN" },
    name: field({ type: "STRING", nullable: true }),
    brand: field({ type: "STRING", nullable: true }),
    partNumbers: field({ type: "ARRAY", items: { type: "STRING" } }),
    categorySlug: field({ type: "STRING", nullable: true }),
    fitments: field({
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { make: { type: "STRING" }, model: { type: "STRING" } },
        required: ["make", "model"],
      },
    }),
    description: field({ type: "STRING", nullable: true }),
  },
  required: ["isPart", "name", "brand", "partNumbers", "categorySlug", "fitments", "description"],
  propertyOrdering: ["isPart", "name", "brand", "partNumbers", "categorySlug", "fitments", "description"],
};

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
  error?: { message?: string; status?: string };
}

function usageOf(body: GeminiResponse): ModelUsage {
  const meta = body.usageMetadata ?? {};
  return {
    inputTokens: meta.promptTokenCount ?? 0,
    // Thinking tokens are billed as output.
    outputTokens: (meta.candidatesTokenCount ?? 0) + (meta.thoughtsTokenCount ?? 0),
  };
}

export function createGeminiProvider(options: { apiKey: string; model: string; fetchImpl?: typeof fetch }): AiProvider {
  const doFetch = options.fetchImpl ?? fetch;
  const url = `${ENDPOINT}/${encodeURIComponent(options.model)}:generateContent`;

  return {
    name: "gemini",
    model: options.model,
    async identifyPart(input: IdentifyPartInput) {
      const body = {
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [
          {
            role: "user",
            parts: [
              ...input.images.map((image) => ({ inlineData: { mimeType: image.mimeType, data: Buffer.from(image.bytes).toString("base64") } })),
              { text: userPrompt(input.categories, input.images.length) },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
          temperature: 0,
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          // Gemini 3+ thinks by default (slower, billed as output); reading a part needs little.
          ...(/^gemini-([3-9]|\d{2,})/.test(options.model) ? { thinkingConfig: { thinkingLevel: "low" } } : {}),
        },
      };

      let response: Response;
      try {
        response = await doFetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": options.apiKey },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch (error) {
        const timedOut = error instanceof Error && error.name === "TimeoutError";
        throw new AiProviderError(timedOut ? "Gemini timed out" : "Gemini could not be reached", true);
      }

      let json: GeminiResponse;
      try {
        json = (await response.json()) as GeminiResponse;
      } catch {
        throw new AiProviderError(`Gemini answered ${response.status} without JSON`, response.status >= 500);
      }

      if (!response.ok) {
        // 429 (rate or quota) and 5xx can pass; 400/401/403/404 (bad request, key, model) cannot.
        const retryable = response.status === 429 || response.status >= 500;
        const reason = `${json.error?.status ?? ""} ${json.error?.message ?? ""}`.trim().slice(0, 200);
        throw new AiProviderError(`Gemini answered ${response.status}${reason ? `: ${reason}` : ""}`, retryable);
      }

      const usage = usageOf(json);
      if (json.promptFeedback?.blockReason) {
        throw new AiProviderError(`Gemini blocked the photo (${json.promptFeedback.blockReason})`, false, usage);
      }
      const candidate = json.candidates?.[0];
      const text = candidate?.content?.parts
        ?.filter((part) => !part.thought && typeof part.text === "string")
        .map((part) => part.text)
        .join("");
      if (!text) {
        throw new AiProviderError(`Gemini returned no answer (${candidate?.finishReason ?? "no candidate"})`, false, usage);
      }
      if (candidate?.finishReason && candidate.finishReason !== "STOP") {
        throw new AiProviderError(`Gemini stopped early (${candidate.finishReason})`, false, usage);
      }
      try {
        return { output: JSON.parse(text) as unknown, usage };
      } catch {
        throw new AiProviderError("Gemini returned invalid JSON", false, usage);
      }
    },
  };
}
