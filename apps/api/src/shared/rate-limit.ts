import { createHash } from "node:crypto";
import type { Request, RequestHandler } from "express";
import { AppError } from "./errors";
import { logger } from "./logger";
import { getRedis } from "./redis";

/**
 * Fixed-window rate limits, counted in Redis so every API instance shares
 * them. If Redis is unreachable, an in-memory counter takes over for this
 * instance (limits keep working, per instance) instead of turning the
 * protection off.
 */

export interface Limit {
  /** Short name, part of the Redis key, e.g. "login:ip". */
  name: string;
  /** Requests allowed per window. */
  max: number;
  windowMs: number;
}

export interface HitResult {
  allowed: boolean;
  count: number;
  /** Time until the window resets. */
  retryAfterMs: number;
}

/** INCR the counter; set the expiry on the first hit. Returns [count, pttl]. */
const HIT_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('PTTL', KEYS[1])
if ttl < 0 then redis.call('PEXPIRE', KEYS[1], ARGV[1]); ttl = tonumber(ARGV[1]) end
return {count, ttl}
`;

const memory = new Map<string, { count: number; resetAt: number }>();

function memoryHit(key: string, windowMs: number, now = Date.now()): [number, number] {
  let entry = memory.get(key);
  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + windowMs };
    memory.set(key, entry);
  }
  entry.count += 1;
  if (memory.size > 50_000) {
    for (const [k, v] of memory) if (v.resetAt <= now) memory.delete(k);
  }
  return [entry.count, entry.resetAt - now];
}

function memoryPeek(key: string, now = Date.now()): [number, number] {
  const entry = memory.get(key);
  return !entry || entry.resetAt <= now ? [0, 0] : [entry.count, entry.resetAt - now];
}

function redisKey(limit: Limit, subject: string): string {
  return `rl:${limit.name}:${subject}`;
}

/** Count one hit for `subject` (an IP or a hashed email) and say whether it is within the limit. */
export async function hit(limit: Limit, subject: string): Promise<HitResult> {
  const key = redisKey(limit, subject);
  let count: number;
  let ttl: number;
  try {
    const result = (await getRedis().eval(HIT_SCRIPT, 1, key, String(limit.windowMs))) as [number, number];
    [count, ttl] = result;
  } catch {
    [count, ttl] = memoryHit(key, limit.windowMs);
  }
  return { allowed: count <= limit.max, count, retryAfterMs: Math.max(ttl, 0) };
}

/** Read the counter without adding a hit. */
export async function peek(limit: Limit, subject: string): Promise<HitResult> {
  const key = redisKey(limit, subject);
  let count: number;
  let ttl: number;
  try {
    const [raw, pttl] = await getRedis().multi().get(key).pttl(key).exec().then((r) => [r?.[0]?.[1], r?.[1]?.[1]]);
    count = Number(raw ?? 0);
    ttl = Number(pttl ?? 0);
  } catch {
    [count, ttl] = memoryPeek(key);
  }
  return { allowed: count < limit.max, count, retryAfterMs: Math.max(ttl, 0) };
}

/** Forget a counter (e.g. failed logins after a successful one). */
export async function reset(limit: Limit, subject: string): Promise<void> {
  const key = redisKey(limit, subject);
  memory.delete(key);
  try {
    await getRedis().del(key);
  } catch {
    // Redis down: the memory counter was cleared; the Redis key expires on its own.
  }
}

/** Hash personal identifiers (emails) before they become Redis keys. */
export function subjectHash(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex").slice(0, 32);
}

export function tooManyRequests(retryAfterMs: number, message = "Too many requests. Please wait and try again."): AppError {
  const seconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
  return new AppError(429, "rate_limited", message, { retryAfterSeconds: seconds });
}

/**
 * Middleware: limit requests per client IP. `req.ip` honours the
 * `trust proxy` setting (see app.ts), so it is the real client address
 * behind Railway and Vercel.
 */
export function limitByIp(limit: Limit, message?: string): RequestHandler {
  return async (req, res, next) => {
    const result = await hit(limit, clientIp(req));
    if (!result.allowed) {
      logger.warn({ limit: limit.name, ip: clientIp(req), path: req.path }, "Rate limit reached");
      res.setHeader("Retry-After", String(Math.ceil(result.retryAfterMs / 1000)));
      next(tooManyRequests(result.retryAfterMs, message));
      return;
    }
    next();
  };
}

export function clientIp(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? "unknown";
}
