import type { AuthResponse, PublicUser } from "@muhrak/schemas";

/**
 * Minimal session store for Day 1: keeps the tokens in localStorage so a
 * user stays signed in after sign-up or login.
 *
 * Day 2 replaces this with proper session handling (auto-refresh of the
 * access token, logout everywhere, role-protected routes).
 */

const STORAGE_KEY = "muhrak.session";

export interface Session {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
}

export function saveSession(auth: AuthResponse): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(auth satisfies Session));
  } catch {
    // Storage blocked (private mode): the user stays signed in for this page only.
  }
}

export function readSession(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clear.
  }
}
