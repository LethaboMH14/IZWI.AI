// One-time setup: local secrets, pinned media tools, database migrations.
// Every download is checked against a SHA-256 recorded here. A mismatch stops the setup.
// Usage: npm run setup          (safe to re-run; skips what is already in place)
import { createHash, randomBytes } from "node:crypto";
import { createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { unzipSync } from "fflate";

const root = process.cwd();
const tools = join(root, ".tools");

const PINS = [
  {
    // whisper.cpp CPU build for Windows x64, release tag b5454 (= v1.9.5). MIT licence.
    name: "whisper.cpp b5454 (win x64, CPU)",
    url: "https://github.com/ggml-org/whisper.cpp/releases/download/b5454/whisper-bin-x64.zip",
    sha256: "6ba69e3482d7826214f90a6a9c84ca07782aec1e1d0c6a7c30c994fd5d816ccb",
    file: join(tools, "downloads", "whisper-bin-x64.zip"),
    unzipTo: join(tools, "whisper"),
    platform: "win32",
  },
  {
    // Multilingual Whisper base model in ggml format, 148 MB. MIT licence (Whisper weights).
    name: "Whisper base model (ggml)",
    url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin",
    sha256: "60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe",
    file: join(tools, "models", "ggml-base.bin"),
  },
  {
    // Caption font for burned-in subtitles. SIL Open Font Licence 1.1.
    name: "Archivo Black (caption font)",
    url: "https://github.com/google/fonts/raw/main/ofl/archivoblack/ArchivoBlack-Regular.ttf",
    sha256: "dd9a89a019b4849f66ab75455fe7bdf931311042cbb0f0f97acc061539703180",
    file: join(tools, "fonts", "ArchivoBlack-Regular.ttf"),
  },
];

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

async function fetchPinned(pin) {
  if (pin.platform && pin.platform !== process.platform) {
    console.log(`skip  ${pin.name}: built for ${pin.platform}. On this platform, install it with your package manager.`);
    return false;
  }
  if (existsSync(pin.file) && (pin.sha256 === "PIN_ON_FIRST_DOWNLOAD" || sha256File(pin.file) === pin.sha256)) {
    console.log(`ok    ${pin.name} (already present)`);
    return true;
  }
  mkdirSync(dirname(pin.file), { recursive: true });
  const tmp = pin.file + ".part";
  console.log(`get   ${pin.name}`);
  const res = await fetch(pin.url, { redirect: "follow" });
  if (!res.ok || !res.body) throw new Error(`${pin.name}: HTTP ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(tmp));
  const got = sha256File(tmp);
  if (pin.sha256 === "PIN_ON_FIRST_DOWNLOAD") {
    console.log(`note  ${pin.name}: first download, sha256 ${got}. Pin it in scripts/setup.mjs.`);
  } else if (got !== pin.sha256) {
    rmSync(tmp, { force: true });
    throw new Error(`${pin.name}: checksum mismatch. Expected ${pin.sha256}, got ${got}. Nothing was installed.`);
  }
  renameSync(tmp, pin.file);
  console.log(`ok    ${pin.name}`);
  return true;
}

function unzip(pin) {
  if (!pin.unzipTo || !existsSync(pin.file)) return;
  const marker = join(pin.unzipTo, ".sha256");
  if (existsSync(marker) && readFileSync(marker, "utf8") === pin.sha256) return;
  rmSync(pin.unzipTo, { recursive: true, force: true });
  const files = unzipSync(readFileSync(pin.file));
  for (const [name, data] of Object.entries(files)) {
    if (name.endsWith("/")) continue;
    // Flatten the archive's top folder and refuse path traversal.
    const rel = name.split("/").slice(1).join("/") || name;
    if (rel.includes("..")) throw new Error(`Refusing unsafe path in archive: ${name}`);
    const out = join(pin.unzipTo, rel);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, data);
  }
  writeFileSync(marker, pin.sha256);
  console.log(`ok    unpacked ${pin.name}`);
}

function ensureEnv() {
  const envFile = join(root, ".env.local");
  if (existsSync(envFile)) {
    console.log("ok    .env.local exists (left unchanged)");
    return;
  }
  const secret = () => randomBytes(32).toString("base64url");
  writeFileSync(
    envFile,
    [
      "# Created by npm run setup. Local secrets: never commit this file.",
      `BETTER_AUTH_SECRET=${secret()}`,
      `IZWI_MASTER_KEY=${secret()}`,
      "BETTER_AUTH_URL=http://localhost:3187",
      "IZWI_PUBLIC_URL=http://localhost:3187",
      "",
    ].join("\n"),
    { mode: 0o600 },
  );
  console.log("ok    created .env.local with fresh secrets (values not shown)");
}

ensureEnv();
for (const pin of PINS) {
  await fetchPinned(pin);
  unzip(pin);
}
console.log("\nNext: npm run db:migrate");
