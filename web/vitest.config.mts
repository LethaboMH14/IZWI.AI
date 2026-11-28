import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Route handlers import "@/server/…", so tests that call them need the same alias as tsconfig.
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  // Each database test file starts its own in-process Postgres (WASM). On a busy laptop that alone can pass
  // the 10 s default hook limit, which failed four suites that were otherwise green.
  test: { include: ["tests/**/*.test.ts"], hookTimeout: 60_000, testTimeout: 30_000 },
});
