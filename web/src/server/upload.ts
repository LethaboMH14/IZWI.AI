// Resumable uploads. If the signal drops, the browser continues from the last confirmed byte.
// - Local dev (disk storage): the tus protocol through /api/upload, written under STORAGE/tus.
// - Hosted (s3 storage): the browser sends parts straight to the private bucket on URLs this server signs one part at a
//   time (S3 multipart), so no media passes through Vercel's 4.5 MB request limit. /api/upload/s3/* are those routes.
// Either way, only signed-in members can create or continue an upload, only into their own workspace's projects, and
// finishUpload() checks the real bytes before anything else sees the file.
import { closeSync, mkdirSync, openSync, readSync, renameSync, rmSync } from "node:fs";
import path from "node:path";
import { Server } from "@tus/server";
import { FileStore } from "@tus/file-store";
import { auth } from "./auth";
import { newId, now, one, run } from "./db";
import { LIMITS, STORAGE } from "./env";
import { enqueue } from "./jobs";
import { abortMultipart, absPath, completeMultipart, ensureDirFor, listParts, moveObject, objectSize, PART_BYTES, readHead as readStoredHead, removeObject, signPart, startMultipart, storageKey, storageMode } from "./storage";
import { audit } from "./audit";
import { checkOrigin } from "./http";
import { uploadExt, verifiedType } from "./filetype";
import { rateLimit as hit, LIMIT, RateLimitError } from "./ratelimit";

const TUS_DIR = path.join(STORAGE, "tus");
// Only the local tus path writes here; a hosted function has no lasting disk.
if (storageMode() === "disk") mkdirSync(TUS_DIR, { recursive: true });

function readHead(file: string, n = 64) {
  const fd = openSync(file, "r");
  try {
    const buf = Buffer.alloc(n);
    return buf.subarray(0, readSync(fd, buf, 0, n, 0));
  } finally {
    closeSync(fd);
  }
}

export async function caller(req: Request) {
  const s = await auth.api.getSession({ headers: req.headers });
  const ws = (s?.session as { activeOrganizationId?: string | null } | undefined)?.activeOrganizationId;
  if (!s || !ws) return null;
  const m = await one(`SELECT 1 FROM member WHERE "organizationId" = ? AND "userId" = ?`, ws, s.user.id);
  return m ? { userId: s.user.id, workspaceId: ws } : null;
}

const deny = (status_code: number, body: string) => ({ status_code, body });

export class UploadRefused extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** The checks every new upload passes, whichever protocol carries it. */
async function checkNewUpload(who: { userId: string; workspaceId: string }, projectId: string, filename: string, size?: number) {
  try {
    await hit(`upload:${who.workspaceId}:${who.userId}`, LIMIT.uploadCreate.max, LIMIT.uploadCreate.windowMs);
  } catch (e) {
    if (e instanceof RateLimitError) throw new UploadRefused(429, e.message);
    throw e;
  }
  const p = await one(`SELECT id FROM project WHERE id = ? AND workspace_id = ?`, projectId, who.workspaceId);
  if (!p) throw new UploadRefused(404, "Project not found.");
  // The browser's filetype is ignored: the extension must be on the list, and the bytes are checked when the upload ends.
  if (!filename || !uploadExt(filename)) throw new UploadRefused(415, "Choose a video or audio file (MP4, MOV, WebM, MKV, AVI, 3GP, MP3, M4A, AAC, WAV, OGG, Opus or FLAC).");
  if (size !== undefined && (!Number.isSafeInteger(size) || size <= 0)) throw new UploadRefused(400, "The file is empty.");
  if (size !== undefined && size > LIMITS.uploadBytes) throw new UploadRefused(413, "That file is larger than this workspace allows.");
}

type Session = { upload_id: string; workspace_id: string; project_id: string; user_id: string; filename: string };

/**
 * Turns finished bytes into a source asset: re-checks the project, checks the real type from the stored bytes, moves
 * the file to its final key, records the asset and queues the probe. `head` reads the first bytes, `move` relocates.
 * The byte count always comes from the store, never from the browser.
 */
async function finishUpload(s: Session, bytes: number, io: { head: () => Promise<Buffer>; move: (key: string) => Promise<void>; drop: () => Promise<void> }) {
  if (!await one(`SELECT 1 FROM project WHERE id = ? AND workspace_id = ?`, s.project_id, s.workspace_id)) {
    await io.drop();
    throw new UploadRefused(404, "Project not found.");
  }
  const type = verifiedType(s.filename, await io.head());
  if (!type) {
    await io.drop();
    await audit({ workspaceId: s.workspace_id, userId: s.user_id, actor: "user", action: "upload.refused", target: s.project_id, meta: { reason: "content does not match its extension" } });
    throw new UploadRefused(415, "This file's contents are not the audio or video its name says. Export it again from your editor and upload that.");
  }
  const assetId = newId("ast");
  const key = storageKey(s.workspace_id, s.project_id, `source-${assetId}.${type.ext}`);
  await io.move(key);
  await run(
    `INSERT INTO asset (id, workspace_id, project_id, kind, storage_key, filename, mime, bytes, created_at) VALUES (?, ?, ?, 'source', ?, ?, ?, ?, ?)`,
    assetId, s.workspace_id, s.project_id, key, s.filename, type.mime, bytes, now(),
  );
  await run(`UPDATE upload_session SET finished_at = ?, bytes = ? WHERE upload_id = ?`, now(), bytes, s.upload_id);
  await run(`UPDATE project SET updated_at = ? WHERE id = ?`, now(), s.project_id);
  await enqueue({ workspaceId: s.workspace_id, projectId: s.project_id, type: "probe", input: { assetId }, idempotencyKey: `probe:${assetId}`, createdBy: s.user_id });
  await audit({ workspaceId: s.workspace_id, userId: s.user_id, actor: "user", action: "upload.finished", target: assetId, meta: { bytes } });
  return { assetId };
}

// ---------- hosted: S3 multipart, one signed part at a time ----------
const MAX_PARTS = 10_000; // the S3 limit

async function ownSession(who: { workspaceId: string; userId: string }, uploadId: string) {
  const s = await one<Session & { staging_key: string | null; multipart_id: string | null; finished_at: number | null; bytes: number | null }>(
    `SELECT * FROM upload_session WHERE upload_id = ? AND workspace_id = ? AND user_id = ?`, uploadId, who.workspaceId, who.userId,
  );
  if (!s || !s.staging_key || !s.multipart_id) throw new UploadRefused(404, "Upload not found.");
  return s as typeof s & { staging_key: string; multipart_id: string };
}

export async function s3Create(who: { userId: string; workspaceId: string }, input: { projectId: string; filename: string; size: number; type: string }) {
  const filename = input.filename.slice(0, 200);
  await checkNewUpload(who, input.projectId, filename, input.size);
  if (Math.ceil(input.size / PART_BYTES) > MAX_PARTS) throw new UploadRefused(413, "That file is larger than this workspace allows.");
  const uploadId = newId("up");
  const stagingKey = storageKey(who.workspaceId, input.projectId, `upload-${uploadId}`);
  const multipartId = await startMultipart(stagingKey, "application/octet-stream");
  await run(
    `INSERT INTO upload_session (upload_id, workspace_id, project_id, user_id, filename, created_at, staging_key, multipart_id, bytes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    uploadId, who.workspaceId, input.projectId, who.userId, filename, now(), stagingKey, multipartId, input.size,
  );
  return { uploadId, partBytes: PART_BYTES };
}

export async function s3Status(who: { userId: string; workspaceId: string }, uploadId: string) {
  const s = await ownSession(who, uploadId);
  if (s.finished_at) return { finished: true, parts: [] as { partNumber: number; size: number }[] };
  const parts = await listParts(s.staging_key, s.multipart_id);
  return { finished: false, partBytes: PART_BYTES, parts: parts.map((p) => ({ partNumber: p.partNumber, size: p.size })) };
}

export async function s3SignPart(who: { userId: string; workspaceId: string }, uploadId: string, partNumber: number) {
  if (!Number.isSafeInteger(partNumber) || partNumber < 1 || partNumber > MAX_PARTS) throw new UploadRefused(400, "Bad part number.");
  const s = await ownSession(who, uploadId);
  if (s.finished_at) throw new UploadRefused(409, "This upload already finished.");
  const declared = s.bytes ?? 0;
  if ((partNumber - 1) * PART_BYTES >= declared) throw new UploadRefused(400, "Bad part number.");
  return { url: await signPart(s.staging_key, s.multipart_id, partNumber) };
}

export async function s3Complete(who: { userId: string; workspaceId: string }, uploadId: string) {
  const s = await ownSession(who, uploadId);
  if (s.finished_at) {
    const a = await one<{ id: string }>(`SELECT id FROM asset WHERE project_id = ? AND kind = 'source' AND filename = ? ORDER BY created_at DESC LIMIT 1`, s.project_id, s.filename);
    return { assetId: a?.id ?? null };
  }
  const total = await completeMultipart(s.staging_key, s.multipart_id);
  const stored = (await objectSize(s.staging_key)) ?? total;
  if (stored > LIMITS.uploadBytes) {
    await removeObject(s.staging_key);
    throw new UploadRefused(413, "That file is larger than this workspace allows.");
  }
  return finishUpload(s, stored, {
    head: () => readStoredHead(s.staging_key),
    move: (key) => moveObject(s.staging_key, key),
    drop: () => removeObject(s.staging_key),
  });
}

export async function s3Abort(who: { userId: string; workspaceId: string }, uploadId: string) {
  const s = await ownSession(who, uploadId);
  if (s.finished_at) return;
  await abortMultipart(s.staging_key, s.multipart_id);
  await run(`DELETE FROM upload_session WHERE upload_id = ? AND finished_at IS NULL`, uploadId);
}

const g = globalThis as unknown as { __izwiTus?: Server };
export const tus: Server = (g.__izwiTus ??= new Server({
  path: "/api/upload",
  datastore: new FileStore({ directory: TUS_DIR }),
  maxSize: LIMITS.uploadBytes,
  relativeLocation: true,
  respectForwardedHeaders: false,
  async onIncomingRequest(req, uploadId) {
    if (req.method !== "GET" && req.method !== "HEAD" && req.method !== "OPTIONS") {
      try {
        checkOrigin(req);
      } catch {
        throw deny(403, "Cross-site request refused.");
      }
    }
    const who = await caller(req);
    if (!who) throw deny(401, "Sign in to upload.");
    if (req.method !== "POST" && uploadId) {
      const s = await one<{ workspace_id: string }>(`SELECT workspace_id FROM upload_session WHERE upload_id = ?`, uploadId);
      if (!s || s.workspace_id !== who.workspaceId) throw deny(404, "Upload not found.");
    }
  },
  async onUploadCreate(req, upload) {
    const who = await caller(req);
    if (!who) throw deny(401, "Sign in to upload.");
    const projectId = upload.metadata?.projectId ?? "";
    const filename = (upload.metadata?.filename ?? "").slice(0, 200);
    try {
      await checkNewUpload(who, projectId, filename);
    } catch (e) {
      if (e instanceof UploadRefused) throw deny(e.status, e.message);
      throw e;
    }
    await run(`INSERT INTO upload_session (upload_id, workspace_id, project_id, user_id, filename, created_at) VALUES (?, ?, ?, ?, ?, ?)`, upload.id, who.workspaceId, projectId, who.userId, filename, now());
    return { metadata: upload.metadata };
  },
  async onUploadFinish(_req, upload) {
    const s = await one<Session>(`SELECT * FROM upload_session WHERE upload_id = ?`, upload.id);
    if (!s) throw deny(404, "Upload not found.");
    const tmp = path.join(TUS_DIR, upload.id);
    try {
      await finishUpload(s, upload.size ?? 0, {
        head: async () => readHead(tmp),
        move: async (key) => {
          ensureDirFor(absPath(key));
          renameSync(tmp, absPath(key));
          rmSync(`${tmp}.json`, { force: true });
        },
        drop: async () => {
          rmSync(tmp, { force: true });
          rmSync(`${tmp}.json`, { force: true });
        },
      });
    } catch (e) {
      if (e instanceof UploadRefused) throw deny(e.status, e.message);
      throw e;
    }
    return {};
  },
}));
