// Paths, binaries and limits. Everything configurable through environment variables, with local defaults.
import path from "node:path";
import { existsSync } from "node:fs";

export const ROOT = process.cwd();
export const STORAGE = path.resolve(process.env.IZWI_STORAGE_DIR || path.join(ROOT, "storage"));
export const TOOLS = path.join(ROOT, ".tools");
export const DB_FILE = process.env.IZWI_DB_FILE || path.join(STORAGE, "izwi.db");
export const PUBLIC_URL = (process.env.IZWI_PUBLIC_URL || "http://localhost:3187").replace(/\/$/, "");

const exe = process.platform === "win32" ? ".exe" : "";
export const BIN = {
  ffmpeg: process.env.FFMPEG_PATH || "ffmpeg",
  ffprobe: process.env.FFPROBE_PATH || "ffprobe",
  whisper: process.env.WHISPER_CLI || path.join(TOOLS, "whisper", "whisper-cli" + exe),
  whisperModel: process.env.WHISPER_MODEL || path.join(TOOLS, "models", "ggml-base.bin"),
  fonts: path.join(TOOLS, "fonts"),
  captionFont: "Archivo Black",
};

export const LIMITS = {
  uploadBytes: Number(process.env.IZWI_MAX_UPLOAD_BYTES || 4 * 1024 ** 3),
  sourceSeconds: Number(process.env.IZWI_MAX_SOURCE_SECONDS || 3 * 3600),
  linkDays: 14,
  // IZWI default reading speed for caption checks. Adjustable per workspace later; not a cited standard.
  readingCps: 17,
  whisperThreads: Number(process.env.IZWI_WHISPER_THREADS || 4),
};

export function masterKey(): Buffer {
  const raw = process.env.IZWI_MASTER_KEY;
  if (!raw) throw new Error("IZWI_MASTER_KEY is not set. Run npm run setup.");
  const key = Buffer.from(raw, "base64url");
  if (key.length !== 32) throw new Error("IZWI_MASTER_KEY must be 32 bytes, base64url encoded.");
  return key;
}

// Next.js loads .env.local by itself. The worker and scripts call this.
export function loadLocalEnv() {
  const f = path.join(ROOT, ".env.local");
  if (existsSync(f)) process.loadEnvFile(f);
}
