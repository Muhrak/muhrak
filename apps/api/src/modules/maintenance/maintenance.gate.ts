import type { Request, RequestHandler } from "express";
import { tokenRole } from "../auth";
import { activeWindow, getOpenWindows, maintenanceError, scopeCovers, type RequestSide } from "./maintenance.service";

/**
 * Maintenance gate: runs before every /v1 route. While a window is in
 * effect, requests to the part of the site it covers get 503 `maintenance`
 * (with Retry-After). The admin console never goes offline, so admins can
 * always turn maintenance off again.
 *
 * Always let through:
 * - /admin/*: the admin router itself requires an admin session;
 * - /status: the public status the web app polls;
 * - /auth/logout: ending a session is always allowed (shared computers);
 * - /auth/login and /auth/refresh for the admin side (the login refuses any
 *   non-admin account on that side, and refresh uses the admin cookie only);
 * - any request carrying a valid ADMIN access token (signature checked).
 *
 * Add payment-gateway webhooks here when they are built (Days 12-16): they
 * report money that has already moved and must never be refused.
 *
 * Paths are compared lower-cased without a trailing slash, the way Express
 * routes them (case-insensitive, non-strict), so a request cannot dodge the
 * gate with "/Seller/..." or "/seller/products/".
 */

const ALWAYS_OPEN = new Set(["/status", "/auth/logout"]);
const ADMIN_SESSION_PATHS = new Set(["/auth/login", "/auth/refresh"]);

function normalisedPath(req: Request): string {
  return req.path.toLowerCase().replace(/\/+$/, "") || "/";
}

function under(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

function bodyRole(req: Request): unknown {
  const body: unknown = req.body;
  return typeof body === "object" && body !== null ? (body as { role?: unknown }).role : undefined;
}

/** Which part of the site a request belongs to. Paths decide first; tokens and the login side only where paths cannot. */
export function requestSide(path: string, role: unknown, tokenSide: string | null): RequestSide {
  if (under(path, "/seller")) return "seller"; // Seller Centre API (also /seller/products)
  if (under(path, "/sellers")) return "buyer"; // public sellers directory and storefronts
  if (under(path, "/catalog")) return "shared"; // categories: used by the buyer site and the seller product form
  if (under(path, "/auth")) {
    if (role === "buyer" || role === "seller") return role; // login, refresh, sign-up, verify email
    if (tokenSide === "buyer" || tokenSide === "seller") return tokenSide; // /auth/me
    return "shared"; // forgot / reset password, resend code: no side known
  }
  if (tokenSide === "buyer" || tokenSide === "seller") return tokenSide; // e.g. /uploads
  return "buyer"; // anything public belongs to the buyer site
}

export const maintenanceGate: RequestHandler = async (req, res, next) => {
  const path = normalisedPath(req);
  if (under(path, "/admin") || ALWAYS_OPEN.has(path)) return next();
  if (ADMIN_SESSION_PATHS.has(path) && bodyRole(req) === "admin") return next();

  const now = new Date();
  const active = activeWindow(await getOpenWindows(now), now);
  if (!active) return next();

  const tokenSide = await tokenRole(req.headers.authorization);
  if (tokenSide === "admin") return next();
  if (!scopeCovers(active.scope, requestSide(path, bodyRole(req), tokenSide))) return next();

  const error = maintenanceError(active, now);
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Retry-After", String((error.details as { retryAfterSeconds: number }).retryAfterSeconds));
  next(error);
};
