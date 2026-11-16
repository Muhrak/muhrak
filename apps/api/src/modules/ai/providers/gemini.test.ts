import { describe, expect, it, vi } from "vitest";
import { AiProviderError } from "../ai-provider";
import { createGeminiProvider } from "./gemini";

const KEY = "test-gemini-key-0123456789abcdef";
const input = { image: new Uint8Array([1, 2, 3]), mimeType: "image/webp", categories: [{ slug: "filters", name: "Filters" }] };

function reply(status: number, body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

const answer = (text: string, finishReason = "STOP") => ({
  candidates: [{ content: { parts: [{ text: "thinking...", thought: true }, { text }] }, finishReason }],
  usageMetadata: { promptTokenCount: 1200, candidatesTokenCount: 150, thoughtsTokenCount: 300 },
});

describe("Gemini provider", () => {
  it("sends the key in a header (never the URL) and parses the JSON answer", async () => {
    const fetchImpl = reply(200, answer('{"isPart":true}'));
    const provider = createGeminiProvider({ apiKey: KEY, model: "gemini-3.8-flash", fetchImpl });
    const result = await provider.identifyPart(input);
    expect(result).toEqual({ output: { isPart: true }, usage: { inputTokens: 1200, outputTokens: 450 } });

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent");
    expect(url).not.toContain(KEY);
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe(KEY);
    const body = JSON.parse(init.body as string);
    expect(body.contents[0].parts[0].inlineData).toEqual({ mimeType: "image/webp", data: "AQID" });
    expect(body.contents[0].parts[1].text).toContain("- filters: Filters");
    expect(body.generationConfig).toMatchObject({ responseMimeType: "application/json", temperature: 0, thinkingConfig: { thinkingLevel: "low" } });
  });

  it("retries rate limits and server errors, not bad requests", async () => {
    const limited = createGeminiProvider({ apiKey: KEY, model: "m", fetchImpl: reply(429, { error: { status: "RESOURCE_EXHAUSTED" } }) });
    await expect(limited.identifyPart(input)).rejects.toMatchObject({ retryable: true });
    const down = createGeminiProvider({ apiKey: KEY, model: "m", fetchImpl: reply(503, {}) });
    await expect(down.identifyPart(input)).rejects.toMatchObject({ retryable: true });
    const bad = createGeminiProvider({ apiKey: KEY, model: "m", fetchImpl: reply(400, { error: { message: "API key not valid" } }) });
    await expect(bad.identifyPart(input)).rejects.toMatchObject({ retryable: false });
  });

  it("never puts the key in an error message", async () => {
    const provider = createGeminiProvider({ apiKey: KEY, model: "m", fetchImpl: reply(403, { error: { message: "denied" } }) });
    const error = (await provider.identifyPart(input).catch((e: unknown) => e)) as Error;
    expect(error.message).not.toContain(KEY);
  });

  it("treats a network failure as retryable", async () => {
    const provider = createGeminiProvider({ apiKey: KEY, model: "m", fetchImpl: vi.fn(async () => Promise.reject(new TypeError("fetch failed"))) });
    await expect(provider.identifyPart(input)).rejects.toMatchObject({ retryable: true });
  });

  it("fails without retry, with the billed tokens, on a blocked, cut-off or non-JSON answer", async () => {
    for (const body of [
      { promptFeedback: { blockReason: "SAFETY" }, usageMetadata: { promptTokenCount: 5 } },
      answer('{"isPart":', "MAX_TOKENS"),
      answer("not json"),
      { candidates: [], usageMetadata: { promptTokenCount: 5 } },
    ]) {
      const provider = createGeminiProvider({ apiKey: KEY, model: "m", fetchImpl: reply(200, body) });
      const error = await provider.identifyPart(input).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(AiProviderError);
      expect(error).toMatchObject({ retryable: false });
      expect((error as AiProviderError).usage?.inputTokens).toBeGreaterThan(0);
    }
  });
});
