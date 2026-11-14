import { authResponseSchema } from "@muhrak/schemas";
import type { ZodType } from "zod";
import { ApiError, apiRequest, apiRequestNoContent, type RequestOptions } from "@/lib/api";
import type { AuthSide } from "./paths";
import { clearSession, getAccessToken, getSession, saveSession } from "./session";

/**
 * Requests made as the signed-in user of one side (buyer, seller or admin;
 * the sides are separate and never mixed). Every feature that calls a protected
 * endpoint goes through `authedRequest(side, ...)`, which:
 *
 * 1. uses this tab's in-memory access token, getting a new one from the
 *    refresh cookie when it is missing or about to expire,
 * 2. on a 401, refreshes once and retries the request,
 * 3. if the refresh cookie is no longer valid, clears the side's sign-in;
 *    the route guard then sends the user to the login page.
 *
 * Refresh tokens are single use, and the API signs out every session when a
 * used one is presented again. All tabs share the cookie, so only one
 * refresh per side may run at a time across ALL tabs: a Web Lock serialises
 * them, and each refresh rotates the cookie for everyone.
 */

/** Refresh when the access token has less than this long left. */
const EXPIRY_MARGIN_MS = 30_000;
const LOCK_NAME: Record<AuthSide, string> = {
  buyer: "muhrak-auth-refresh-buyer",
  seller: "muhrak-auth-refresh-seller",
  admin: "muhrak-auth-refresh-admin",
};

const inFlight: Record<AuthSide, Promise<string | null> | null> = { buyer: null, seller: null, admin: null };

/** Expiry time of a JWT in ms, or 0 if it cannot be read (treated as expired). */
export function accessTokenExpiresAt(token: string): number {
  try {
    const payload = token.split(".")[1];
    if (!payload) return 0;
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))) as { exp?: unknown };
    return typeof json.exp === "number" ? json.exp * 1000 : 0;
  } catch {
    return 0;
  }
}

function isFresh(token: string | null, now = Date.now()): token is string {
  return token !== null && accessTokenExpiresAt(token) - now >= EXPIRY_MARGIN_MS;
}

async function withRefreshLock<T>(side: AuthSide, task: () => Promise<T>): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.locks) {
    return navigator.locks.request(LOCK_NAME[side], task);
  }
  return task();
}

/**
 * Get a new access token for `side` from the refresh cookie. Returns null
 * (and clears the side's sign-in) if the cookie is missing or no longer
 * valid. `force` skips the "token still fresh" shortcut (after a 401).
 */
export function refreshAccessToken(side: AuthSide, force = false): Promise<string | null> {
  const pending = inFlight[side];
  if (pending) return pending;
  const started = withRefreshLock(side, async () => {
    if (!getSession(side)) return null;
    const current = getAccessToken(side);
    if (!force && isFresh(current)) return current;
    try {
      const next = await apiRequest("/v1/auth/refresh", authResponseSchema, { method: "POST", body: { role: side } });
      if (next.user.role !== side) {
        clearSession(side);
        return null;
      }
      saveSession(side, next);
      return next.accessToken;
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        clearSession(side);
        return null;
      }
      throw error; // Network trouble: keep the sign-in and let the caller retry.
    }
  }).finally(() => {
    inFlight[side] = null;
  });
  inFlight[side] = started;
  return started;
}

function signedOutError(): ApiError {
  return new ApiError(401, "unauthorized", "Your session has ended. Please log in again.");
}

async function currentAccessToken(side: AuthSide): Promise<string> {
  if (!getSession(side)) throw signedOutError();
  const token = getAccessToken(side);
  if (isFresh(token)) return token;
  const renewed = await refreshAccessToken(side);
  if (!renewed) throw signedOutError();
  return renewed;
}

async function withAuth<T>(side: AuthSide, call: (accessToken: string) => Promise<T>): Promise<T> {
  const token = await currentAccessToken(side);
  try {
    return await call(token);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error;
    const renewed = await refreshAccessToken(side, true);
    if (!renewed) throw signedOutError();
    return call(renewed);
  }
}

export function authedRequest<T>(
  side: AuthSide,
  path: string,
  schema: ZodType<T>,
  options: Omit<RequestOptions, "accessToken"> = {},
): Promise<T> {
  return withAuth(side, (accessToken) => apiRequest(path, schema, { ...options, accessToken }));
}

export function authedRequestNoContent(
  side: AuthSide,
  path: string,
  options: Omit<RequestOptions, "accessToken"> = {},
): Promise<void> {
  return withAuth(side, (accessToken) => apiRequestNoContent(path, { ...options, accessToken }));
}
