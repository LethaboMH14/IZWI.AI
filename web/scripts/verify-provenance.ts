import { existsSync, readFileSync } from "node:fs";
import { loadLocalEnv } from "../src/server/env";

async function main() {
  loadLocalEnv();
  const mediaPath = process.argv[2];
  if (!mediaPath) throw new Error("Usage: npx tsx scripts/verify-provenance.ts <render.mp4> [sidecar.json]");
  const sidecarPath = process.argv[3] || `${mediaPath}.provenance.json`;
  if (!existsSync(mediaPath) || !existsSync(sidecarPath)) throw new Error("The MP4 or its provenance sidecar was not found.");
  const [{ verifyProvenance }, { ledgerKeys }] = await Promise.all([import("../src/server/provenance"), import("../src/server/ledger")]);
  const result = verifyProvenance(readFileSync(sidecarPath), readFileSync(mediaPath), ledgerKeys().pubHex);
  if (!result.ok) {
    console.error(result.reasons.map((reason) => `FAIL ${reason}`).join("\n"));
    process.exitCode = 1;
    return;
  }
  console.log("OK IZWI signed provenance (not C2PA)");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Could not verify provenance.");
  process.exitCode = 1;
});
