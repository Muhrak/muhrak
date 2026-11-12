/**
 * The two sides of the web app. STRICT RULE: they are fully separate, each
 * with its own session (see session.ts). Admins use the separate admin app.
 */
export type PortalSide = "buyer" | "seller";

/** Each side's dashboard, and where its auth screens live. */
export const HOME_PATH: Record<PortalSide, string> = {
  buyer: "/buyer/dashboard",
  seller: "/seller/dashboard",
};

export const LOGIN_PATH: Record<PortalSide, string> = {
  buyer: "/buyer/login",
  seller: "/seller/login",
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
const AFTER_LOGIN_PATH: Record<PortalSide, string> = { buyer: "/", seller: "/sell" };

/**
 * Where to go after login on `side`: the page the user was sent away from
 * (`next`), if it is a path inside this site on the same side; otherwise
 * AFTER_LOGIN_PATH. Rejects `//evil.com` style values (open redirects).
 */
export function afterLoginPath(side: PortalSide, next: string | null | undefined): string {
  const home = AFTER_LOGIN_PATH[side];
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return home;
  return next.startsWith(`/${side}/`) ? next : home;
}
