import { Queue, type JobsOptions } from "bullmq";
import { Redis } from "ioredis";
import { env } from "../config/env";

/**
 * Producer side of the BullMQ queues. The API only ADDS jobs; the worker
 * (apps/worker) runs them. Queues are created on first use, so code paths
 * that never enqueue (and unit tests) never open a Redis connection.
 */

let connection: Redis | undefined;
const queues = new Map<string, Queue>();

function getConnection(): Redis {
  connection ??= new Redis(env.REDIS_URL, { maxRetriesPerRequest: 3 });
  return connection;
}

export function getQueue(name: string): Queue {
  let queue = queues.get(name);
  if (!queue) {
    queue = new Queue(name, { connection: getConnection() });
    queues.set(name, queue);
  }
  return queue;
}

/** Retries with backoff; finished jobs are removed so their data does not stay in Redis. */
export const defaultJobOptions: JobsOptions = {
  attempts: 5,
  backoff: { type: "exponential", delay: 10_000 },
  removeOnComplete: true,
  removeOnFail: { age: 7 * 24 * 60 * 60 },
};

export async function closeQueues(): Promise<void> {
  await Promise.all([...queues.values()].map((queue) => queue.close()));
  queues.clear();
  await connection?.quit();
  connection = undefined;
}
