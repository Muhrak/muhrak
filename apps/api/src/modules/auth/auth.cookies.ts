import type { Role } from "@muhrak/schemas";
import type { Request, RequestHandler, Response } from "express";
import { env } from "../../config/env";
import { forbidden } from "../../shared/errors";

/**
 * Refresh tokens live in httpOnly cookies, one per side, so page scripts
 * (and any injected script) can never read them, and buyer and seller
 * sessions never mix.
 *
 * - HttpOnly: invisible to JavaScript.
 * - Secure: HTTPS only (browsers allow it on http://localhost for dev).
 * - SameSite=Strict: never sent on requests started by another site (CSRF).
 * - Path: only sent to the auth endpoints, not to every page.
 */

export function refreshCookieName(side: Role): string {
  return `muhrak_rt_${side}`;
}

export function setRefreshCookie(res: Response, side: Role, token: string, expiresAt: Date): void {
  res.cookie(refreshCookieName(side), token, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: env.AUTH_COOKIE_PATH,
    expires: expiresAt,
  });
}

export function clearRefreshCookie(res: Response, side: Role): void {
  res.clearCookie(refreshCookieName(side), {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: env.AUTH_COOKIE_PATH,
  });
}

/** Read one cookie from the Cookie header (no cookie-parser dependency needed). */
export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    if (part.slice(0, index).trim() !== name) continue;
    const value = part.slice(index + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export function readRefreshCookie(req: Request, side: Role): string | undefined {
  const value = readCookie(req, refreshCookieName(side));
  // Refresh tokens are long random strings; ignore anything else.
  return value && value.length >= 20 && value.length <= 200 ? value : undefined;
}

/**
 * CSRF guard for the endpoints that set or use the session cookie: the
 * request must come from one of our own web origins. Browsers always send
 * Origin on cross-origin and POST requests and scripts cannot fake it.
 * Requests with no Origin (curl, servers) have no browser cookies to abuse,
 * but are refused too so the rule is simple.
 */
export const requireTrustedOrigin: RequestHandler = (req, _res, next) => {
  const origin = req.headers.origin;
  if (!origin || !env.CORS_ORIGINS.includes(origin)) {
    next(forbidden("Request origin is not allowed"));
    return;
  }
  next();
};
