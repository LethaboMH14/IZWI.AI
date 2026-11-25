// Security headers for pages (set in src/proxy.ts) and for API routes (set in next.config.ts).
// CSP ships Report-Only until IZWI_CSP_ENFORCE=1. Plan v3 §1.2: enforce by Wed 12:00, or /trust says Report-Only.
// No imports from the server modules: the proxy loads this on every page request.

// Switzer is still loaded from Fontshare by the root layout. Allowed here until it is self-hosted (Lane B), then removed.
const FONTSHARE_CSS = "https://api.fontshare.com";
const FONTSHARE_FONTS = "https://cdn.fontshare.com";

export function cspFor(nonce: string, opts: { dev: boolean; path: string }): string {
  const trust = opts.path === "/trust" || opts.path.startsWith("/trust/");
  return [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${opts.dev ? " 'unsafe-eval'" : ""}${trust ? " 'wasm-unsafe-eval'" : ""}`,
    `style-src 'self' 'unsafe-inline' ${FONTSHARE_CSS}`,
    `img-src 'self' data: blob:`,
    `media-src 'self' blob:`,
    `connect-src 'self'${opts.dev ? " ws: wss:" : ""}`,
    `font-src 'self' ${FONTSHARE_FONTS}`,
    `worker-src 'self' blob:`,
    `object-src 'none'`,
    `base-uri 'none'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
  ].join("; ");
}

export const cspEnforced = () => process.env.IZWI_CSP_ENFORCE === "1";
export const cspHeaderName = () => (cspEnforced() ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only");

// Headers every response gets, pages and API alike.
export function baseHeaders(opts: { https: boolean }): Record<string, string> {
  return {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "microphone=(self), camera=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
    "Cross-Origin-Opener-Policy": "same-origin",
    "X-Frame-Options": "DENY",
    ...(opts.https ? { "Strict-Transport-Security": "max-age=31536000; includeSubDomains" } : {}),
  };
}

export const servedOverHttps = () => (process.env.IZWI_PUBLIC_URL ?? "").startsWith("https://") && process.env.NODE_ENV === "production";
