import type { Role } from "@muhrak/schemas";

/** Where each role lands after login, and where its auth screens live. */
export const HOME_PATH: Record<Role, string> = {
  buyer: "/buyer/dashboard",
  seller: "/seller/dashboard",
  // The admin app is separate (Day 4); until then admins land on the home page.
  admin: "/",
};

export type PortalSide = "buyer" | "seller";

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

export function loginPathFor(role: Role): string {
  return role === "seller" ? LOGIN_PATH.seller : LOGIN_PATH.buyer;
}

/**
 * Where to go after login: the page the user was sent away from (`next`),
 * if it is a path inside this site that belongs to their role; otherwise
 * their dashboard. Rejects `//evil.com` style values (open redirects).
 */
export function afterLoginPath(role: Role, next: string | null | undefined): string {
  const home = HOME_PATH[role];
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return home;
  const ownArea = role === "admin" ? null : `/${role}/`;
  return ownArea && next.startsWith(ownArea) ? next : home;
}
