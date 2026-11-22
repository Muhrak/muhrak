import type { Role } from "../../schemas";
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

/**
 * The admin console has its own origin (`ADMIN_WEB_ORIGIN`, 22 Nov 2026).
 * Admin sessions are started, refreshed and ended only from it; buyer and
 * seller sessions never from it. So an injected script on the public site
 * cannot reach an admin session, and the console's origin cannot be used
 * for the public sides. Without ADMIN_WEB_ORIGIN (local): no extra rule.
 * Runs after the body is validated (it reads the side from `role`).
 */
export const requireSideOrigin: RequestHandler = (req, _res, next) => {
  const adminOrigin = env.ADMIN_WEB_ORIGIN;
  if (!adminOrigin) {
    next();
    return;
  }
  const side = (req.body as { role?: Role } | undefined)?.role;
  const fromAdminOrigin = req.headers.origin === adminOrigin;
  if (!side || (side === "admin") !== fromAdminOrigin) {
    next(forbidden("Request origin is not allowed"));
    return;
  }
  next();
};

/**
 * For the admin API (`/v1/admin/*`): a browser request that names another
 * origin is refused (defence in depth; the admin token only ever lives on
 * the admin origin). Same-origin reads send no Origin and pass.
 */
export const refuseOtherOrigins: RequestHandler = (req, _res, next) => {
  const adminOrigin = env.ADMIN_WEB_ORIGIN;
  const origin = req.headers.origin;
  if (adminOrigin && origin && origin !== adminOrigin) {
    next(forbidden("Request origin is not allowed"));
    return;
  }
  next();
};
