// Resumable uploads (tus protocol). If the signal drops, the browser continues from the last confirmed byte.
// Only signed-in members can create or continue an upload, and only into their own workspace's projects.
import { closeSync, mkdirSync, openSync, readSync, renameSync, rmSync } from "node:fs";
import path from "node:path";
import { Server } from "@tus/server";
import { FileStore } from "@tus/file-store";
import { auth } from "./auth";
import { newId, now, one, run } from "./db";
import { LIMITS, STORAGE } from "./env";
import { enqueue } from "./jobs";
import { absPath, ensureDirFor, storageKey } from "./storage";
import { audit } from "./audit";
import { checkOrigin } from "./http";
import { uploadExt, verifiedType } from "./filetype";
import { rateLimit as hit, LIMIT, RateLimitError } from "./ratelimit";

const TUS_DIR = path.join(STORAGE, "tus");
mkdirSync(TUS_DIR, { recursive: true });

function readHead(file: string, n = 64) {
  const fd = openSync(file, "r");
  try {
    const buf = Buffer.alloc(n);
    return buf.subarray(0, readSync(fd, buf, 0, n, 0));
  } finally {
    closeSync(fd);
  }
}

async function caller(req: Request) {
  const s = await auth.api.getSession({ headers: req.headers });
  const ws = (s?.session as { activeOrganizationId?: string | null } | undefined)?.activeOrganizationId;
  if (!s || !ws) return null;
  const m = await one(`SELECT 1 FROM member WHERE organizationId = ? AND userId = ?`, ws, s.user.id);
  return m ? { userId: s.user.id, workspaceId: ws } : null;
}

const deny = (status_code: number, body: string) => ({ status_code, body });

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
      await hit(`upload:${who.workspaceId}:${who.userId}`, LIMIT.uploadCreate.max, LIMIT.uploadCreate.windowMs);
    } catch (e) {
      if (e instanceof RateLimitError) throw deny(429, e.message);
      throw e;
    }
    const p = await one(`SELECT id FROM project WHERE id = ? AND workspace_id = ?`, projectId, who.workspaceId);
    if (!p) throw deny(404, "Project not found.");
    // The browser's filetype is ignored: the extension must be on the list, and the bytes are checked when the upload ends.
    if (!filename || !uploadExt(filename)) throw deny(415, "Choose a video or audio file (MP4, MOV, WebM, MKV, AVI, 3GP, MP3, M4A, AAC, WAV, OGG, Opus or FLAC).");
    await run(`INSERT INTO upload_session (upload_id, workspace_id, project_id, user_id, filename, created_at) VALUES (?, ?, ?, ?, ?, ?)`, upload.id, who.workspaceId, projectId, who.userId, filename, now());
    return { metadata: upload.metadata };
  },
  async onUploadFinish(_req, upload) {
    const s = await one<{ workspace_id: string; project_id: string; user_id: string; filename: string }>(`SELECT * FROM upload_session WHERE upload_id = ?`, upload.id);
    if (!s) throw deny(404, "Upload not found.");
    const tmp = path.join(TUS_DIR, upload.id);
    const drop = () => {
      rmSync(tmp, { force: true });
      rmSync(`${tmp}.json`, { force: true });
    };
    // The project may have been deleted while the bytes were arriving.
    if (!await one(`SELECT 1 FROM project WHERE id = ? AND workspace_id = ?`, s.project_id, s.workspace_id)) {
      drop();
      throw deny(404, "Project not found.");
    }
    const type = verifiedType(s.filename, readHead(tmp));
    if (!type) {
      drop();
      await audit({ workspaceId: s.workspace_id, userId: s.user_id, actor: "user", action: "upload.refused", target: s.project_id, meta: { reason: "content does not match its extension" } });
      throw deny(415, "This file's contents are not the audio or video its name says. Export it again from your editor and upload that.");
    }
    const assetId = newId("ast");
    const key = storageKey(s.workspace_id, s.project_id, `source-${assetId}.${type.ext}`);
    ensureDirFor(absPath(key));
    renameSync(tmp, absPath(key));
    rmSync(`${tmp}.json`, { force: true });
    await run(
      `INSERT INTO asset (id, workspace_id, project_id, kind, storage_key, filename, mime, bytes, created_at) VALUES (?, ?, ?, 'source', ?, ?, ?, ?, ?)`,
      assetId, s.workspace_id, s.project_id, key, s.filename, type.mime, upload.size ?? 0, now(),
    );
    await run(`UPDATE project SET updated_at = ? WHERE id = ?`, now(), s.project_id);
    await enqueue({ workspaceId: s.workspace_id, projectId: s.project_id, type: "probe", input: { assetId }, idempotencyKey: `probe:${assetId}`, createdBy: s.user_id });
    await audit({ workspaceId: s.workspace_id, userId: s.user_id, actor: "user", action: "upload.finished", target: assetId, meta: { bytes: upload.size } });
    return {};
  },
}));
