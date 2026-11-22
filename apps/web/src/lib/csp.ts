/**
 * Content Security Policy, built per request in `src/proxy.ts` (22 Nov
 * 2026; it used to be one fixed header in next.config.ts).
 *
 * Scripts: only those carrying this request's random nonce run
 * ('strict-dynamic' lets them load the app's own chunks). Next.js adds the
 * nonce to its own scripts by reading it from this header, so there is no
 * 'unsafe-inline' for scripts any more: an injected <script> or inline
 * event handler does not run. The price: every page is rendered per
 * request (a static page cannot carry a fresh nonce).
 *
 * Styles keep 'unsafe-inline' (React style attributes need it; a nonce in
 * style-src would switch that off). Injected CSS cannot run code.
 *
 * - connect-src: scripts can only talk to this site (the API is proxied
 *   under /api), storage uploads and, on the public site, Stream Chat.
 * - frame-ancestors 'none': no clickjacking.
 * Dev only: 'unsafe-eval' (React dev tooling) and ws: (hot reload).
 */

const isDev = process.env.NODE_ENV === "development";

const STREAM_CHAT_ORIGINS = "https://chat.stream-io-api.com wss://chat.stream-io-api.com";

/**
 * The private S3 bucket: browsers upload with signed links and show logos
 * and documents from it. Only an https S3 origin is accepted.
 */
const STORAGE_ORIGIN = (() => {
  // Tolerate surrounding quotes or spaces pasted into the hosting dashboard.
  const value = process.env.STORAGE_ORIGIN?.trim().replace(/^["']|["']$/g, "").trim();
  if (!value) return "";
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && /\.s3[.-][a-z0-9-]+\.amazonaws\.com$/.test(url.hostname)) return url.origin;
  } catch {
    // Not a URL.
  }
  return "";
})();

/** 128 random bits, base64. */
export function newNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

/** `adminConsole`: the admin origin needs no chat connection. */
export function contentSecurityPolicy(nonce: string, options: { adminConsole: boolean }): string {
  const storage = STORAGE_ORIGIN ? ` ${STORAGE_ORIGIN}` : "";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob:${storage}`,
    "font-src 'self'",
    `connect-src 'self'${storage}${options.adminConsole ? "" : ` ${STREAM_CHAT_ORIGINS}`}${isDev ? " ws:" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}
