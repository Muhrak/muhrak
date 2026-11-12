import { authResponseSchema } from "@muhrak/schemas";
import type { ZodType } from "zod";
import { ApiError, apiRequest, apiRequestNoContent, type RequestOptions } from "@/lib/api";
import type { PortalSide } from "./paths";
import { clearSession, getSession, saveSession, type Session } from "./session";

/**
 * Requests made as the signed-in user of one side (buyer or seller; the
 * two sessions are separate and never mixed). Every feature that calls a
 * protected endpoint goes through `authedRequest(side, ...)`, which:
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
const LOCK_NAME: Record<PortalSide, string> = {
  buyer: "muhrak-auth-refresh-buyer",
  seller: "muhrak-auth-refresh-seller",
};

const inFlight: Record<PortalSide, Promise<Session | null> | null> = { buyer: null, seller: null };

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

async function withRefreshLock<T>(side: PortalSide, task: () => Promise<T>): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.locks) {
    return navigator.locks.request(LOCK_NAME[side], task);
  }
  return task();
}

/**
 * Exchange the refresh token for a new pair. `stale` is the session the
 * caller was using; if storage already holds a different one, another tab
 * refreshed first and we use that instead of spending a token twice.
 */
export function refreshSession(side: PortalSide, stale: Session): Promise<Session | null> {
  const pending = inFlight[side];
  if (pending) return pending;
  const started = withRefreshLock(side, async () => {
    const current = getSession(side);
    if (!current) return null;
    if (current.refreshToken !== stale.refreshToken && !isExpiring(current)) return current;
    try {
      const next = await apiRequest("/v1/auth/refresh", authResponseSchema, {
        method: "POST",
        body: { refreshToken: current.refreshToken },
      });
      if (next.user.role !== side) {
        clearSession(side);
        return null;
      }
      saveSession(side, next);
      return next;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        clearSession(side);
        return null;
      }
      throw error; // Network trouble: keep the session and let the caller retry.
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

async function currentSession(side: PortalSide): Promise<Session> {
  let session = getSession(side);
  if (!session) throw signedOutError();
  if (isExpiring(session)) {
    session = await refreshSession(side, session);
    if (!session) throw signedOutError();
  }
  return session;
}

async function withAuth<T>(side: PortalSide, call: (accessToken: string) => Promise<T>): Promise<T> {
  const session = await currentSession(side);
  try {
    return await call(session.accessToken);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error;
    const renewed = await refreshSession(side, session);
    if (!renewed) throw signedOutError();
    return call(renewed.accessToken);
  }
}

export function authedRequest<T>(
  side: PortalSide,
  path: string,
  schema: ZodType<T>,
  options: Omit<RequestOptions, "accessToken"> = {},
): Promise<T> {
  return withAuth(side, (accessToken) => apiRequest(path, schema, { ...options, accessToken }));
}

export function authedRequestNoContent(
  side: PortalSide,
  path: string,
  options: Omit<RequestOptions, "accessToken"> = {},
): Promise<void> {
  return withAuth(side, (accessToken) => apiRequestNoContent(path, { ...options, accessToken }));
}
