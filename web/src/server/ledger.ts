// Consent ledger: every consent answer is appended as {prev_hash, sha256(record), ts} and signed with Ed25519.
// Changing or removing a past entry breaks the chain, which scripts/verify-ledger.ts and /trust can show.
// The signing key is derived from IZWI_MASTER_KEY (HKDF), so no new secret is needed; rotating the master key
// starts a new signing key, and entries keep the public key they were signed with.
import { createHash, createPrivateKey, createPublicKey, hkdfSync, sign, verify, type KeyObject } from "node:crypto";
import { all, lockKey, one, run, tx } from "./db";
import { masterKey } from "./env";

export const GENESIS = "0".repeat(64);

export type LedgerRecord = {
  consentId: string; workspaceId: string; projectId: string; personId: string;
  scope: string; decision: "granted" | "declined" | "revoked"; respondedName: string; at: number;
};
type Row = { seq: number; workspace_id: string; consent_id: string; record: string; prev_hash: string; hash: string; sig: string; ts: number };

// PKCS#8 DER for an Ed25519 private key is a fixed 16-byte prefix plus the 32-byte seed.
const PKCS8_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");

export function ledgerKeys(master: Buffer = masterKey()): { priv: KeyObject; pub: KeyObject; pubHex: string } {
  const seed = Buffer.from(hkdfSync("sha256", master, Buffer.alloc(0), "izwi consent-ledger ed25519 v1", 32));
  const priv = createPrivateKey({ key: Buffer.concat([PKCS8_PREFIX, seed]), format: "der", type: "pkcs8" });
  const pub = createPublicKey(priv);
  const pubHex = (pub.export({ format: "der", type: "spki" }) as Buffer).subarray(-32).toString("hex");
  return { priv, pub, pubHex };
}

// Stable JSON: keys in sorted order, so the same record always hashes the same.
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v as Record<string, unknown>).sort().map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(",")}}`;
  }
  return JSON.stringify(v);
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const entryHash = (prev: string, recordHash: string, ts: number) => sha256(`${prev}|${recordHash}|${ts}`);

export async function appendConsent(rec: LedgerRecord): Promise<{ seq: number; hash: string }> {
  const { priv, pubHex } = ledgerKeys();
  return tx(async () => {
    // The chain is global (one head for every workspace), so every append waits for the one before it to commit.
    await lockKey("consent-ledger");
    const head = await one<{ hash: string }>(`SELECT hash FROM consent_ledger ORDER BY seq DESC LIMIT 1`);
    const prev = head?.hash ?? GENESIS;
    const ts = Date.now();
    const record = { ...rec, key: pubHex };
    const hash = entryHash(prev, sha256(canonical(record)), ts);
    const sig = sign(null, Buffer.from(hash, "hex"), priv).toString("base64");
    const inserted = await one<{ seq: number }>(`INSERT INTO consent_ledger (workspace_id, consent_id, record, prev_hash, hash, sig, ts) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING seq`, rec.workspaceId, rec.consentId, canonical(record), prev, hash, sig, ts);
    return { seq: inserted!.seq, hash };
  });
}

export async function ledgerHead() {
  const h = await one<{ seq: number; hash: string; ts: number }>(`SELECT seq, hash, ts FROM consent_ledger ORDER BY seq DESC LIMIT 1`);
  return h ? { entries: h.seq, hash: h.hash, at: h.ts } : { entries: 0, hash: GENESIS, at: null };
}

export async function latestEntryFor(consentId: string) {
  return (await one<{ seq: number; hash: string }>(`SELECT seq, hash FROM consent_ledger WHERE consent_id = ? ORDER BY seq DESC LIMIT 1`, consentId)) ?? null;
}

// Walks the whole chain. Returns the first broken entry, or ok with the head. Signatures must come from a trusted key
// (the current one, plus earlier ones after a master-key rotation); a key written into the record alone proves nothing.
export async function verifyLedger(trusted: Set<string>, rows?: Row[]) {
  rows ??= await all<Row>(`SELECT * FROM consent_ledger ORDER BY seq`);
  let prev = GENESIS;
  for (const r of rows) {
    const record = JSON.parse(r.record) as LedgerRecord & { key: string };
    if (!trusted.has(record.key)) return { ok: false as const, seq: r.seq, reason: "signed by a key IZWI does not trust" };
    if (r.prev_hash !== prev) return { ok: false as const, seq: r.seq, reason: "prev_hash does not match the entry before it" };
    if (entryHash(prev, sha256(canonical(record)), r.ts) !== r.hash) return { ok: false as const, seq: r.seq, reason: "hash does not match the record" };
    const pub = createPublicKey({ key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(record.key, "hex")]), format: "der", type: "spki" });
    if (!verify(null, Buffer.from(r.hash, "hex"), pub, Buffer.from(r.sig, "base64"))) return { ok: false as const, seq: r.seq, reason: "signature does not verify" };
    prev = r.hash;
  }
  return { ok: true as const, entries: rows.length, head: prev };
}
