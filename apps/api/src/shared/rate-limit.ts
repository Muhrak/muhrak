import { createHash, timingSafeEqual } from "node:crypto";
import type { Request, RequestHandler } from "express";
import { env } from "../config/env";
import { AppError } from "./errors";
import { logger } from "./logger";

/**
 * Fixed-window rate limits, counted in this process's memory (no Redis for
 * now; developer decision, 14 Nov 2026). Staging runs one API copy, so the
 * limits are exact. With several copies each would count separately (an
 * attacker would get N times the limit) and a restart resets the counts:
 * move the counters to a shared store before scaling out.
 */

export interface Limit {
  /** Short name, part of the counter key, e.g. "login:ip". */
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

function counterKey(limit: Limit, subject: string): string {
  return `rl:${limit.name}:${subject}`;
}

/**
 * Count one hit for `subject` (an IP or a hashed email) and say whether it
 * is within the limit. Async so callers stay the same when the counters
 * move to a shared store.
 */
export async function hit(limit: Limit, subject: string): Promise<HitResult> {
  const [count, ttl] = memoryHit(counterKey(limit, subject), limit.windowMs);
  return { allowed: count <= limit.max, count, retryAfterMs: Math.max(ttl, 0) };
}

/** Read the counter without adding a hit. */
export async function peek(limit: Limit, subject: string): Promise<HitResult> {
  const [count, ttl] = memoryPeek(counterKey(limit, subject));
  return { allowed: count < limit.max, count, retryAfterMs: Math.max(ttl, 0) };
}

/** Forget a counter (e.g. failed logins after a successful one). */
export async function reset(limit: Limit, subject: string): Promise<void> {
  memory.delete(counterKey(limit, subject));
}

/** Hash personal identifiers (emails) before they become counter keys, so memory never holds raw emails. */
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

/**
 * Middleware: limit requests per signed-in user (use after requireAuth).
 * Stops one account from flooding an endpoint from many IPs.
 */
export function limitByUser(limit: Limit, message?: string): RequestHandler {
  return async (req, res, next) => {
    const userId = req.auth?.userId;
    if (!userId) {
      next(new AppError(401, "unauthorized", "Not signed in"));
      return;
    }
    const result = await hit(limit, userId);
    if (!result.allowed) {
      logger.warn({ limit: limit.name, userId, path: req.path }, "Rate limit reached");
      next(tooManyRequests(result.retryAfterMs, message));
      return;
    }
    next();
  };
}

/**
 * The real client IP:
 * - via the web app's /api proxy: `x-muhrak-client-ip`, trusted only when
 *   `x-muhrak-proxy-secret` matches API_PROXY_SECRET (constant-time check);
 * - otherwise `req.ip`, which honours `trust proxy` (Railway's edge
 *   replaces any client-supplied X-Forwarded-For, so it cannot be faked).
 */
export function clientIp(req: Request): string {
  const secret = env.API_PROXY_SECRET;
  const given = req.headers["x-muhrak-proxy-secret"];
  const forwarded = req.headers["x-muhrak-client-ip"];
  if (secret && typeof given === "string" && typeof forwarded === "string" && safeEqual(given, secret)) {
    const ip = forwarded.trim();
    if (/^[0-9a-fA-F:.]{3,45}$/.test(ip)) return ip;
  }
  return req.ip ?? req.socket.remoteAddress ?? "unknown";
}

function safeEqual(a: string, b: string): boolean {
  const left = createHash("sha256").update(a).digest();
  const right = createHash("sha256").update(b).digest();
  return timingSafeEqual(left, right);
}
