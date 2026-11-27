// Private media storage. Two backends behind one set of functions:
// - "disk" (default, local dev): files live under STORAGE and are served only through checked routes.
// - "s3" (hosted): an S3-compatible bucket (Cloudflare R2). The bucket is private; browsers only ever get short-lived
//   presigned URLs that our routes sign after the same access checks. The worker keeps STORAGE as a local cache:
//   localCopy() downloads an object before ffmpeg/whisper read it, persist() uploads a file the worker produced.
// Keys are always `${workspaceId}/${projectId}/${name}`.
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline as pump } from "node:stream/promises";
import type { S3Client } from "@aws-sdk/client-s3";
import { STORAGE } from "./env";
import { servedType, STORED_FILE_HEADERS } from "./filetype";

export const storageMode = (): "disk" | "s3" => (process.env.IZWI_STORAGE === "s3" ? "s3" : "disk");

export function storageKey(workspaceId: string, projectId: string, name: string) {
  return `${workspaceId}/${projectId}/${name}`;
}

// Local path for a key: the file itself in disk mode, the worker's cache copy in s3 mode.
export function absPath(key: string) {
  const p = path.resolve(STORAGE, key);
  if (!p.startsWith(STORAGE + path.sep)) throw new Error("Unsafe storage key");
  return p;
}

export function ensureDirFor(file: string) {
  mkdirSync(path.dirname(file), { recursive: true });
}

export function sha256File(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = createHash("sha256");
    createReadStream(file)
      .on("data", (c) => h.update(c))
      .on("end", () => resolve(h.digest("hex")))
      .on("error", reject);
  });
}

// ---------- S3 / R2 ----------
const g = globalThis as unknown as { __izwiS3?: Promise<S3Client> };
const bucket = () => {
  const b = process.env.S3_BUCKET;
  if (!b) throw new Error("S3_BUCKET is not set. See docs/engineering/DEPLOY.md.");
  return b;
};

async function s3(): Promise<S3Client> {
  g.__izwiS3 ??= (async () => {
    const { S3Client } = await import("@aws-sdk/client-s3");
    const endpoint = process.env.S3_ENDPOINT;
    const accessKeyId = process.env.S3_ACCESS_KEY_ID;
    const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
    if (!endpoint || !accessKeyId || !secretAccessKey) throw new Error("S3_ENDPOINT, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY must be set.");
    // R2 takes region "auto"; path-style keeps the bucket out of the hostname so one CSP origin covers it.
    return new S3Client({ endpoint, region: process.env.S3_REGION || "auto", forcePathStyle: true, credentials: { accessKeyId, secretAccessKey } });
  })();
  return g.__izwiS3;
}

/** The origin browsers fetch signed URLs from (for CSP). Null in disk mode. */
export function storageOrigin(): string | null {
  if (storageMode() !== "s3" || !process.env.S3_ENDPOINT) return null;
  return new URL(process.env.S3_ENDPOINT).origin;
}

/** Upload a local file to the bucket under `key` (s3 mode). In disk mode the file already sits at absPath(key). */
export async function persist(key: string, file = absPath(key), contentType = "application/octet-stream") {
  if (storageMode() !== "s3") {
    if (path.resolve(file) !== absPath(key)) throw new Error("persist() in disk mode expects the file at its key.");
    return;
  }
  const { PutObjectCommand } = await import("@aws-sdk/client-s3");
  const size = statSync(file).size;
  if (size > 4.5 * 1024 ** 3) throw new Error("File too large for a single upload.");
  await (await s3()).send(new PutObjectCommand({ Bucket: bucket(), Key: key, Body: createReadStream(file), ContentLength: size, ContentType: contentType }));
}

/** Make sure a stored object is present on local disk and return its path (worker side). */
export async function localCopy(key: string): Promise<string> {
  const file = absPath(key);
  if (storageMode() !== "s3" || existsSync(file)) return file;
  const { GetObjectCommand } = await import("@aws-sdk/client-s3");
  const r = await (await s3()).send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
  if (!r.Body) throw new Error("The stored file is empty.");
  ensureDirFor(file);
  const tmp = `${file}.part-${process.pid}`;
  try {
    await pump(r.Body as Readable, createWriteStream(tmp));
    const { renameSync } = await import("node:fs");
    renameSync(tmp, file);
  } finally {
    rmSync(tmp, { force: true });
  }
  return file;
}

/** Small text objects (peaks JSON) for the web server. */
export async function readText(key: string): Promise<string | null> {
  if (storageMode() !== "s3") {
    const f = absPath(key);
    return existsSync(f) ? readFileSync(f, "utf8") : null;
  }
  const { GetObjectCommand } = await import("@aws-sdk/client-s3");
  try {
    const r = await (await s3()).send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
    return r.Body ? await r.Body.transformToString("utf8") : null;
  } catch (e) {
    if ((e as { name?: string }).name === "NoSuchKey") return null;
    throw e;
  }
}

/** First bytes of an object, for checking an upload's real type. */
export async function readHead(key: string, n = 64): Promise<Buffer> {
  if (storageMode() !== "s3") {
    const f = absPath(key);
    const { openSync, readSync, closeSync } = await import("node:fs");
    const fd = openSync(f, "r");
    try {
      const buf = Buffer.alloc(n);
      return buf.subarray(0, readSync(fd, buf, 0, n, 0));
    } finally {
      closeSync(fd);
    }
  }
  const { GetObjectCommand } = await import("@aws-sdk/client-s3");
  const r = await (await s3()).send(new GetObjectCommand({ Bucket: bucket(), Key: key, Range: `bytes=0-${n - 1}` }));
  return Buffer.from(await r.Body!.transformToByteArray());
}

/** Size of a stored object in bytes, from the store itself (never from the client). Null if missing. */
export async function objectSize(key: string): Promise<number | null> {
  if (storageMode() !== "s3") {
    const f = absPath(key);
    return existsSync(f) ? statSync(f).size : null;
  }
  const { HeadObjectCommand } = await import("@aws-sdk/client-s3");
  try {
    const r = await (await s3()).send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
    return r.ContentLength ?? null;
  } catch (e) {
    if ((e as { name?: string; $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return null;
    throw e;
  }
}

/** Server-side move (upload staging key → final key). */
export async function moveObject(from: string, to: string) {
  if (storageMode() !== "s3") {
    const { renameSync } = await import("node:fs");
    ensureDirFor(absPath(to));
    renameSync(absPath(from), absPath(to));
    return;
  }
  const { CopyObjectCommand, DeleteObjectCommand } = await import("@aws-sdk/client-s3");
  const c = await s3();
  await c.send(new CopyObjectCommand({ Bucket: bucket(), Key: to, CopySource: `${bucket()}/${from.split("/").map(encodeURIComponent).join("/")}` }));
  await c.send(new DeleteObjectCommand({ Bucket: bucket(), Key: from }));
}

export async function removeObject(key: string) {
  rmSync(absPath(key), { force: true });
  if (storageMode() !== "s3") return;
  const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
  await (await s3()).send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}

export async function removeProjectFiles(workspaceId: string, projectId: string) {
  const prefix = `${workspaceId}/${projectId}/`;
  rmSync(absPath(`${prefix}x`).replace(/[\\/]x$/, ""), { recursive: true, force: true });
  if (storageMode() !== "s3") return;
  const { ListObjectsV2Command, DeleteObjectsCommand } = await import("@aws-sdk/client-s3");
  const c = await s3();
  let token: string | undefined;
  do {
    const page = await c.send(new ListObjectsV2Command({ Bucket: bucket(), Prefix: prefix, ContinuationToken: token }));
    const keys = (page.Contents ?? []).map((o) => ({ Key: o.Key! }));
    if (keys.length) await c.send(new DeleteObjectsCommand({ Bucket: bucket(), Delete: { Objects: keys, Quiet: true } }));
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
}

const safeName = (n: string) => n.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "file";

/** A short-lived GET URL for a private object (s3 mode). The caller has already checked access. */
export async function signedGetUrl(key: string, mime: string, opts: { download?: string; seconds?: number } = {}) {
  const { GetObjectCommand } = await import("@aws-sdk/client-s3");
  const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
  const served = servedType(mime);
  const disposition = opts.download || !served.inline ? `attachment; filename="${safeName(opts.download ?? path.basename(key))}"` : "inline";
  return getSignedUrl(await s3(), new GetObjectCommand({
    Bucket: bucket(), Key: key, ResponseContentType: served.mime, ResponseContentDisposition: disposition, ResponseCacheControl: "private, no-store",
  }), { expiresIn: opts.seconds ?? 3600 });
}

// ---------- multipart uploads (browser → bucket, signed part by part) ----------
export const PART_BYTES = 8 * 1024 ** 2; // 8 MiB parts; S3/R2 need ≥ 5 MiB for every part but the last.

export async function startMultipart(key: string, contentType: string) {
  const { CreateMultipartUploadCommand } = await import("@aws-sdk/client-s3");
  const r = await (await s3()).send(new CreateMultipartUploadCommand({ Bucket: bucket(), Key: key, ContentType: contentType }));
  if (!r.UploadId) throw new Error("The store did not start the upload.");
  return r.UploadId;
}

export async function signPart(key: string, uploadId: string, partNumber: number) {
  const { UploadPartCommand } = await import("@aws-sdk/client-s3");
  const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
  return getSignedUrl(await s3(), new UploadPartCommand({ Bucket: bucket(), Key: key, UploadId: uploadId, PartNumber: partNumber }), { expiresIn: 3600 });
}

/** Parts the store already holds: how a dropped upload resumes. */
export async function listParts(key: string, uploadId: string) {
  const { ListPartsCommand } = await import("@aws-sdk/client-s3");
  const out: { partNumber: number; etag: string; size: number }[] = [];
  let marker: string | undefined;
  do {
    const r = await (await s3()).send(new ListPartsCommand({ Bucket: bucket(), Key: key, UploadId: uploadId, PartNumberMarker: marker }));
    for (const p of r.Parts ?? []) out.push({ partNumber: p.PartNumber!, etag: p.ETag!, size: p.Size ?? 0 });
    marker = r.IsTruncated ? r.NextPartNumberMarker : undefined;
  } while (marker);
  return out;
}

/** Completes from the store's own part list, so the browser cannot splice in parts it did not upload. */
export async function completeMultipart(key: string, uploadId: string) {
  const { CompleteMultipartUploadCommand } = await import("@aws-sdk/client-s3");
  const parts = await listParts(key, uploadId);
  if (!parts.length) throw new Error("Nothing was uploaded.");
  await (await s3()).send(new CompleteMultipartUploadCommand({
    Bucket: bucket(), Key: key, UploadId: uploadId,
    MultipartUpload: { Parts: parts.sort((a, b) => a.partNumber - b.partNumber).map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })) },
  }));
  return parts.reduce((n, p) => n + p.size, 0);
}

export async function abortMultipart(key: string, uploadId: string) {
  const { AbortMultipartUploadCommand } = await import("@aws-sdk/client-s3");
  await (await s3()).send(new AbortMultipartUploadCommand({ Bucket: bucket(), Key: key, UploadId: uploadId })).catch(() => {});
}

// ---------- disk-mode streaming (local dev) ----------
export function streamFile(req: Request, file: string, mime: string, opts: { download?: string; cache?: string } = {}): Response {
  const size = statSync(file).size;
  const served = servedType(mime);
  const headers = new Headers({
    ...STORED_FILE_HEADERS,
    "Content-Type": served.mime,
    "Accept-Ranges": "bytes",
    "Cache-Control": opts.cache ?? "private, max-age=3600",
  });
  if (opts.download || !served.inline) headers.set("Content-Disposition", `attachment; filename="${safeName(opts.download ?? path.basename(file))}"`);
  const range = req.headers.get("range");
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    let start = m && m[1] ? Number(m[1]) : NaN;
    let end = m && m[2] ? Number(m[2]) : size - 1;
    if (m && !m[1] && m[2]) {
      start = Math.max(0, size - Number(m[2]));
      end = size - 1;
    }
    if (!m || Number.isNaN(start) || start > end || start >= size) {
      return new Response(null, { status: 416, headers: { ...STORED_FILE_HEADERS, "Content-Range": `bytes */${size}` } });
    }
    end = Math.min(end, size - 1);
    headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
    headers.set("Content-Length", String(end - start + 1));
    return new Response(Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream, { status: 206, headers });
  }
  headers.set("Content-Length", String(size));
  return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream, { status: 200, headers });
}
