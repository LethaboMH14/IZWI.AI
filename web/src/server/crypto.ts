// Provider keys are sealed with AES-256-GCM before they touch the database. Share links store only a hash.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { masterKey } from "./env";

export function seal(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", masterKey(), iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), ct.toString("base64url")].join(".");
}

export function unseal(sealed: string): string {
  const [v, iv, tag, ct] = sealed.split(".");
  if (v !== "v1" || !iv || !tag || !ct) throw new Error("Unknown key format");
  const d = createDecipheriv("aes-256-gcm", masterKey(), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(ct, "base64url")), d.final()]).toString("utf8");
}

export const newToken = () => randomBytes(24).toString("base64url");
export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");
export const keyHint = (key: string) => (key.length > 10 ? `…${key.slice(-4)}` : "set");
