// Private media storage on local disk, outside the web root. Files are only served through checked routes.
// Swap path: an S3-compatible store (MinIO, Supabase Storage, R2) behind the same functions.
import { createHash } from "node:crypto";
import { createReadStream, mkdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { STORAGE } from "./env";

export function storageKey(workspaceId: string, projectId: string, name: string) {
  return `${workspaceId}/${projectId}/${name}`;
}

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

export function removeProjectFiles(workspaceId: string, projectId: string) {
  rmSync(absPath(`${workspaceId}/${projectId}/x`).replace(/[\\/]x$/, ""), { recursive: true, force: true });
}

const safeName = (n: string) => n.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "file";

export function streamFile(req: Request, file: string, mime: string, opts: { download?: string; cache?: string } = {}): Response {
  const size = statSync(file).size;
  const headers = new Headers({
    "Content-Type": mime,
    "Accept-Ranges": "bytes",
    "Cache-Control": opts.cache ?? "private, max-age=3600",
    "X-Content-Type-Options": "nosniff",
  });
  if (opts.download) headers.set("Content-Disposition", `attachment; filename="${safeName(opts.download)}"`);
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
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    }
    end = Math.min(end, size - 1);
    headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
    headers.set("Content-Length", String(end - start + 1));
    return new Response(Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream, { status: 206, headers });
  }
  headers.set("Content-Length", String(size));
  return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream, { status: 200, headers });
}
