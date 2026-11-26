import { createHash, createPublicKey, sign, verify, type KeyObject } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { canonical, ledgerKeys } from "./ledger";

export const PROVENANCE_LABEL = "IZWI signed provenance (not C2PA)" as const;
export type ProvenanceEnvelope = {
  v: 1;
  kind: "izwi-signed-provenance";
  media_sha256: string;
  output_id: string;
  project_id: string;
  created_at: number;
  declaration: { id: string; created_at: number; text: string };
  ai_use: { transcription: string; planner: string };
  consent_refs: { consent_id: string; person_label: string; ledger_seq: number; entry_hash: string }[];
  key_id: string;
};
export type SignedProvenance = { envelope: ProvenanceEnvelope; signature: string };

const sha256 = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
const keyId = (pubHex: string) => sha256(pubHex).slice(0, 16);

export function buildProvenance(input: Omit<ProvenanceEnvelope, "v" | "kind" | "key_id">, keys = ledgerKeys()) {
  const envelope: ProvenanceEnvelope = { v: 1, kind: "izwi-signed-provenance", ...input, key_id: keyId(keys.pubHex) };
  const signature = sign(null, Buffer.from(canonical(envelope)), keys.priv).toString("base64");
  return { envelope, signature } satisfies SignedProvenance;
}

export function verifyProvenance(json: string | Uint8Array, mp4Bytes: Uint8Array, trustedPubHex: string): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  let signed: SignedProvenance;
  try { signed = JSON.parse(typeof json === "string" ? json : Buffer.from(json).toString("utf8")) as SignedProvenance; }
  catch { return { ok: false, reasons: ["Sidecar is not valid JSON."] }; }
  const e = signed?.envelope;
  if (!e || e.v !== 1 || e.kind !== "izwi-signed-provenance") reasons.push("Unsupported provenance envelope.");
  if (!e || e.media_sha256 !== sha256(mp4Bytes)) reasons.push("MP4 SHA-256 does not match the signed envelope.");
  if (!trustedPubHex || !/^[0-9a-f]{64}$/i.test(trustedPubHex)) reasons.push("Trusted Ed25519 public key is invalid.");
  else if (e?.key_id !== keyId(trustedPubHex)) reasons.push("Trusted key id does not match the signed envelope.");
  try {
    const pub = createPublicKeyFromRaw(trustedPubHex);
    if (typeof signed?.signature !== "string" || !verify(null, Buffer.from(canonical(e)), pub, Buffer.from(signed.signature, "base64"))) reasons.push("Envelope signature does not verify.");
  } catch { reasons.push("Envelope signature does not verify."); }
  return { ok: reasons.length === 0, reasons };
}

function createPublicKeyFromRaw(hex: string): KeyObject {
  return createPublicKey({ key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(hex, "hex")]), format: "der", type: "spki" });
}

export function writeProvenance(sidecarPath: string, envelope: Omit<ProvenanceEnvelope, "v" | "kind" | "key_id" | "media_sha256">, mediaPath: string, keys = ledgerKeys()) {
  const signed = buildProvenance({ ...envelope, media_sha256: sha256(readFileSync(mediaPath)) }, keys);
  writeFileSync(sidecarPath, `${canonical(signed)}\n`, { encoding: "utf8", flag: "wx" });
  const result = verifyProvenance(readFileSync(sidecarPath), readFileSync(mediaPath), keys.pubHex);
  if (!result.ok) throw new Error(`Provenance verification failed: ${result.reasons.join(" ")}`);
  return { signed, publicKeyHex: keys.pubHex };
}
