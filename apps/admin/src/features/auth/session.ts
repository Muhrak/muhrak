import { authResponseSchema, publicUserSchema, type AuthResponse, type PublicUser } from "@muhrak/schemas";
import { useSyncExternalStore } from "react";
import { z } from "zod";
import { ApiError, apiRequest } from "@/lib/api";

/**
 * Admin sign-in, built like the buyer and seller sessions (apps/web):
 * - the refresh token is in an httpOnly cookie (`muhrak_rt_admin`, set by
 *   the API through this site's /api proxy); scripts never see it;
 * - the access token is kept in memory only, per tab;
 * - localStorage holds only a "signed in as" note (the public user), which
 *   grants nothing and keeps tabs in sync.
 * Only an `admin` user is ever accepted here.
 */

const STORAGE_KEY = "muhrak.signedIn.admin";
const LOCK_NAME = "muhrak-auth-refresh-admin";
const EXPIRY_MARGIN_MS = 30_000;
const storedSchema = z.object({ user: publicUserSchema });

export type Session = { user: PublicUser };

const listeners = new Set<() => void>();
let cachedRaw: string | null | undefined;
let cachedSession: Session | null = null;
let memoryRaw: string | null = null;
let accessToken: string | null = null;
let inFlight: Promise<string | null> | null = null;

function readRaw(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return memoryRaw;
  }
}

export function getSession(): Session | null {
  const raw = readRaw();
  if (raw !== cachedRaw) {
    const previous = cachedSession;
    cachedRaw = raw;
    try {
      const parsed = raw ? storedSchema.safeParse(JSON.parse(raw)) : null;
      cachedSession = parsed?.success && parsed.data.user.role === "admin" ? { user: parsed.data.user } : null;
    } catch {
      cachedSession = null;
    }
    if (!cachedSession || (previous && previous.user.id !== cachedSession.user.id)) accessToken = null;
  }
  return cachedSession;
}

function notify() {
  for (const listener of listeners) listener();
}

export function saveSession(response: AuthResponse): void {
  if (response.user.role !== "admin") throw new Error("Only admin accounts can sign in here.");
  const raw = JSON.stringify({ user: response.user });
  try {
    localStorage.setItem(STORAGE_KEY, raw);
  } catch {
    memoryRaw = raw;
  }
  getSession();
  accessToken = response.accessToken;
  notify();
}

export function clearSession(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing stored.
  }
  memoryRaw = null;
  accessToken = null;
  notify();
}

export function useSession(): Session | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      const onStorage = (event: StorageEvent) => {
        if (event.key === STORAGE_KEY || event.key === null) listener();
      };
      window.addEventListener("storage", onStorage);
      return () => {
        listeners.delete(listener);
        window.removeEventListener("storage", onStorage);
      };
    },
    getSession,
    () => null,
  );
}

function expiresAt(token: string): number {
  try {
    const payload = token.split(".")[1] ?? "";
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))) as { exp?: unknown };
    return typeof json.exp === "number" ? json.exp * 1000 : 0;
  } catch {
    return 0;
  }
}

const isFresh = (token: string | null): token is string => token !== null && expiresAt(token) - Date.now() >= EXPIRY_MARGIN_MS;

/** A new access token from the refresh cookie; null (and signed out) if the cookie is no longer valid. */
export function refreshAccessToken(force = false): Promise<string | null> {
  if (inFlight) return inFlight;
  const run = async () => {
    if (!getSession()) return null;
    if (!force && isFresh(accessToken)) return accessToken;
    try {
      const next = await apiRequest("/v1/auth/refresh", authResponseSchema, { method: "POST", body: { role: "admin" } });
      saveSession(next);
      return next.accessToken;
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        clearSession();
        return null;
      }
      throw error;
    }
  };
  // Refresh tokens are single use: one refresh at a time across all tabs.
  const locked = (async (): Promise<string | null> =>
    typeof navigator !== "undefined" && navigator.locks ? await navigator.locks.request(LOCK_NAME, run) : await run())();
  const started = locked.finally(() => {
    inFlight = null;
  });
  inFlight = started;
  return started;
}

export async function currentAccessToken(): Promise<string> {
  if (!getSession()) throw new ApiError(401, "unauthorized", "Your session has ended. Please log in again.");
  if (isFresh(accessToken)) return accessToken;
  const renewed = await refreshAccessToken();
  if (!renewed) throw new ApiError(401, "unauthorized", "Your session has ended. Please log in again.");
  return renewed;
}
