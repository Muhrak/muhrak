import { AI_QUEUE, CHAT_QUEUE, EMAIL_QUEUE } from "../schemas";
import { env } from "../config/env";
import { claimDueJobs, markJobDone, markJobFailed, onJobAdded, releaseStaleJobs } from "../shared/jobs";
import { logger } from "../shared/logger";
import { failAiJob, PermanentAiJobError, runAiJob } from "../modules/ai";
import { PermanentChatJobError, runChatJob } from "../modules/chat";
import { expireUnpaidOrders } from "../modules/order";
import { expireStalePayments } from "../modules/payment";
import { expireDueQuotes } from "../modules/quotation";
import { expireDueRfqs } from "../modules/rfq";
import type { EmailProvider } from "./email/email-provider";
import { createConsoleProvider } from "./email/providers/console";
import { createResendProvider } from "./email/providers/resend";
import { PermanentJobError, sendEmailJob } from "./jobs/send-email";

/**
 * Background jobs, run inside the API process from the PostgreSQL `jobs`
 * table (no Redis; developer decision, 14 Nov 2026). Requests only ADD a
 * job, so slow or failing work (emails now; AI identification and RFQ
 * expiry later) never slows a request, is retried with backoff, and
 * survives a restart. Several API copies can run this at once: each job is
 * claimed by exactly one (FOR UPDATE SKIP LOCKED).
 *
 * The worker wakes when this process adds a job, and otherwise checks every
 * POLL_MS for retries that are due and for jobs added by other copies.
 */

const POLL_MS = 5_000;
const BATCH = 5;
/** AI calls at once per API copy (the free Gemini tier allows only a few per minute). */
const AI_BATCH = 2;
/** A job "running" longer than this was left by a stopped process; run it again. */
const STALE_MS = 5 * 60_000;
/** How often open quote requests past their time are closed. */
const SWEEP_MS = 60_000;
let lastSweep = 0;

let timer: NodeJS.Timeout | undefined;
let running: Promise<void> | undefined;
let wakeAgain = false;
let stopped = true;
let unsubscribe: (() => void) | undefined;
let emailProvider: EmailProvider | undefined;

function createEmailProvider(): EmailProvider | undefined {
  if (env.RESEND_API_KEY) {
    // Without a verified domain, Resend only accepts its test sender and only
    // delivers to the Resend account owner's address.
    return createResendProvider({ apiKey: env.RESEND_API_KEY, from: env.EMAIL_FROM });
  }
  // In production a missing key must not print emails (with reset links) to
  // the logs. Emails then wait in the queue until the key is set.
  if (env.NODE_ENV === "production") return undefined;
  return createConsoleProvider();
}

/** Run every due email job, in batches, until none is left. */
async function drainEmails(provider: EmailProvider): Promise<void> {
  for (;;) {
    const batch = await claimDueJobs(EMAIL_QUEUE, BATCH);
    if (batch.length === 0) return;
    await Promise.all(
      batch.map(async (job) => {
        try {
          await sendEmailJob(provider, job);
          await markJobDone(job.id);
          // Job data is never logged: it can hold one-time links.
          logger.info(`Email job ${job.dedupeKey} (${job.name}) sent via ${provider.name}`);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          const outcome = await markJobFailed(job, message, err instanceof PermanentJobError);
          logger.error(`Email job ${job.dedupeKey} (${job.name}) failed, attempt ${job.attempts}, ${outcome}: ${message}`);
        }
      }),
    );
  }
}

/** Run every due AI identification job, a few at a time, until none is left. */
async function drainAi(): Promise<void> {
  for (;;) {
    const batch = await claimDueJobs(AI_QUEUE, AI_BATCH);
    if (batch.length === 0) return;
    await Promise.all(
      batch.map(async (job) => {
        try {
          await runAiJob(job);
          await markJobDone(job.id);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          const outcome = await markJobFailed(job, message, err instanceof PermanentAiJobError);
          // Retries used up: the identification fails and the user gets the manual form.
          if (outcome === "failed") await failAiJob(job, message);
          logger.error(`AI job ${job.dedupeKey} failed, attempt ${job.attempts}, ${outcome}: ${message}`);
        }
      }),
    );
  }
}

/** Open buyer–seller chats for new quote requests (Day 10), a few at a time. */
async function drainChat(): Promise<void> {
  for (;;) {
    const batch = await claimDueJobs(CHAT_QUEUE, AI_BATCH);
    if (batch.length === 0) return;
    await Promise.all(
      batch.map(async (job) => {
        try {
          await runChatJob(job);
          await markJobDone(job.id);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          const outcome = await markJobFailed(job, message, err instanceof PermanentChatJobError);
          logger.error(`Chat job ${job.dedupeKey} failed, attempt ${job.attempts}, ${outcome}: ${message}`);
        }
      }),
    );
  }
}

/** Close expired quote requests, quotations and unpaid orders, at most once a minute. Safe with several API copies (SKIP LOCKED). */
async function sweep(): Promise<void> {
  if (Date.now() - lastSweep < SWEEP_MS) return;
  lastSweep = Date.now();
  const expired = await expireDueRfqs();
  if (expired > 0) logger.info(`Closed ${expired} expired quote request(s)`);
  const expiredQuotes = await expireDueQuotes();
  if (expiredQuotes > 0) logger.info(`Closed ${expiredQuotes} expired quotation(s)`);
  // Day 12: unpaid orders past their time (their quotations become valid again), and checkouts left open.
  const unpaid = await expireUnpaidOrders();
  if (unpaid > 0) logger.info(`Cancelled ${unpaid} unpaid order(s)`);
  const stale = await expireStalePayments();
  if (stale > 0) logger.info(`Closed ${stale} abandoned payment attempt(s)`);
}

/** One pass. Never runs twice at once; a wake-up during a pass triggers one more pass. */
function tick(): void {
  if (stopped) return;
  if (running) {
    wakeAgain = true;
    return;
  }
  const provider = emailProvider;
  running = (async () => {
    try {
      await sweep();
    } catch (err) {
      logger.warn({ err: { message: err instanceof Error ? err.message : String(err) } }, "Quote request expiry sweep failed");
    }
    try {
      await releaseStaleJobs(STALE_MS);
      if (provider) await drainEmails(provider);
      await drainAi();
      await drainChat();
    } catch (err) {
      logger.warn({ err: { message: err instanceof Error ? err.message : String(err) } }, "Background jobs pass failed");
    }
  })().finally(() => {
    running = undefined;
    if (wakeAgain && !stopped) {
      wakeAgain = false;
      tick();
    }
  });
}

/** Start the workers. Called once by server.ts after the API is listening. */
export function startWorkers(): void {
  if (!stopped) return;
  emailProvider = createEmailProvider();
  if (!emailProvider) {
    // Other background work (the quote request expiry) still runs.
    logger.error("RESEND_API_KEY is not set: emails are NOT sent; they wait in the queue until it is set");
  }
  stopped = false;
  unsubscribe = onJobAdded(tick);
  timer = setInterval(tick, POLL_MS);
  tick();
  logger.info(`Background workers started (email provider: ${emailProvider?.name ?? "none"}, queue: PostgreSQL)`);
}

/** Stop polling and let a running pass finish. */
export async function closeWorkers(): Promise<void> {
  stopped = true;
  if (timer) clearInterval(timer);
  timer = undefined;
  unsubscribe?.();
  unsubscribe = undefined;
  await running;
}
