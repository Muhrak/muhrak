import { authResponseSchema } from "@muhrak/schemas";
import type { ZodType } from "zod";
import { ApiError, apiRequest, apiRequestNoContent, type RequestOptions } from "@/lib/api";
import { clearSession, getSession, saveSession, type Session } from "./session";

/**
 * Requests made as the signed-in user. Every feature that calls a protected
 * endpoint goes through `authedRequest`, which:
 *
 * 1. refreshes the access token shortly before it expires,
 * 2. on a 401, refreshes once and retries the request,
 * 3. if the refresh token is no longer valid, clears the session; the route
 *    guard then sends the user to the login page.
 *
 * Refresh tokens are single use, and the API signs out every session when a
 * used one is presented again. So only one refresh may run at a time, across
 * ALL tabs: a Web Lock serialises them, and inside the lock we re-read the
 * stored session in case another tab already refreshed.
 */

/** Refresh when the access token has less than this long left. */
const EXPIRY_MARGIN_MS = 30_000;
const LOCK_NAME = "muhrak-auth-refresh";

let inFlight: Promise<Session | null> | null = null;

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

function isExpiring(session: Session, now = Date.now()): boolean {
  return accessTokenExpiresAt(session.accessToken) - now < EXPIRY_MARGIN_MS;
}

async function withRefreshLock<T>(task: () => Promise<T>): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.locks) {
    return navigator.locks.request(LOCK_NAME, task);
  }
  return task();
}

/**
 * Exchange the refresh token for a new pair. `stale` is the session the
 * caller was using; if storage already holds a different one, another tab
 * refreshed first and we use that instead of spending a token twice.
 */
export function refreshSession(stale: Session): Promise<Session | null> {
  inFlight ??= withRefreshLock(async () => {
    const current = getSession();
    if (!current) return null;
    if (current.refreshToken !== stale.refreshToken && !isExpiring(current)) return current;
    try {
      const next = await apiRequest("/v1/auth/refresh", authResponseSchema, {
        method: "POST",
        body: { refreshToken: current.refreshToken },
      });
      saveSession(next);
      return next;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        clearSession();
        return null;
      }
      throw error; // Network trouble: keep the session and let the caller retry.
    }
  }).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

function signedOutError(): ApiError {
  return new ApiError(401, "unauthorized", "Your session has ended. Please log in again.");
}

async function currentSession(): Promise<Session> {
  let session = getSession();
  if (!session) throw signedOutError();
  if (isExpiring(session)) {
    session = await refreshSession(session);
    if (!session) throw signedOutError();
  }
  return session;
}

async function withAuth<T>(call: (accessToken: string) => Promise<T>): Promise<T> {
  const session = await currentSession();
  try {
    return await call(session.accessToken);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error;
    const renewed = await refreshSession(session);
    if (!renewed) throw signedOutError();
    return call(renewed.accessToken);
  }
}

export function authedRequest<T>(
  path: string,
  schema: ZodType<T>,
  options: Omit<RequestOptions, "accessToken"> = {},
): Promise<T> {
  return withAuth((accessToken) => apiRequest(path, schema, { ...options, accessToken }));
}

export function authedRequestNoContent(path: string, options: Omit<RequestOptions, "accessToken"> = {}): Promise<void> {
  return withAuth((accessToken) => apiRequestNoContent(path, { ...options, accessToken }));
}
