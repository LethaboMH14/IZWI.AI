// Page requests only: a fresh CSP nonce per request plus the security headers. API routes, static files and
// prefetches are excluded by the matcher, because the proxy would buffer bodies (tus sends 8 MB chunks) and
// /api sets its own headers in next.config.ts and in the media route.
import { NextResponse, type NextRequest } from "next/server";
import { baseHeaders, cspFor, cspHeaderName, servedOverHttps } from "./server/headers";

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = cspFor(nonce, { dev: process.env.NODE_ENV === "development", path: request.nextUrl.pathname });
  const name = cspHeaderName();

  // Next reads the nonce from this request header and stamps it on its own scripts.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set(name, csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set(name, csp);
  for (const [k, v] of Object.entries(baseHeaders({ https: servedOverHttps() }))) response.headers.set(k, v);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico|img/|video/).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
