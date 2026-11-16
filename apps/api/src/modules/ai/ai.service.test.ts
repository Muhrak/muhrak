import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AiIdentificationRow } from "../../db/schema";

const SELLER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const UPLOAD = "33333333-3333-4333-8333-333333333333";
const IDENT = "44444444-4444-4444-8444-444444444444";
const CAT = "55555555-5555-4555-8555-555555555555";

vi.hoisted(() => {
  Object.assign(process.env, {
    DATABASE_URL: "postgres://test:test@localhost:5432/test",
    JWT_SECRET: "test-secret-that-is-at-least-32-characters-long",
    AI_ENABLED: "true",
    GEMINI_TIER: "paid",
    AI_MONTHLY_BUDGET_USD: "5",
    GEMINI_INPUT_USD_PER_MTOK: "0.30",
    GEMINI_OUTPUT_USD_PER_MTOK: "2.50",
    AI_DAILY_LIMIT_PER_USER: "3",
  });
});

vi.mock("./ai.repository", () => ({
  withBudgetLock: vi.fn(async (work: (tx: unknown) => unknown) => work({ tx: true })),
  findById: vi.fn(),
  findByUpload: vi.fn(),
  countByUserSince: vi.fn(),
  spendSince: vi.fn(),
  insert: vi.fn(),
  markRunning: vi.fn(),
  addUsage: vi.fn(),
  finish: vi.fn(),
}));
vi.mock("../upload", () => ({ getOwnedPhotoForAi: vi.fn(), readPhotoForAi: vi.fn() }));
vi.mock("../catalog", () => ({ listCategories: vi.fn() }));
vi.mock("../../shared/jobs", () => ({ enqueueJob: vi.fn(async () => true), wakeWorker: vi.fn() }));

const repo = await import("./ai.repository");
const upload = await import("../upload");
const catalog = await import("../catalog");
const jobs = await import("../../shared/jobs");
const { env } = await import("../../config/env");
const { AiProviderError } = await import("./ai-provider");
const service = await import("./ai.service");
const { notFound } = await import("../../shared/errors");

const now = new Date("2026-11-16T10:00:00Z");

const provider = { name: "fake", model: "fake-1", identifyPart: vi.fn() };

function row(overrides: Partial<AiIdentificationRow> = {}): AiIdentificationRow {
  return {
    id: IDENT,
    userId: SELLER,
    uploadId: UPLOAD,
    status: "pending",
    result: null,
    error: null,
    provider: null,
    model: null,
    inputTokens: 0,
    outputTokens: 0,
    costMicroUsd: 0,
    durationMs: null,
    createdAt: now,
    finishedAt: null,
    ...overrides,
  };
}

const goodOutput = {
  isPart: true,
  name: { value: "  Hydraulic   oil filter ", confidence: "high" },
  brand: { value: "Fleetguard", confidence: "high" },
  partNumbers: { value: ["HF6553", "hf-6553", "", "P165569"], confidence: "high" },
  categorySlug: { value: "filters", confidence: "medium" },
  fitments: { value: [{ make: "Kobelco", model: "SK380" }, { make: "", model: "x" }], confidence: "low" },
  description: { value: "Spin-on hydraulic filter.", confidence: "medium" },
};

beforeEach(() => {
  vi.clearAllMocks();
  env.AI_ENABLED = true;
  env.GEMINI_TIER = "paid";
  env.AI_TEST_USER_IDS = [];
  service.setAiProvider(provider);
  vi.mocked(upload.getOwnedPhotoForAi).mockResolvedValue({} as never);
  vi.mocked(repo.findByUpload).mockResolvedValue(undefined);
  vi.mocked(repo.countByUserSince).mockResolvedValue(0);
  vi.mocked(repo.spendSince).mockResolvedValue({ spentMicroUsd: 0, unfinished: 0 });
  vi.mocked(repo.insert).mockResolvedValue(row());
  vi.mocked(repo.markRunning).mockResolvedValue(row({ status: "running" }));
  vi.mocked(upload.readPhotoForAi).mockResolvedValue({ bytes: new Uint8Array([1, 2, 3]), contentType: "image/webp" });
  vi.mocked(catalog.listCategories).mockResolvedValue([{ id: CAT, slug: "filters", name: "Filters" }] as never);
});

describe("costs", () => {
  it("prices tokens in whole micro dollars, rounding up", () => {
    // 1000 * 0.30 = 300 µ$; 500 * 2.50 = 1250 µ$
    expect(service.costMicroUsd({ inputTokens: 1000, outputTokens: 500 })).toBe(1550);
    // 0.3 rounds up to 1, 2.5 rounds up to 3: never under-count spend.
    expect(service.costMicroUsd({ inputTokens: 1, outputTokens: 1 })).toBe(4);
  });
});

describe("requestIdentification", () => {
  it("records the request and queues the job in the same transaction", async () => {
    const result = await service.requestIdentification(SELLER, UPLOAD, now);
    expect(result).toMatchObject({ id: IDENT, status: "pending", suggestion: null });
    expect(upload.getOwnedPhotoForAi).toHaveBeenCalledWith(SELLER, UPLOAD);
    expect(jobs.enqueueJob).toHaveBeenCalledWith("ai", "identify-part", { identificationId: IDENT }, expect.objectContaining({ dedupeKey: `ai:${IDENT}`, tx: { tx: true } }));
    expect(jobs.wakeWorker).toHaveBeenCalled();
  });

  it("is refused when AI is switched off, before touching the photo", async () => {
    env.AI_ENABLED = false;
    await expect(service.requestIdentification(SELLER, UPLOAD, now)).rejects.toMatchObject({ status: 503, code: "ai_unavailable" });
    expect(upload.getOwnedPhotoForAi).not.toHaveBeenCalled();
    expect(repo.insert).not.toHaveBeenCalled();
  });

  it("is refused without a provider key", async () => {
    service.setAiProvider(null);
    await expect(service.requestIdentification(SELLER, UPLOAD, now)).rejects.toMatchObject({ code: "ai_unavailable" });
  });

  it("on the free tier, works only for listed test accounts", async () => {
    env.GEMINI_TIER = "free";
    env.AI_TEST_USER_IDS = [OTHER];
    await expect(service.requestIdentification(SELLER, UPLOAD, now)).rejects.toMatchObject({ code: "ai_unavailable" });
    expect(repo.insert).not.toHaveBeenCalled();
    env.AI_TEST_USER_IDS = [SELLER];
    await expect(service.requestIdentification(SELLER, UPLOAD, now)).resolves.toMatchObject({ id: IDENT });
  });

  it("refuses someone else's photo (404 from the upload module) and records nothing", async () => {
    vi.mocked(upload.getOwnedPhotoForAi).mockRejectedValue(notFound("Photo not found"));
    await expect(service.requestIdentification(OTHER, UPLOAD, now)).rejects.toMatchObject({ status: 404 });
    expect(repo.insert).not.toHaveBeenCalled();
    expect(jobs.enqueueJob).not.toHaveBeenCalled();
  });

  it("returns the existing identification on a double submit, without paying again", async () => {
    vi.mocked(repo.findByUpload).mockResolvedValue(row({ status: "running" }));
    await expect(service.requestIdentification(SELLER, UPLOAD, now)).resolves.toMatchObject({ id: IDENT, status: "running" });
    expect(repo.insert).not.toHaveBeenCalled();
    expect(jobs.enqueueJob).not.toHaveBeenCalled();
  });

  it("returns the winner when a parallel request inserted first (checked inside the lock)", async () => {
    vi.mocked(repo.findByUpload).mockResolvedValueOnce(undefined).mockResolvedValueOnce(row());
    await service.requestIdentification(SELLER, UPLOAD, now);
    expect(repo.insert).not.toHaveBeenCalled();
  });

  it("enforces the per-user daily limit inside the lock", async () => {
    vi.mocked(repo.countByUserSince).mockResolvedValue(3);
    await expect(service.requestIdentification(SELLER, UPLOAD, now)).rejects.toMatchObject({ status: 429, code: "ai_unavailable" });
    const since = vi.mocked(repo.countByUserSince).mock.calls[0]![2];
    expect(now.getTime() - since.getTime()).toBe(86_400_000);
    expect(repo.insert).not.toHaveBeenCalled();
  });

  it("stops at the monthly budget", async () => {
    vi.mocked(repo.spendSince).mockResolvedValue({ spentMicroUsd: 4_999_000, unfinished: 0 });
    await expect(service.requestIdentification(SELLER, UPLOAD, now)).rejects.toMatchObject({ status: 503, code: "ai_unavailable" });
    expect(repo.insert).not.toHaveBeenCalled();
    // From the first day of this month, UTC.
    expect(vi.mocked(repo.spendSince).mock.calls[0]![0]).toEqual(new Date("2026-11-01T00:00:00Z"));
  });

  it("counts calls still running at their highest cost, so parallel calls cannot overshoot", async () => {
    const max = service.maxCallCostMicroUsd();
    const room = Math.floor(5_000_000 / max);
    vi.mocked(repo.spendSince).mockResolvedValue({ spentMicroUsd: 0, unfinished: room - 1 });
    await expect(service.requestIdentification(SELLER, UPLOAD, now)).resolves.toBeDefined();
    vi.mocked(repo.spendSince).mockResolvedValue({ spentMicroUsd: 0, unfinished: room });
    await expect(service.requestIdentification(SELLER, UPLOAD, now)).rejects.toMatchObject({ code: "ai_unavailable" });
  });
});

describe("getIdentification", () => {
  it("shows the owner their result", async () => {
    vi.mocked(repo.findById).mockResolvedValue(row({ status: "done", result: { isPart: true } }));
    await expect(service.getIdentification(SELLER, IDENT)).resolves.toMatchObject({ status: "done", suggestion: { isPart: true } });
  });

  it("hides another user's identification as not found", async () => {
    vi.mocked(repo.findById).mockResolvedValue(row());
    await expect(service.getIdentification(OTHER, IDENT)).rejects.toMatchObject({ status: 404 });
  });

  it("never shows a failed identification's error to the user", async () => {
    vi.mocked(repo.findById).mockResolvedValue(row({ status: "failed", error: "Gemini answered 403: key invalid" }));
    const result = await service.getIdentification(SELLER, IDENT);
    expect(JSON.stringify(result)).not.toContain("Gemini");
    expect(result.suggestion).toBeNull();
  });
});

describe("runAiJob", () => {
  const job = { id: "job-1", payload: { identificationId: IDENT } };

  it("validates and cleans the answer, maps the category, and records cost", async () => {
    provider.identifyPart.mockResolvedValue({ output: goodOutput, usage: { inputTokens: 1000, outputTokens: 500 } });
    await service.runAiJob(job);
    expect(provider.identifyPart).toHaveBeenCalledWith(
      expect.objectContaining({ mimeType: "image/webp", categories: [{ slug: "filters", name: "Filters" }] }),
    );
    expect(repo.addUsage).toHaveBeenCalledWith(IDENT, expect.objectContaining({ inputTokens: 1000, outputTokens: 500, costMicroUsd: 1550 }));
    const outcome = vi.mocked(repo.finish).mock.calls[0]![1];
    expect(outcome.status).toBe("done");
    expect(outcome.status === "done" && outcome.result).toEqual({
      isPart: true,
      name: { value: "Hydraulic oil filter", confidence: "high" },
      brand: { value: "Fleetguard", confidence: "high" },
      partNumbers: { value: ["HF6553", "P165569"], confidence: "high" },
      category: { value: { id: CAT, name: "Filters" }, confidence: "medium" },
      fitments: { value: [{ make: "Kobelco", model: "SK380" }], confidence: "low" },
      description: { value: "Spin-on hydraulic filter.", confidence: "medium" },
    });
  });

  it("drops a category we do not have", async () => {
    provider.identifyPart.mockResolvedValue({
      output: { ...goodOutput, categorySlug: { value: "'; drop table--", confidence: "high" } },
      usage: { inputTokens: 1, outputTokens: 1 },
    });
    await service.runAiJob(job);
    const outcome = vi.mocked(repo.finish).mock.calls[0]![1];
    expect(outcome.status === "done" && (outcome.result as { category: unknown }).category).toEqual({ value: null, confidence: "low" });
  });

  it("blanks the fields when the photo is not a part", async () => {
    provider.identifyPart.mockResolvedValue({ output: { ...goodOutput, isPart: false }, usage: { inputTokens: 1, outputTokens: 1 } });
    await service.runAiJob(job);
    const outcome = vi.mocked(repo.finish).mock.calls[0]![1];
    expect(outcome.status === "done" && outcome.result).toMatchObject({ isPart: false, name: { value: null }, partNumbers: { value: [] } });
  });

  it("fails without retry on an answer of the wrong shape, but still records what it cost", async () => {
    provider.identifyPart.mockResolvedValue({ output: { isPart: "yes", action: "publish" }, usage: { inputTokens: 1000, outputTokens: 500 } });
    await expect(service.runAiJob(job)).rejects.toBeInstanceOf(service.PermanentAiJobError);
    expect(repo.addUsage).toHaveBeenCalledWith(IDENT, expect.objectContaining({ costMicroUsd: 1550 }));
    expect(vi.mocked(repo.finish).mock.calls[0]![1]).toMatchObject({ status: "failed" });
  });

  it("retries a rate limit or outage (no finish yet)", async () => {
    provider.identifyPart.mockRejectedValue(new AiProviderError("Gemini answered 429", true));
    const error = await service.runAiJob(job).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AiProviderError);
    expect(error).not.toBeInstanceOf(service.PermanentAiJobError);
    expect(repo.finish).not.toHaveBeenCalled();
  });

  it("fails at once on a refused call, recording a billed answer's tokens", async () => {
    provider.identifyPart.mockRejectedValue(new AiProviderError("Gemini returned invalid JSON", false, { inputTokens: 10, outputTokens: 10 }));
    await expect(service.runAiJob(job)).rejects.toBeInstanceOf(service.PermanentAiJobError);
    expect(repo.addUsage).toHaveBeenCalled();
    expect(vi.mocked(repo.finish).mock.calls[0]![1]).toMatchObject({ status: "failed" });
  });

  it("does not call the model if AI was switched off after the request", async () => {
    env.AI_ENABLED = false;
    await expect(service.runAiJob(job)).rejects.toBeInstanceOf(service.PermanentAiJobError);
    expect(provider.identifyPart).not.toHaveBeenCalled();
    expect(vi.mocked(repo.finish).mock.calls[0]![1]).toMatchObject({ status: "failed" });
  });

  it("does not call the model for a non-test account on the free tier", async () => {
    env.GEMINI_TIER = "free";
    await expect(service.runAiJob(job)).rejects.toBeInstanceOf(service.PermanentAiJobError);
    expect(provider.identifyPart).not.toHaveBeenCalled();
  });

  it("does nothing for an identification that already finished", async () => {
    vi.mocked(repo.markRunning).mockResolvedValue(undefined);
    await service.runAiJob(job);
    expect(provider.identifyPart).not.toHaveBeenCalled();
  });

  it("refuses a malformed job", async () => {
    await expect(service.runAiJob({ id: "job-2", payload: { identificationId: "nope" } })).rejects.toBeInstanceOf(service.PermanentAiJobError);
  });
});
