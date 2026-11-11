import "dotenv/config";
import { EMAIL_QUEUE } from "@muhrak/schemas";
import { Worker } from "bullmq";
import { Redis } from "ioredis";
import type { EmailProvider } from "./email/email-provider";
import { createConsoleProvider } from "./email/providers/console";
import { createResendProvider } from "./email/providers/resend";
import { createSendEmailHandler } from "./jobs/send-email";

/**
 * Background worker. Runs as its own process, separate from the API.
 *
 * Anything slow or retryable goes here instead of inside an HTTP request:
 * emails now; AI photo identification and RFQ expiry later.
 */

const isProduction = process.env.NODE_ENV === "production";
const redisUrl = process.env.REDIS_URL;
if (!redisUrl) {
  console.error("REDIS_URL is not set");
  process.exit(1);
}

function createEmailProvider(): EmailProvider {
  const apiKey = process.env.RESEND_API_KEY;
  if (apiKey) {
    // Without a verified domain, Resend only accepts its test sender and only
    // delivers to the Resend account owner's address.
    return createResendProvider({ apiKey, from: process.env.EMAIL_FROM ?? "Muhrak <onboarding@resend.dev>" });
  }
  if (isProduction) {
    console.error("RESEND_API_KEY is not set");
    process.exit(1);
  }
  return createConsoleProvider();
}

// BullMQ requires maxRetriesPerRequest to be null on worker connections.
const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
const emailProvider = createEmailProvider();

const emailWorker = new Worker(EMAIL_QUEUE, createSendEmailHandler(emailProvider), {
  connection,
  concurrency: 5,
});

emailWorker.on("completed", (job) => {
  console.log(`Email job ${job.id} (${job.name}) sent via ${emailProvider.name}`);
});
emailWorker.on("failed", (job, err) => {
  console.error(`Email job ${job?.id} (${job?.name}) failed, attempt ${job?.attemptsMade}: ${err.message}`);
});

console.log(`Muhrak worker started (email provider: ${emailProvider.name})`);

async function shutdown() {
  await emailWorker.close();
  await connection.quit();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
