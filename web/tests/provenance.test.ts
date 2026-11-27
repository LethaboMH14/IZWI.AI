import { writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { closeTestDb, openTestDb, seedWorkspace, type Db } from "./helpers/testdb";

vi.mock("../src/server/render", async (load) => {
  const actual = await load<typeof import("../src/server/render")>();
  return { ...actual, renderClip: vi.fn(async ({ out }: { out: string }) => { writeFileSync(out, Buffer.from("fake mp4 bytes")); }) };
});

let db: Db;
let ledger: typeof import("../src/server/ledger");
let provenance: typeof import("../src/server/provenance");
let pipeline: typeof import("../src/server/pipeline");

beforeAll(async () => {
  db = await openTestDb();
  await seedWorkspace(db, "org_prov", "usr_prov", "prj_prov");
  ledger = await import("../src/server/ledger");
  provenance = await import("../src/server/provenance");
  pipeline = await import("../src/server/pipeline");
}, 60_000);
afterAll(async () => await closeTestDb(db));

const envelope = (media = Buffer.from("sample mp4")) => ({
  output_id: "out_test", project_id: "prj_test", created_at: 1,
  declaration: { id: "decl_test", created_at: 1, text: "Creator declaration" },
  ai_use: { transcription: "whisper.cpp base", planner: "rules" },
  consent_refs: [{ consent_id: "cns_test", person_label: "Person 1", ledger_seq: 1, entry_hash: "a".repeat(64) }],
  media_sha256: hash(media),
});
const hash = (data: Buffer) => createHash("sha256").update(data).digest("hex");

describe("IZWI signed provenance (not C2PA)", () => {
  it("signs a canonical envelope and verifies it against the real MP4 bytes", () => {
    const bytes = Buffer.from("test MP4 bytes");
    const keys = ledger.ledgerKeys();
    const signed = provenance.buildProvenance(envelope(bytes), keys);
    expect(provenance.verifyProvenance(JSON.stringify(signed), bytes, keys.pubHex)).toEqual({ ok: true, reasons: [] });
    const flipped = Buffer.from(bytes); flipped[0] ^= 1;
    expect(provenance.verifyProvenance(JSON.stringify(signed), flipped, keys.pubHex)).toMatchObject({ ok: false, reasons: expect.arrayContaining([expect.stringMatching(/SHA-256/)]) });
    const changed = structuredClone(signed); changed.envelope.output_id = "tampered";
    expect(provenance.verifyProvenance(JSON.stringify(changed), bytes, keys.pubHex)).toMatchObject({ ok: false, reasons: expect.arrayContaining([expect.stringMatching(/signature/)]) });
  });

  it("uses generic consent labels and never serializes guest names", () => {
    const bytes = Buffer.from("media");
    const signed = provenance.buildProvenance(envelope(bytes));
    const json = JSON.stringify(signed);
    expect(json).toContain('"person_label":"Person 1"');
    expect(json).not.toContain("Thandi");
    expect(json).not.toContain("Lebo");
  });

  it("rejects revoke then regrant during render and deletes all temporary/final files", async () => {
    const fs = await import("node:fs");
    const { storageKey, absPath, ensureDirFor } = await import("../src/server/storage");
    const now = Date.now();
    (await db.run(`INSERT INTO person (id,workspace_id,project_id,name,role,whole_recording,created_at) VALUES ('person_prov','org_prov','prj_prov','Guest Secret','guest',1,0)`));
    (await db.run(`INSERT INTO consent (id,workspace_id,project_id,person_id,scope,status,statement,requested_by,requested_at,updated_at) VALUES ('consent_prov','org_prov','prj_prov','person_prov','appearance','granted','Permission','usr_prov',0,0)`));
    (await db.run(`INSERT INTO declaration (id,workspace_id,project_id,user_id,statement,created_at) VALUES ('decl_prov','org_prov','prj_prov','usr_prov','Creator statement',10)`));
    (await db.run(`INSERT INTO clip (id,workspace_id,project_id,title,start_ms,end_ms,reason,origin,status,created_at,updated_at) VALUES ('clip_prov','org_prov','prj_prov','Test clip',0,1000,'test','manual','kept',0,0)`));
    const append = (decision: "granted" | "revoked", at: number) => ledger.appendConsent({ consentId: "consent_prov", workspaceId: "org_prov", projectId: "prj_prov", personId: "person_prov", scope: "appearance", decision, respondedName: "Guest Secret", at });
    (await append("granted", now - 3));
    const sourceKey = storageKey("org_prov", "prj_prov", "source.mp4");
    ensureDirFor(absPath(sourceKey)); fs.writeFileSync(absPath(sourceKey), "source");
    (await db.run(`INSERT INTO asset (id,workspace_id,project_id,kind,storage_key,filename,mime,bytes,duration_ms,meta,created_at) VALUES ('source_prov','org_prov','prj_prov','source',?,'source.mp4','video/mp4',6,2000,?,0)`, sourceKey, JSON.stringify({ durationMs: 2000, hasAudio: true, hasVideo: false, format: "mp4" })));
    const job = await import("../src/server/jobs");
    const j = (await job.enqueue({ workspaceId: "org_prov", projectId: "prj_prov", type: "render", input: { outputId: "out_prov" } }));
    (await db.run(`UPDATE job SET status='running',worker_id='worker_prov',attempts=1,lease_until=? WHERE id=?`, now + 60_000, j.id));
    (await db.run(`INSERT INTO output (id,workspace_id,project_id,clip_id,preset,status,job_id,created_by,created_at,updated_at) VALUES ('out_prov','org_prov','prj_prov','clip_prov','small','queued',?,'usr_prov',0,0)`, j.id));
    const renderModule = await import("../src/server/render");
    vi.mocked(renderModule.renderClip).mockImplementationOnce(async ({ out }: { out: string }) => {
      writeFileSync(out, Buffer.from("rendered MP4"));
    });
    const originalWrite = provenance.writeProvenance;
    vi.spyOn(provenance, "writeProvenance").mockImplementationOnce((async (...args: Parameters<typeof originalWrite>) => {
      const result = await originalWrite(...args);
      (await append("revoked", now - 2)); (await append("granted", now - 1));
      return result;
    }) as never);
    const resultJob = { ...j, status: "running" as const, worker_id: "worker_prov", attempts: 1, lease_until: now + 60_000 };
    await expect(pipeline.handle({ job: resultJob, input: { outputId: "out_prov" }, beat: () => {}, signal: new AbortController().signal })).rejects.toThrow(/Consent changed during rendering/);
    expect((await db.one<{ status: string; note: string }>(`SELECT status,note FROM output WHERE id='out_prov'`))).toMatchObject({ status: "failed", note: expect.stringMatching(/Consent changed/) });
    for (const file of ["render-out_prov-1-worker_prov.mp4", "render-out_prov-1-worker_prov.mp4.tmp", "render-out_prov-1-worker_prov.mp4.provenance.json", "render-out_prov-1-worker_prov.mp4.provenance.json.tmp"]) {
      expect(existsSync(absPath(storageKey("org_prov", "prj_prov", file)))).toBe(false);
    }
  });
});
