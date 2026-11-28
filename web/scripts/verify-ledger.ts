// npm run verify:ledger: walk the consent ledger and check every hash link and Ed25519 signature.
// Trusts the key derived from the current IZWI_MASTER_KEY, plus any earlier public keys listed (hex, comma-separated)
// in IZWI_LEDGER_OLD_KEYS after a master-key rotation. Exits 1 on the first broken entry.
import { loadLocalEnv } from "../src/server/env";

async function main() {
  loadLocalEnv();
  const { ledgerKeys, verifyLedger } = await import("../src/server/ledger");
  const trusted = new Set([ledgerKeys().pubHex, ...(process.env.IZWI_LEDGER_OLD_KEYS ?? "").split(",").map((s) => s.trim()).filter(Boolean)]);
  const r = await verifyLedger(trusted);
  if (!r.ok) {
    console.error(`ledger  BROKEN at entry ${r.seq}: ${r.reason}`);
    process.exit(1);
  }
  console.log(`ledger  ok · ${r.entries} entries · head ${r.head}`);
  console.log(`key     ${ledgerKeys().pubHex}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
