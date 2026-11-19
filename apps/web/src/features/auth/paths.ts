/**
 * The sides of the web app. STRICT RULE: they are fully separate, each with
 * its own session (see session.ts): buyer, seller and admin never share a
 * sign-in, and being signed in on one counts for nothing on another.
 *
 * `PortalSide` is the buyer and seller marketplace (sign-up, password reset,
 * Buyer and Seller Centres). `AuthSide` adds the admin console under
 * `/admin`, which has its own login and no sign-up or reset by email.
 */
export type PortalSide = "buyer" | "seller";
export type AuthSide = PortalSide | "admin";

/** Each side's dashboard, and where its auth screens live. */
export const HOME_PATH: Record<PortalSide, string> = {
  buyer: "/buyer/dashboard",
  seller: "/seller/dashboard",
};

export const LOGIN_PATH: Record<AuthSide, string> = {
  buyer: "/buyer/login",
  seller: "/seller/login",
  admin: "/admin/login",
};

export const SIGNUP_PATH: Record<PortalSide, string> = {
  buyer: "/buyer/signup",
  seller: "/seller/signup",
};

export const RESET_PATH: Record<PortalSide, string> = {
  buyer: "/buyer/reset-password",
  seller: "/seller/reset-password",
};

/**
 * Where a role lands right after logging in or signing up, when there is no
 * page to go back to (developer decision, 11 Nov 2026): buyers go to the
 * buyer landing page, sellers to the seller landing page. On both, the
 * profile button leads to the dashboard.
 */
const AFTER_LOGIN_PATH: Record<AuthSide, string> = { buyer: "/", seller: "/sell", admin: "/admin/sellers" };

/** Each side's landing page; the Muhrak logo in the Centres leads here (developer request, 17 Nov 2026). */
export const LANDING_PATH: Record<PortalSide, string> = { buyer: "/", seller: "/sell" };

/**
 * Where to go after login on `side`: the page the user was sent away from
 * (`next`), if it is a path inside this site on the same side; otherwise
 * AFTER_LOGIN_PATH. Rejects `//evil.com` style values (open redirects).
 */
export function afterLoginPath(side: AuthSide, next: string | null | undefined): string {
  const home = AFTER_LOGIN_PATH[side];
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return home;
  // Logging out on the dashboard leaves `next` pointing at it; a fresh login
  // still starts on the landing page (developer request, 17 Nov 2026).
  if (side !== "admin" && (next === HOME_PATH[side] || next.startsWith(`${HOME_PATH[side]}?`))) return home;
  if (next.startsWith(`/${side}/`)) return next;
  // A buyer sent to login from the public part search, Muhrak AI or a seller's page goes back to it
  // (and its photo result or open quote form, kept in the query).
  if (side === "buyer" && /^\/(search|ai|sellers\/[0-9a-f-]{36})(\?|$)/i.test(next)) return next;
  return home;
}
