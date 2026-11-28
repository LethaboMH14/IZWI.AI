import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({
  completeMultipart: vi.fn(), listParts: vi.fn(), moveObject: vi.fn(), objectSize: vi.fn(),
  readHead: vi.fn(), removeObject: vi.fn(), signPart: vi.fn(), startMultipart: vi.fn(),
}));

vi.mock("../src/server/storage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/server/storage")>();
  return { ...actual, ...store };
});

import { closeTestDb, openTestDb, seedWorkspace, type Db } from "./helpers/testdb";

let db: Db;
let upload: typeof import("../src/server/upload");
let n = 0;

async function fixture() {
  n++;
  return seedWorkspace(db, `sim_ws_${n}`, `sim_user_${n}`, `sim_proj_${n}`);
}

beforeAll(async () => {
  process.env.IZWI_STORAGE = "s3";
  db = await openTestDb();
  upload = await import("../src/server/upload");
});

beforeEach(() => {
  vi.clearAllMocks();
  store.startMultipart.mockResolvedValue("sim_multipart_token");
  store.listParts.mockResolvedValue([]);
  store.signPart.mockResolvedValue("https://sim.invalid/sim_signed_part_token");
  store.completeMultipart.mockResolvedValue(7);
  store.objectSize.mockResolvedValue(7);
  store.readHead.mockResolvedValue(Buffer.from("not a wav file"));
  store.moveObject.mockResolvedValue(undefined);
  store.removeObject.mockResolvedValue(undefined);
});

afterAll(async () => {
  await closeTestDb(db);
  delete process.env.IZWI_STORAGE;
});

describe("hosted multipart upload", () => {
  it("rejects a bad extension with 415 and an oversized file with 413", async () => {
    const who = await fixture();
    const projectId = `sim_proj_${n}`;
    await expect(upload.s3Create(who, { projectId, filename: "clip.exe", size: 10, type: "video/mp4" })).rejects.toMatchObject({ status: 415 });
    await expect(upload.s3Create(who, { projectId, filename: "clip.mp4", size: Number(process.env.IZWI_MAX_UPLOAD_BYTES || 2 * 1024 ** 3) + 1, type: "video/mp4" })).rejects.toMatchObject({ status: 413 });
    expect(store.startMultipart).not.toHaveBeenCalled();
  });

  it("hides another user's session and rejects an out-of-range part", async () => {
    const owner = await fixture();
    const projectId = `sim_proj_${n}`;
    const created = await upload.s3Create(owner, { projectId, filename: "clip.mp4", size: 32, type: "video/mp4" });
    const stranger = await fixture();
    await expect(upload.s3SignPart(stranger, created.uploadId, 1)).rejects.toMatchObject({ status: 404 });
    await expect(upload.s3SignPart(owner, created.uploadId, 2)).rejects.toMatchObject({ status: 400 });
  });

  it("gives up a session the store no longer holds, so the browser can start again", async () => {
    const who = await fixture();
    const created = await upload.s3Create(who, { projectId: `sim_proj_${n}`, filename: "clip.mp4", size: 32, type: "video/mp4" });
    store.listParts.mockRejectedValueOnce(Object.assign(new Error("gone"), { name: "NoSuchUpload" }));
    await expect(upload.s3Status(who, created.uploadId)).rejects.toMatchObject({ status: 404 });
    expect(await db.one(`SELECT 1 FROM upload_session WHERE upload_id = ?`, created.uploadId)).toBeUndefined();
  });

  it("starts a remembered upload afresh when the server answers 404", async () => {
    const { S3Upload } = await import("../src/lib/s3-upload");
    const memory = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => void memory.set(k, v), removeItem: (k: string) => void memory.delete(k) });
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push(`${init.method} ${url}`);
      if (url === "/api/upload/s3/up_old") return new Response(JSON.stringify({ error: "Upload not found." }), { status: 404 });
      if (url === "/api/upload/s3") return Response.json({ uploadId: "up_new", partBytes: 8 });
      if (url === "/api/upload/s3/up_new") return Response.json({ finished: true, parts: [] });
      return new Response("unexpected", { status: 500 });
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const u = new S3Upload(new File(["abc"], "clip.mp4"), { projectId: "p", retryDelays: [0], onProgress: () => {}, onSuccess: resolve, onError: reject });
        void u.findPreviousUploads().then(() => { u.resumeFromPreviousUpload({ uploadId: "up_old", fingerprint: (u as unknown as { fingerprint: string }).fingerprint }); u.start(); });
      });
      expect(calls).toEqual(["GET /api/upload/s3/up_old", "POST /api/upload/s3", "GET /api/upload/s3/up_new"]);
    } finally { vi.unstubAllGlobals(); }
  });

  it("uses the store byte count, drops mismatched content, and creates one source and probe on success idempotently", async () => {
    const who = await fixture();
    const projectId = `sim_proj_${n}`;
    const bad = await upload.s3Create(who, { projectId, filename: "bad.wav", size: 14, type: "audio/wav" });
    store.objectSize.mockResolvedValueOnce(14);
    store.readHead.mockResolvedValueOnce(Buffer.from("sim_bad_audio"));
    await expect(upload.s3Complete(who, bad.uploadId)).rejects.toMatchObject({ status: 415 });
    expect(store.removeObject).toHaveBeenCalledTimes(1);
    expect((await db.one<{ n: number }>(`SELECT COUNT(*) n FROM asset WHERE project_id = ?`, projectId))?.n).toBe(0);

    const good = await upload.s3Create(who, { projectId, filename: "good.wav", size: 99, type: "audio/wav" });
    store.completeMultipart.mockResolvedValueOnce(99);
    store.objectSize.mockResolvedValueOnce(12);
    store.readHead.mockResolvedValueOnce(Buffer.from("RIFF0000WAVE"));
    const first = await upload.s3Complete(who, good.uploadId);
    const second = await upload.s3Complete(who, good.uploadId);
    expect(first.assetId).toBeTruthy();
    expect(second).toEqual(first);
    expect(await db.one<{ bytes: number; kind: string }>(`SELECT bytes, kind FROM asset WHERE id = ?`, first.assetId)).toEqual({ bytes: 12, kind: "source" });
    expect((await db.one<{ n: number }>(`SELECT COUNT(*) n FROM asset WHERE project_id = ? AND kind = 'source'`, projectId))?.n).toBe(1);
    expect((await db.one<{ n: number }>(`SELECT COUNT(*) n FROM job WHERE project_id = ? AND type = 'probe'`, projectId))?.n).toBe(1);
    expect(store.moveObject).toHaveBeenCalledTimes(1);
  });
});
