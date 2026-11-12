import { publicUserSchema, type AuthResponse, type PublicUser } from "@muhrak/schemas";
import { z } from "zod";
import { useCallback, useSyncExternalStore } from "react";
import type { PortalSide } from "./paths";

/**
 * Sign-in state for each side, kept so that no script can steal a session:
 *
 * - The refresh token is in an httpOnly cookie set by the API (one per
 *   side). JavaScript never sees it.
 * - The short-lived access token (15 min) is kept in memory only, per tab.
 *   A new tab gets its own by calling refresh (the cookie does the work).
 * - localStorage holds only a "signed in as" note per side: the public user
 *   (name, email, role). It lets pages render at once and keeps tabs in sync
 *   (the `storage` event): logging out in one tab signs out the others.
 *   It grants nothing; the API decides from the cookie and the token.
 *
 * STRICT RULE: buyer and seller are fully separate. Each side has its own
 * note, cookie and access token; every function takes the side.
 */

const STORAGE_KEY: Record<PortalSide, string> = {
  buyer: "muhrak.signedIn.buyer",
  seller: "muhrak.signedIn.seller",
};

/** Older keys held tokens in localStorage. Removed on first load. */
const LEGACY_KEYS = ["muhrak.session", "muhrak.session.buyer", "muhrak.session.seller"];

const storedSchema = z.object({ user: publicUserSchema });

/** What a component sees: who is signed in on this side. */
export type Session = { user: PublicUser };

type Listener = () => void;

type SideState = {
  listeners: Set<Listener>;
  /** Parsed value of the last raw string we saw, so snapshots stay referentially stable. */
  cachedRaw: string | null | undefined;
  cachedSession: Session | null;
  /** Used only when localStorage is blocked (private mode). */
  memoryRaw: string | null;
  /** The access token, in memory only. */
  accessToken: string | null;
};

const newState = (): SideState => ({
  listeners: new Set(),
  cachedRaw: undefined,
  cachedSession: null,
  memoryRaw: null,
  accessToken: null,
});
const state: Record<PortalSide, SideState> = { buyer: newState(), seller: newState() };

let legacyDropped = false;
function dropLegacyKeys() {
  if (legacyDropped) return;
  legacyDropped = true;
  try {
    for (const key of LEGACY_KEYS) localStorage.removeItem(key);
  } catch {
    // Storage blocked: nothing to drop.
  }
}

function readRaw(side: PortalSide): string | null {
  dropLegacyKeys();
  try {
    return localStorage.getItem(STORAGE_KEY[side]);
  } catch {
    return state[side].memoryRaw;
  }
}

function parse(side: PortalSide, raw: string | null): Session | null {
  if (!raw) return null;
  try {
    const result = storedSchema.safeParse(JSON.parse(raw));
    // A user from the other side is never valid here.
    return result.success && result.data.user.role === side ? { user: result.data.user } : null;
  } catch {
    return null;
  }
}

/** Who is signed in on `side`, read from storage (another tab may have changed it). */
export function getSession(side: PortalSide): Session | null {
  const s = state[side];
  const raw = readRaw(side);
  if (raw !== s.cachedRaw) {
    const previous = s.cachedSession;
    s.cachedRaw = raw;
    s.cachedSession = parse(side, raw);
    // Signed out, or a different user signed in from another tab: this tab's token is no longer theirs.
    if (!s.cachedSession || (previous && previous.user.id !== s.cachedSession.user.id)) {
      s.accessToken = null;
    }
  }
  return s.cachedSession;
}

export function getAccessToken(side: PortalSide): string | null {
  return getSession(side) ? state[side].accessToken : null;
}

function notify(side: PortalSide) {
  for (const listener of state[side].listeners) listener();
}

function writeNote(side: PortalSide, user: PublicUser) {
  const raw = JSON.stringify({ user });
  try {
    localStorage.setItem(STORAGE_KEY[side], raw);
  } catch {
    state[side].memoryRaw = raw;
  }
}

/** After login, sign-up or refresh on `side`. Refuses a user who is not on that side. */
export function saveSession(side: PortalSide, response: AuthResponse): void {
  if (response.user.role !== side) {
    throw new Error(`A ${response.user.role} session cannot be stored on the ${side} side.`);
  }
  writeNote(side, response.user);
  getSession(side); // Re-read the note first, so the user-change check above sees the new user...
  state[side].accessToken = response.accessToken; // ...then keep the token.
  notify(side);
}

export function clearSession(side: PortalSide): void {
  try {
    localStorage.removeItem(STORAGE_KEY[side]);
  } catch {
    // Nothing stored.
  }
  state[side].memoryRaw = null;
  state[side].accessToken = null;
  notify(side);
}

/** Keep the stored user up to date after GET /me, without touching the token. */
export function updateSessionUser(side: PortalSide, user: PublicUser): void {
  const current = getSession(side);
  if (!current || JSON.stringify(current.user) === JSON.stringify(user)) return;
  if (user.role !== side || user.id !== current.user.id) {
    clearSession(side);
    return;
  }
  writeNote(side, user);
  notify(side);
}

function subscribe(side: PortalSide, listener: Listener): () => void {
  state[side].listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY[side] || event.key === null) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    state[side].listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * Who is signed in on `side`, in a component. Only use inside a
 * browser-only subtree (`use(browser())`): on the server it is null.
 */
export function useSession(side: PortalSide): Session | null {
  const subscribeSide = useCallback((listener: Listener) => subscribe(side, listener), [side]);
  const getSide = useCallback(() => getSession(side), [side]);
  return useSyncExternalStore(subscribeSide, getSide, () => null);
}
