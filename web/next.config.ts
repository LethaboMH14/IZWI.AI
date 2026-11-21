import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the project root: a stray lockfile in the user folder otherwise makes Turbopack watch far too much.
  turbopack: { root: process.cwd() },
};

export default nextConfig;
