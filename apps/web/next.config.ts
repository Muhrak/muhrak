import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

/**
 * Where /api/* is proxied to (server side; never sent to the browser).
 * NEXT_PUBLIC_API_URL is the older name, still read so existing deploy
 * settings keep working.
 */
const API_ORIGIN = (process.env.API_ORIGIN ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/+$/, "");

/**
 * The private S3 bucket's origin, allowed by the CSP (built per request in
 * src/lib/csp.ts). Checked here only to print it in the build log, so a
 * missing or refused value is easy to spot.
 */
(() => {
  const value = process.env.STORAGE_ORIGIN?.trim().replace(/^["']|["']$/g, "").trim();
  const report = (message: string) => console.log(`[muhrak] STORAGE_ORIGIN: ${message}`);
  if (!value) return report("not set. File uploads will be blocked by the CSP.");
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && /\.s3[.-][a-z0-9-]+\.amazonaws\.com$/.test(url.hostname)) return report(`allowed ${url.origin}`);
  } catch {
    // Not a URL; reported below.
  }
  report("refused (must be https://<bucket>.s3.<region>.amazonaws.com). File uploads will be blocked by the CSP.");
})();

/**
 * Security headers for every response. The Content-Security-Policy is NOT
 * here: it carries a fresh nonce per request, so src/proxy.ts sets it.
 */
const securityHeaders = [
  // HTTPS only, for two years, including subdomains.
  ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]),
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  // Never leak full URLs (e.g. password-reset tokens) to other sites.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  // No cacheComponents / partial prerendering (22 Nov 2026): pages are
  // rendered per request so each carries its own CSP nonce (src/lib/csp.ts).
  poweredByHeader: false,
  experimental: {
    // Integrity hashes on every script tag: a tampered or swapped file will not run.
    sri: { algorithm: "sha256" },
  },
  async redirects() {
    return [{ source: "/admin", destination: "/admin/sellers", permanent: false }];
  },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_ORIGIN}/:path*` }];
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // The admin console must never appear in search results.
      { source: "/admin", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
      { source: "/admin/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
