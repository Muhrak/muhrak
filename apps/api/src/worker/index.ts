import { EMAIL_QUEUE } from "../schemas";
import { Worker } from "bullmq";
import { Redis } from "ioredis";
import { env } from "../config/env";
import { logger } from "../shared/logger";
import type { EmailProvider } from "./email/email-provider";
import { createConsoleProvider } from "./email/providers/console";
import { createResendProvider } from "./email/providers/resend";
import { createSendEmailHandler } from "./jobs/send-email";

/**
 * Background jobs. They run inside the API process (developer decision,
 * 14 Nov 2026; until then a separate app, apps/worker), but still through
 * BullMQ queues in Redis: a request only ADDS a job, so slow or failing
 * work (emails now; AI photo identification and RFQ expiry later) never
 * slows a request, is retried with backoff, and survives a restart.
 *
 * Several API copies may run at once; BullMQ gives each job to one of them.
 */

let connection: Redis | undefined;
const workers: Worker[] = [];

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

/** Start the queue workers. Called once by server.ts after the API is listening. */
export function startWorkers(): void {
  if (workers.length > 0) return;
  const emailProvider = createEmailProvider();
  if (!emailProvider) {
    logger.error("RESEND_API_KEY is not set: emails are NOT sent; they wait in the queue until it is set");
    return;
  }

  // BullMQ requires maxRetriesPerRequest to be null on worker connections.
  connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  connection.on("error", (err: Error) => logger.warn({ err: { message: err.message } }, "Redis (workers) error"));

  const emailWorker = new Worker(EMAIL_QUEUE, createSendEmailHandler(emailProvider), {
    connection,
    concurrency: 5,
    // Same namespace as the producer (shared/queue.ts); other environments' jobs are never touched.
    prefix: env.queuePrefix,
  });
  // Job data is never logged: it can hold one-time links.
  emailWorker.on("completed", (job) => logger.info(`Email job ${job.id} (${job.name}) sent via ${emailProvider.name}`));
  emailWorker.on("failed", (job, err) =>
    logger.error(`Email job ${job?.id} (${job?.name}) failed, attempt ${job?.attemptsMade}: ${err.message}`),
  );
  emailWorker.on("error", (err) => logger.warn({ err: { message: err.message } }, "Email worker error"));
  workers.push(emailWorker);

  logger.info(`Background workers started (email provider: ${emailProvider.name}, queue prefix: ${env.queuePrefix})`);
}

/** Let running jobs finish, then close the workers' Redis connection. */
export async function closeWorkers(): Promise<void> {
  await Promise.all(workers.map((worker) => worker.close()));
  workers.length = 0;
  await connection?.quit().catch(() => undefined);
  connection = undefined;
}
