import "dotenv/config";
import { Worker } from "bullmq";
import { Redis } from "ioredis";

/**
 * Background worker. Runs as its own process, separate from the API.
 *
 * Anything slow or retryable goes here instead of inside an HTTP request:
 * AI photo identification, emails and SMS, RFQ expiry, payout runs.
 *
 * This file is a placeholder with one example queue. Real job handlers are
 * added in Phase 3 (AI) and Phase 4 (payments).
 */

const redisUrl = process.env.REDIS_URL;
if (!redisUrl) {
  console.error("REDIS_URL is not set");
  process.exit(1);
}

// BullMQ requires maxRetriesPerRequest to be null on worker connections.
const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });

export const QUEUES = {
  example: "example",
} as const;

const exampleWorker = new Worker(
  QUEUES.example,
  async (job) => {
    console.log(`Processing job ${job.id} (${job.name})`, job.data);
    return { ok: true };
  },
  { connection, concurrency: 5 },
);

exampleWorker.on("failed", (job, err) => {
  console.error(`Job ${job?.id} failed:`, err.message);
});

console.log("Muhrak worker started");

async function shutdown() {
  await exampleWorker.close();
  await connection.quit();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
