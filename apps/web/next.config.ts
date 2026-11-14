import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

/**
 * Where /api/* is proxied to (server side; never sent to the browser).
 * NEXT_PUBLIC_API_URL is the older name, still read so existing deploy
 * settings keep working.
 */
const API_ORIGIN = (process.env.API_ORIGIN ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/+$/, "");

/**
 * The private S3 bucket. Browsers upload files straight to it with signed
 * links, and show logos from it (admins also open seller documents from
 * it), so the CSP allows exactly this one origin.
 * Only an https S3 origin is accepted; anything else is ignored.
 */
const STORAGE_ORIGIN = (() => {
  // Tolerate surrounding quotes or spaces pasted into the hosting dashboard.
  const value = process.env.STORAGE_ORIGIN?.trim().replace(/^["']|["']$/g, "").trim();
  // Printed in the build log so a missing or refused value is easy to spot.
  const report = (message: string) => console.log(`[muhrak] STORAGE_ORIGIN: ${message}`);
  if (!value) {
    report("not set. File uploads will be blocked by the CSP.");
    return "";
  }
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && /\.s3[.-][a-z0-9-]+\.amazonaws\.com$/.test(url.hostname)) {
      report(`allowed ${url.origin}`);
      return url.origin;
    }
  } catch {
    // Not a URL; reported below.
  }
  report("refused (must be https://<bucket>.s3.<region>.amazonaws.com). File uploads will be blocked by the CSP.");
  return "";
})();

/**
 * Content Security Policy. The site loads nothing from other origins, so
 * everything is 'self'. Script files also carry build-time integrity
 * hashes (SRI, below).
 * - connect-src 'self': scripts can only talk to this site (the API is
 *   proxied under /api), so injected code has nowhere to send data.
 * - frame-ancestors 'none': no clickjacking.
 * Dev only: 'unsafe-eval' (React dev tooling) and ws: (hot reload).
 */
const csp = [
  "default-src 'self'",
  // 'unsafe-inline' is needed: Next.js streams page data in inline <script>
  // tags. A nonce would remove it but forces every page to render per
  // request (no static pages); see PROGRESS.md. Mitigations: React escapes
  // all output, `react/no-danger` is an ESLint error, and connect-src below
  // keeps injected code from sending data anywhere but this site.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob:${STORAGE_ORIGIN ? ` ${STORAGE_ORIGIN}` : ""}`,
  "font-src 'self'",
  `connect-src 'self'${STORAGE_ORIGIN ? ` ${STORAGE_ORIGIN}` : ""}${isDev ? " ws:" : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
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
  cacheComponents: true,
  partialPrefetching: true,
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
