import { NextResponse, type NextRequest } from "next/server";
import { contentSecurityPolicy, newNonce } from "@/lib/csp";

/**
 * Runs before every request (except built static files).
 *
 * 1. Admin console on its own host (22 Nov 2026). With `ADMIN_HOST` set
 *    (e.g. `muhrak-admin.vercel.app`), /admin pages are served only there
 *    and that host serves nothing else. The admin session (its cookie and
 *    token) then lives on an origin of its own, so a script injected into
 *    any public page cannot reach it. The API enforces the same split
 *    (`ADMIN_WEB_ORIGIN`). Unset locally: one host for everything.
 *
 * 2. A fresh CSP nonce for every page (see `lib/csp.ts`).
 *
 * 3. Before /api/* is proxied to the Muhrak API (next.config.ts): the API
 *    rate-limits per client IP, but behind this proxy it would only see our
 *    server's IP, so all visitors would share one limit. We pass the
 *    visitor's IP in `x-muhrak-client-ip`, signed with a shared secret
 *    (`API_PROXY_SECRET`, set on both Vercel and the API). The API trusts
 *    the header only when the secret matches. Any incoming x-muhrak-*
 *    headers from the browser are dropped first.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const adminHost = process.env.ADMIN_HOST?.trim().toLowerCase() || null;
  const host = request.headers.get("host")?.toLowerCase() ?? "";
  const onAdminHost = adminHost !== null && host === adminHost;
  const isAdminPage = pathname === "/admin" || pathname.startsWith("/admin/");
  const isApi = pathname === "/api" || pathname.startsWith("/api/");

  if (adminHost) {
    if (onAdminHost && !isAdminPage && !isApi && !isPublicFile(pathname)) {
      return NextResponse.redirect(new URL("/admin", request.url));
    }
    if (!onAdminHost && isAdminPage) {
      return NextResponse.redirect(new URL(`${pathname}${search}`, `${request.nextUrl.protocol}//${adminHost}`));
    }
    // The admin API is for the admin host only.
    if (!onAdminHost && (pathname === "/api/v1/admin" || pathname.startsWith("/api/v1/admin/"))) {
      return NextResponse.json({ error: { code: "not_found", message: "Not found" } }, { status: 404 });
    }
  }

  const headers = new Headers(request.headers);
  for (const name of [...headers.keys()]) {
    if (name.startsWith("x-muhrak-")) headers.delete(name);
  }

  if (isApi) {
    const secret = process.env.API_PROXY_SECRET;
    const ip = clientIp(request);
    if (secret && ip) {
      headers.set("x-muhrak-client-ip", ip);
      headers.set("x-muhrak-proxy-secret", secret);
    }
    return NextResponse.next({ request: { headers } });
  }

  // Pages: Next.js reads the nonce from the request's CSP header and puts it on its scripts.
  const nonce = newNonce();
  const csp = contentSecurityPolicy(nonce, { adminConsole: onAdminHost });
  headers.set("x-nonce", nonce);
  headers.set("content-security-policy", csp);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

/** Files from /public (logos, icons) load on both hosts. */
function isPublicFile(pathname: string): boolean {
  return /\.(svg|png|jpe?g|webp|ico|txt|xml|webmanifest|woff2?)$/i.test(pathname);
}

/**
 * The visitor's IP. Only on Vercel, where `x-real-ip` is set by Vercel's
 * edge and cannot be supplied by the client. Elsewhere (local dev) we send
 * nothing and the API uses the connection's IP.
 */
function clientIp(request: NextRequest): string | null {
  if (!process.env.VERCEL) return null;
  const value = request.headers.get("x-real-ip")?.trim();
  return value && /^[0-9a-fA-F:.]{3,45}$/.test(value) ? value : null;
}

export const config = {
  // Everything but the built static files and image optimiser.
  matcher: "/((?!_next/static|_next/image).*)",
};
