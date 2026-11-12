import { NextResponse, type NextRequest } from "next/server";

/**
 * Runs before /api/* is proxied to the Muhrak API (see next.config.ts).
 *
 * The API rate-limits per client IP, but behind this proxy it would only
 * see our server's IP, so all visitors would share one limit. We pass the
 * visitor's IP in `x-muhrak-client-ip`, signed with a shared secret
 * (`API_PROXY_SECRET`, set on both Vercel and the API). The API trusts the
 * header only when the secret matches, so nobody can fake their IP by
 * calling the API directly.
 *
 * Any incoming x-muhrak-* headers from the browser are dropped first.
 */
export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  for (const name of [...headers.keys()]) {
    if (name.startsWith("x-muhrak-")) headers.delete(name);
  }

  const secret = process.env.API_PROXY_SECRET;
  const ip = clientIp(request);
  if (secret && ip) {
    headers.set("x-muhrak-client-ip", ip);
    headers.set("x-muhrak-proxy-secret", secret);
  }
  return NextResponse.next({ request: { headers } });
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
  matcher: "/api/:path*",
};
