// Resumable uploads (tus protocol). If the signal drops, the browser continues from the last confirmed byte.
// Only signed-in members can create or continue an upload, and only into their own workspace's projects.
import { mkdirSync, renameSync, rmSync } from "node:fs";
import path from "node:path";
import { Server } from "@tus/server";
import { FileStore } from "@tus/file-store";
import { auth } from "./auth";
import { newId, now, one, run } from "./db";
import { LIMITS, STORAGE } from "./env";
import { enqueue } from "./jobs";
import { absPath, ensureDirFor, storageKey } from "./storage";
import { audit } from "./audit";

const TUS_DIR = path.join(STORAGE, "tus");
mkdirSync(TUS_DIR, { recursive: true });
const ALLOWED_EXT = /\.(mp4|mov|m4v|webm|mkv|avi|mp3|m4a|aac|wav|ogg|opus|flac|3gp)$/i;

async function caller(req: Request) {
  const s = await auth.api.getSession({ headers: req.headers });
  const ws = (s?.session as { activeOrganizationId?: string | null } | undefined)?.activeOrganizationId;
  if (!s || !ws) return null;
  const m = one(`SELECT 1 FROM member WHERE organizationId = ? AND userId = ?`, ws, s.user.id);
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
    const who = await caller(req);
    if (!who) throw deny(401, "Sign in to upload.");
    if (req.method !== "POST" && uploadId) {
      const s = one<{ workspace_id: string }>(`SELECT workspace_id FROM upload_session WHERE upload_id = ?`, uploadId);
      if (!s || s.workspace_id !== who.workspaceId) throw deny(404, "Upload not found.");
    }
  },
  async onUploadCreate(req, upload) {
    const who = await caller(req);
    if (!who) throw deny(401, "Sign in to upload.");
    const projectId = upload.metadata?.projectId ?? "";
    const filename = (upload.metadata?.filename ?? "").slice(0, 200);
    const type = upload.metadata?.filetype ?? "";
    const p = one(`SELECT id FROM project WHERE id = ? AND workspace_id = ?`, projectId, who.workspaceId);
    if (!p) throw deny(404, "Project not found.");
    if (!filename || !(type.startsWith("video/") || type.startsWith("audio/") || ALLOWED_EXT.test(filename))) throw deny(415, "Choose a video or audio file.");
    run(`INSERT INTO upload_session (upload_id, workspace_id, project_id, user_id, filename, created_at) VALUES (?, ?, ?, ?, ?, ?)`, upload.id, who.workspaceId, projectId, who.userId, filename, now());
    return { metadata: upload.metadata };
  },
  async onUploadFinish(_req, upload) {
    const s = one<{ workspace_id: string; project_id: string; user_id: string; filename: string }>(`SELECT * FROM upload_session WHERE upload_id = ?`, upload.id);
    if (!s) throw deny(404, "Upload not found.");
    const assetId = newId("ast");
    const ext = (/\.[A-Za-z0-9]{1,5}$/.exec(s.filename)?.[0] ?? ".bin").toLowerCase();
    const key = storageKey(s.workspace_id, s.project_id, `source-${assetId}${ext}`);
    ensureDirFor(absPath(key));
    renameSync(path.join(TUS_DIR, upload.id), absPath(key));
    rmSync(path.join(TUS_DIR, `${upload.id}.json`), { force: true });
    run(
      `INSERT INTO asset (id, workspace_id, project_id, kind, storage_key, filename, mime, bytes, created_at) VALUES (?, ?, ?, 'source', ?, ?, ?, ?, ?)`,
      assetId, s.workspace_id, s.project_id, key, s.filename, upload.metadata?.filetype || "application/octet-stream", upload.size ?? 0, now(),
    );
    run(`UPDATE project SET updated_at = ? WHERE id = ?`, now(), s.project_id);
    enqueue({ workspaceId: s.workspace_id, projectId: s.project_id, type: "probe", input: { assetId }, idempotencyKey: `probe:${assetId}`, createdBy: s.user_id });
    audit({ workspaceId: s.workspace_id, userId: s.user_id, actor: "user", action: "upload.finished", target: assetId, meta: { bytes: upload.size } });
    return {};
  },
}));
