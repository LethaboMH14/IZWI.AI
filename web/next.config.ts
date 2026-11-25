import type { NextConfig } from "next";
import { baseHeaders, servedOverHttps } from "./src/server/headers";

const nextConfig: NextConfig = {
  // Pin the project root: a stray lockfile in the user folder otherwise makes Turbopack watch far too much.
  turbopack: { root: process.cwd() },
  // Pages get their headers (and a CSP nonce) in src/proxy.ts. API routes skip the proxy, so they get them here.
  async headers() {
    const h = baseHeaders({ https: servedOverHttps() });
    return [
      {
        source: "/api/:path*",
        headers: [...Object.entries(h).map(([key, value]) => ({ key, value })), { key: "Content-Security-Policy", value: "default-src 'none'; frame-ancestors 'none'" }],
      },
    ];
  },
};

export default nextConfig;
