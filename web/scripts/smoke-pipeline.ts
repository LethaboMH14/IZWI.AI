// Seeds a throwaway workspace and queues the synthetic test episode, so the worker can be checked end to end
// without the web app. Run with IZWI_STORAGE_DIR pointing at a scratch folder (never the real storage).
import { copyFileSync } from "node:fs";
import path from "node:path";
import { loadLocalEnv } from "../src/server/env";

async function main() {
  loadLocalEnv();
  if (!process.env.IZWI_STORAGE_DIR) throw new Error("Set IZWI_STORAGE_DIR to a scratch folder first.");
  const { run, now, newId } = await import("../src/server/db");
  const { enqueue } = await import("../src/server/jobs");
  const { absPath, ensureDirFor, storageKey } = await import("../src/server/storage");
  const iso = new Date().toISOString();
  const userId = "usr_smoke", ws = "org_smoke";
  await run(`INSERT OR IGNORE INTO "user" (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, 0, ?, ?)`, userId, "Smoke Test", "smoke@izwi.test", iso, iso);
  await run(`INSERT OR IGNORE INTO organization (id, name, slug, createdAt) VALUES (?, ?, ?, ?)`, ws, "Smoke Studio", "smoke-studio", iso);
  await run(`INSERT OR IGNORE INTO member (id, organizationId, userId, role, createdAt) VALUES (?, ?, ?, 'owner', ?)`, "mem_smoke", ws, userId, iso);
  const glossary = [
    { term: "Sawubona Mzansi", heard: ["Saw Bonam's ANSI", "Saw bonus ANSI"] },
    { term: "Jozi Stories", heard: ["Joseph Stories"] },
    { term: "Naledi", heard: ["Nailedi", "NailD"] },
    { term: "isiZulu", heard: ["ISI Zulu"] },
    { term: "Sharp sharp" },
  ];
  await run(
    `INSERT OR REPLACE INTO workspace_pref (workspace_id, glossary, created_at, updated_at) VALUES (?, ?, ?, ?)`,
    ws, JSON.stringify(glossary), now(), now(),
  );
  const projectId = newId("prj");
  await run(`INSERT INTO project (id, workspace_id, title, kind, spoken_language, created_by, created_at, updated_at) VALUES (?, ?, ?, 'podcast', 'en', ?, ?, ?)`, projectId, ws, "Jozi Stories · Episode 04 (synthetic)", userId, now(), now());
  const assetId = newId("ast");
  const key = storageKey(ws, projectId, `source-${assetId}.mp4`);
  ensureDirFor(absPath(key));
  copyFileSync(path.join(process.cwd(), "test-media", "sim_jozi-stories-ep04.mp4"), absPath(key));
  await run(
    `INSERT INTO asset (id, workspace_id, project_id, kind, storage_key, filename, mime, bytes, created_at) VALUES (?, ?, ?, 'source', ?, ?, 'video/mp4', 0, ?)`,
    assetId, ws, projectId, key, "sim_jozi-stories-ep04.mp4", now(), // gitleaks:allow (a file name, not a secret)
  );
  const job = await enqueue({ workspaceId: ws, projectId, type: "probe", input: { assetId }, idempotencyKey: `probe:${assetId}`, createdBy: userId });
  console.log(JSON.stringify({ projectId, assetId, jobId: job.id }));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
