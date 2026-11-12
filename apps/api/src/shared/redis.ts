import { Redis } from "ioredis";
import { env } from "../config/env";
import { logger } from "./logger";

/**
 * Redis client for request-time work (rate limits). Separate from the
 * BullMQ connection. Opened on first use, so unit tests never connect.
 *
 * Commands fail fast when Redis is down (no offline queue), so callers can
 * fall back instead of hanging the request.
 */
let client: Redis | undefined;

export function getRedis(): Redis {
  if (!client) {
    client = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 5_000,
    });
    client.on("error", (err: Error) => logger.warn({ err: { message: err.message } }, "Redis (rate limits) error"));
  }
  return client;
}

export async function closeRedis(): Promise<void> {
  await client?.quit().catch(() => undefined);
  client = undefined;
}
