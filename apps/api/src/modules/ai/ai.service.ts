import { z } from "zod";
import { env } from "../../config/env";
import {
  AI_QUEUE,
  AI_UNAVAILABLE_CODE,
  aiModelOutputSchema,
  type AiIdentification,
  type AiModelOutput,
  type AiSuggestion,
} from "../../schemas";
import type { AiIdentificationRow, JobRow } from "../../db/schema";
import { AppError, notFound } from "../../shared/errors";
import { enqueueJob, wakeWorker } from "../../shared/jobs";
import { logger } from "../../shared/logger";
import { listCategories } from "../catalog";
import { getOwnedPhotoForAi, readPhotoForAi } from "../upload";
import { AiProviderError, type AiProvider, type ModelUsage } from "./ai-provider";
import { MAX_INPUT_TOKENS_ESTIMATE, MAX_OUTPUT_TOKENS } from "./prompt";
import { createGeminiProvider } from "./providers/gemini";
import * as repo from "./ai.repository";

/**
 * AI part identification (Day 6, 16 Nov 2026; Google Gemini).
 *
 * Rules:
 * - The model only fills fields. Its answer is validated with Zod; nothing
 *   is saved to a product or published from it.
 * - AI runs only when switched on (AI_ENABLED) with a key. On the free
 *   Gemini tier only the test accounts in AI_TEST_USER_IDS may use it
 *   (Google may use free-tier data; real users' photos never go there).
 * - Only the owner's own ready photo; anyone else's looks like none (404).
 * - One identification per photo: a double submit returns the first one.
 * - Per-user limit per 24 hours, and a hard monthly budget. Calls still
 *   running count against the budget at their highest possible cost, so
 *   parallel requests cannot overshoot it. Checked under one lock.
 * - The model call runs in a background job, never in the request.
 * - Every call is recorded with tokens and cost, even when its answer is
 *   unusable. Failures are logged server-side; the user just gets the
 *   manual form.
 */

// ---------------------------------------------------------------- provider

let provider: AiProvider | null | undefined;

/** Tests replace the provider with a fake (null = no provider). */
export function setAiProvider(value: AiProvider | null | undefined): void {
  provider = value;
}

function getProvider(): AiProvider | null {
  if (provider !== undefined) return provider;
  provider = env.GEMINI_API_KEY ? createGeminiProvider({ apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL }) : null;
  return provider;
}

// ---------------------------------------------------------------- money (our spend, micro USD)

/** Cost of a call from its tokens, rounded up (env prices are micro USD per million tokens). */
export function costMicroUsd(usage: ModelUsage): number {
  return (
    Math.ceil((usage.inputTokens * env.GEMINI_INPUT_USD_PER_MTOK) / 1_000_000) +
    Math.ceil((usage.outputTokens * env.GEMINI_OUTPUT_USD_PER_MTOK) / 1_000_000)
  );
}

/** The most one call can cost: what an unfinished call is counted as against the budget. */
export function maxCallCostMicroUsd(): number {
  return costMicroUsd({ inputTokens: MAX_INPUT_TOKENS_ESTIMATE, outputTokens: MAX_OUTPUT_TOKENS });
}

function startOfMonthUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

const DAY_MS = 86_400_000;

// ---------------------------------------------------------------- availability

const unavailable = (status: number, message: string) => new AppError(status, AI_UNAVAILABLE_CODE, message);
const OFF_MESSAGE = "Photo recognition is not available right now. Please fill in the details yourself.";

/** Why AI cannot run for this user (server-side reason), or null if it can. Budget not included. */
function blockedReason(userId: string): string | null {
  if (!env.AI_ENABLED) return "AI is switched off (AI_ENABLED)";
  if (!getProvider()) return "no AI provider key";
  if (env.GEMINI_TIER === "free" && !env.AI_TEST_USER_IDS.includes(userId.toLowerCase())) {
    return "free Gemini tier: user is not in AI_TEST_USER_IDS";
  }
  return null;
}

async function budgetLeft(now: Date, tx?: repo.Tx): Promise<boolean> {
  const { spentMicroUsd, unfinished } = await repo.spendSince(startOfMonthUtc(now), tx);
  const committed = spentMicroUsd + unfinished * maxCallCostMicroUsd();
  return committed + maxCallCostMicroUsd() <= env.AI_MONTHLY_BUDGET_USD;
}

/** For the form: whether to offer "fill from photo" to this user now. */
export async function isAvailable(userId: string, now = new Date()): Promise<boolean> {
  if (blockedReason(userId)) return false;
  return budgetLeft(now);
}

// ---------------------------------------------------------------- mapping

function toDto(row: AiIdentificationRow): AiIdentification {
  return {
    id: row.id,
    uploadId: row.uploadId,
    status: row.status,
    suggestion: row.status === "done" ? (row.result as AiSuggestion) : null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Model output → form suggestion. The category must be one we have; anything else becomes null. */
export function toSuggestion(output: AiModelOutput, categories: { id: string; slug: string; name: string }[]): AiSuggestion {
  if (!output.isPart) {
    const none = { value: null, confidence: "low" as const };
    return {
      isPart: false,
      name: none,
      brand: none,
      partNumbers: { value: [], confidence: "low" },
      category: none,
      fitments: { value: [], confidence: "low" },
      description: none,
    };
  }
  const slug = output.categorySlug.value?.toLowerCase();
  const category = categories.find((item) => item.slug === slug);
  return {
    isPart: true,
    name: output.name,
    brand: output.brand,
    partNumbers: output.partNumbers,
    category: category
      ? { value: { id: category.id, name: category.name }, confidence: output.categorySlug.confidence }
      : { value: null, confidence: "low" },
    fitments: output.fitments,
    description: output.description,
  };
}

// ---------------------------------------------------------------- requests

/** Start identifying the caller's photo, or return the identification it already has. */
export async function requestIdentification(userId: string, uploadId: string, now = new Date()): Promise<AiIdentification> {
  const reason = blockedReason(userId);
  if (reason) {
    logger.info({ userId, reason }, "AI identification refused");
    throw unavailable(503, OFF_MESSAGE);
  }
  await getOwnedPhotoForAi(userId, uploadId);

  const existing = await repo.findByUpload(uploadId);
  if (existing) return toDto(existing);

  const row = await repo.withBudgetLock(async (tx) => {
    // A parallel request for the same photo may have won while we waited for the lock.
    const raced = await repo.findByUpload(uploadId, tx);
    if (raced) return raced;
    if ((await repo.countByUserSince(tx, userId, new Date(now.getTime() - DAY_MS))) >= env.AI_DAILY_LIMIT_PER_USER) {
      throw unavailable(429, "You have used today's photo recognition limit. Please fill in the details yourself, or try again tomorrow.");
    }
    if (!(await budgetLeft(now, tx))) {
      logger.warn("AI monthly budget reached: identifications refused until next month");
      throw unavailable(503, OFF_MESSAGE);
    }
    const inserted = await repo.insert(tx, { userId, uploadId });
    if (!inserted) throw new Error("AI identification insert conflicted inside the lock");
    // Retries only for rate limits and outages; each try is costed.
    await enqueueJob(AI_QUEUE, "identify-part", { identificationId: inserted.id }, { dedupeKey: `ai:${inserted.id}`, maxAttempts: 3, tx });
    return inserted;
  });
  wakeWorker();
  return toDto(row);
}

/** The caller's own identification only. */
export async function getIdentification(userId: string, id: string): Promise<AiIdentification> {
  const row = await repo.findById(id);
  if (!row || row.userId !== userId) throw notFound("Not found");
  return toDto(row);
}

// ---------------------------------------------------------------- background job

/** A failure retrying cannot fix: the worker stops the job instead of retrying. */
export class PermanentAiJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentAiJobError";
  }
}

const jobPayloadSchema = z.object({ identificationId: z.string().uuid() });

/** Run one job from the "ai" queue. Throws to retry; PermanentAiJobError to stop. */
export async function runAiJob(job: Pick<JobRow, "id" | "payload">): Promise<void> {
  const payload = jobPayloadSchema.safeParse(job.payload);
  if (!payload.success) throw new PermanentAiJobError(`Invalid AI job ${job.id}`);
  const id = payload.data.identificationId;

  const row = await repo.markRunning(id);
  if (!row) return; // already finished

  const fail = async (message: string, durationMs?: number) => {
    await repo.finish(id, { status: "failed", error: message, durationMs });
    throw new PermanentAiJobError(message);
  };

  // The switch, the key or the free-tier rule may have changed since the request.
  const reason = blockedReason(row.userId);
  const ai = getProvider();
  if (reason || !ai) return fail(`Not run: ${reason ?? "no provider"}`);

  const [photo, categories] = await Promise.all([readPhotoForAi(row.uploadId), listCategories()]);
  const started = Date.now();
  let result;
  try {
    result = await ai.identifyPart({
      image: photo.bytes,
      mimeType: photo.contentType,
      categories: categories.map((category) => ({ slug: category.slug, name: category.name })),
    });
  } catch (error) {
    const durationMs = Date.now() - started;
    if (error instanceof AiProviderError) {
      if (error.usage) await record(id, ai, error.usage);
      if (!error.retryable) return fail(error.message, durationMs);
    }
    throw error instanceof Error ? error : new Error(String(error));
  }
  const durationMs = Date.now() - started;
  const cost = await record(id, ai, result.usage);

  const parsed = aiModelOutputSchema.safeParse(result.output);
  if (!parsed.success) {
    const where = parsed.error.issues[0]?.path.join(".") || "answer";
    return fail(`Model answer failed validation at ${where}`, durationMs);
  }
  await repo.finish(id, { status: "done", result: toSuggestion(parsed.data, categories), durationMs });
  logger.info(
    { identificationId: id, model: ai.model, ...result.usage, costMicroUsd: cost, durationMs, isPart: parsed.data.isPart },
    "AI identification done",
  );
}

async function record(id: string, ai: AiProvider, usage: ModelUsage): Promise<number> {
  const cost = costMicroUsd(usage);
  await repo.addUsage(id, { provider: ai.name, model: ai.model, ...usage, costMicroUsd: cost });
  return cost;
}

/** The worker gave up on a job (retries used up): the user gets the manual form. */
export async function failAiJob(job: Pick<JobRow, "payload">, message: string): Promise<void> {
  const payload = jobPayloadSchema.safeParse(job.payload);
  if (payload.success) await repo.finish(payload.data.identificationId, { status: "failed", error: message });
}
