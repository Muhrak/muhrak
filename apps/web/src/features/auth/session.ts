import { authResponseSchema, type AuthResponse, type PublicUser } from "@muhrak/schemas";
import { useSyncExternalStore } from "react";

/**
 * The signed-in session, kept in localStorage so it survives reloads and is
 * shared by every open tab. Tabs stay in sync through the `storage` event:
 * logging out (or refreshing tokens) in one tab updates all the others.
 *
 * Tokens are readable by page scripts. That is acceptable for the market
 * test; the API is on another domain, so httpOnly cookies would need a
 * same-site API domain first.
 */

const STORAGE_KEY = "muhrak.session";

export type Session = AuthResponse;

type Listener = () => void;
const listeners = new Set<Listener>();

/** Parsed value of the last raw string we saw, so snapshots stay referentially stable. */
let cachedRaw: string | null | undefined;
let cachedSession: Session | null = null;

function readRaw(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function parse(raw: string | null): Session | null {
  if (!raw) return null;
  try {
    const result = authResponseSchema.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

/** Current session, read from storage (another tab may have changed it). */
export function getSession(): Session | null {
  const raw = readRaw();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedSession = parse(raw);
  }
  return cachedSession;
}

function notify() {
  for (const listener of listeners) listener();
}

export function saveSession(session: Session): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Storage blocked (private mode). Keep it in memory for this tab.
    cachedRaw = JSON.stringify(session);
    cachedSession = session;
  }
  notify();
}

export function clearSession(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing stored.
  }
  cachedRaw = null;
  cachedSession = null;
  notify();
}

/** Keep the stored user up to date after GET /me, without touching the tokens. */
export function updateSessionUser(user: PublicUser): void {
  const current = getSession();
  if (!current || JSON.stringify(current.user) === JSON.stringify(user)) return;
  saveSession({ ...current, user });
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * The session in a component. Only use inside a browser-only subtree
 * (`use(browser())`): on the server there is no storage, so it is null there.
 */
export function useSession(): Session | null {
  return useSyncExternalStore(subscribe, getSession, () => null);
}
