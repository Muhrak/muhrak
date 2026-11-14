import { EMAIL_QUEUE } from "../schemas";
import { env } from "../config/env";
import { claimDueJobs, markJobDone, markJobFailed, onJobAdded, releaseStaleJobs } from "../shared/jobs";
import { logger } from "../shared/logger";
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
/** A job "running" longer than this was left by a stopped process; run it again. */
const STALE_MS = 5 * 60_000;

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

/** One pass. Never runs twice at once; a wake-up during a pass triggers one more pass. */
function tick(): void {
  if (stopped || !emailProvider) return;
  if (running) {
    wakeAgain = true;
    return;
  }
  const provider = emailProvider;
  running = (async () => {
    try {
      await releaseStaleJobs(STALE_MS);
      await drainEmails(provider);
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
    logger.error("RESEND_API_KEY is not set: emails are NOT sent; they wait in the queue until it is set");
    return;
  }
  stopped = false;
  unsubscribe = onJobAdded(tick);
  timer = setInterval(tick, POLL_MS);
  tick();
  logger.info(`Background workers started (email provider: ${emailProvider.name}, queue: PostgreSQL)`);
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
