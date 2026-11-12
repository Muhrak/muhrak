import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

/**
 * Where /api/* is proxied to (server side; never sent to the browser).
 * NEXT_PUBLIC_API_URL is the older name, still read so existing deploy
 * settings keep working.
 */
const API_ORIGIN = (process.env.API_ORIGIN ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/+$/, "");

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
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `connect-src 'self'${isDev ? " ws:" : ""}`,
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
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  // Shared Zod schemas are TypeScript source; Next compiles them for us.
  transpilePackages: ["@muhrak/schemas"],
  experimental: {
    // Integrity hashes on every script tag: a tampered or swapped file will not run.
    sri: { algorithm: "sha256" },
  },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_ORIGIN}/:path*` }];
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
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
