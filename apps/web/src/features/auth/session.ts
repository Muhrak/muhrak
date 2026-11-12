import { authResponseSchema, type AuthResponse, type PublicUser } from "@muhrak/schemas";
import { useCallback, useSyncExternalStore } from "react";
import type { PortalSide } from "./paths";

/**
 * The signed-in sessions, kept in localStorage so they survive reloads and
 * are shared by every open tab. Tabs stay in sync through the `storage`
 * event: logging out (or refreshing tokens) in one tab updates the others.
 *
 * STRICT RULE: buyer and seller are fully separate. Each side has its own
 * session under its own key, and a session is only ever stored on the side
 * matching its user's role. Nothing on the buyer side reads the seller
 * session, or the other way round; logging out on one side leaves the other
 * alone. Every function here takes the side explicitly.
 *
 * Tokens are readable by page scripts. That is acceptable for the market
 * test; the API is on another domain, so httpOnly cookies would need a
 * same-site API domain first.
 */

const STORAGE_KEY: Record<PortalSide, string> = {
  buyer: "muhrak.session.buyer",
  seller: "muhrak.session.seller",
};

/** Before 12 Nov 2026 one session was shared by both sides. It is dropped (the user logs in again). */
const LEGACY_KEY = "muhrak.session";

export type Session = AuthResponse;

type Listener = () => void;

type SideState = {
  listeners: Set<Listener>;
  /** Parsed value of the last raw string we saw, so snapshots stay referentially stable. */
  cachedRaw: string | null | undefined;
  cachedSession: Session | null;
  /** Used only when localStorage is blocked (private mode): the session lives in this tab's memory. */
  memoryRaw: string | null;
};

const state: Record<PortalSide, SideState> = {
  buyer: { listeners: new Set(), cachedRaw: undefined, cachedSession: null, memoryRaw: null },
  seller: { listeners: new Set(), cachedRaw: undefined, cachedSession: null, memoryRaw: null },
};

let legacyDropped = false;
function dropLegacySession() {
  if (legacyDropped) return;
  legacyDropped = true;
  try {
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    // Storage blocked: nothing to drop.
  }
}

function readRaw(side: PortalSide): string | null {
  dropLegacySession();
  try {
    return localStorage.getItem(STORAGE_KEY[side]);
  } catch {
    return state[side].memoryRaw;
  }
}

function parse(side: PortalSide, raw: string | null): Session | null {
  if (!raw) return null;
  try {
    const result = authResponseSchema.safeParse(JSON.parse(raw));
    // A session whose user belongs to the other side is never valid here.
    return result.success && result.data.user.role === side ? result.data : null;
  } catch {
    return null;
  }
}

/** Current session for `side`, read from storage (another tab may have changed it). */
export function getSession(side: PortalSide): Session | null {
  const s = state[side];
  const raw = readRaw(side);
  if (raw !== s.cachedRaw) {
    s.cachedRaw = raw;
    s.cachedSession = parse(side, raw);
  }
  return s.cachedSession;
}

function notify(side: PortalSide) {
  for (const listener of state[side].listeners) listener();
}

/** Store a session on `side`. Refuses a session whose user is not on that side. */
export function saveSession(side: PortalSide, session: Session): void {
  if (session.user.role !== side) {
    throw new Error(`A ${session.user.role} session cannot be stored on the ${side} side.`);
  }
  const raw = JSON.stringify(session);
  try {
    localStorage.setItem(STORAGE_KEY[side], raw);
  } catch {
    state[side].memoryRaw = raw;
  }
  notify(side);
}

export function clearSession(side: PortalSide): void {
  try {
    localStorage.removeItem(STORAGE_KEY[side]);
  } catch {
    // Nothing stored.
  }
  state[side].memoryRaw = null;
  notify(side);
}

/** Keep the stored user up to date after GET /me, without touching the tokens. */
export function updateSessionUser(side: PortalSide, user: PublicUser): void {
  const current = getSession(side);
  if (!current || JSON.stringify(current.user) === JSON.stringify(user)) return;
  if (user.role !== side) {
    // The account no longer belongs on this side: sign this side out.
    clearSession(side);
    return;
  }
  saveSession(side, { ...current, user });
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
 * The session for `side` in a component. Only use inside a browser-only
 * subtree (`use(browser())`): on the server there is no storage, so it is
 * null there.
 */
export function useSession(side: PortalSide): Session | null {
  const subscribeSide = useCallback((listener: Listener) => subscribe(side, listener), [side]);
  const getSide = useCallback(() => getSession(side), [side]);
  return useSyncExternalStore(subscribeSide, getSide, () => null);
}
