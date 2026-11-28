// Second smoke step on the scratch database: re-transcribe with the current caption rules, keep a clip,
// prove the rights gate holds a render, then clear it and render, then build the editor hand-off package.
import { loadLocalEnv } from "../src/server/env";

async function main() {
  loadLocalEnv();
  if (!process.env.IZWI_STORAGE_DIR) throw new Error("Set IZWI_STORAGE_DIR to the scratch folder.");
  const { all, newId, now, one, run } = await import("../src/server/db");
  const { enqueue } = await import("../src/server/jobs");
  const { DECLARATION, consentStatement } = await import("../src/server/rights");
  const step = process.argv[2];
  const proj = (await one<{ id: string; workspace_id: string; title: string }>(`SELECT id, workspace_id, title FROM project ORDER BY created_at DESC LIMIT 1`))!;
  const src = (await one<{ id: string }>(`SELECT id FROM asset WHERE project_id = ? AND kind = 'source'`, proj.id))!;

  if (step === "retranscribe") {
    const j = await enqueue({ workspaceId: proj.workspace_id, projectId: proj.id, type: "transcribe", input: { assetId: src.id }, idempotencyKey: `transcribe:${src.id}:${Date.now()}` });
    console.log(JSON.stringify({ queued: j.id }));
  }

  if (step === "gate") {
    const clip = (await one<{ id: string; title: string }>(`SELECT id, title FROM clip WHERE project_id = ? ORDER BY start_ms DESC LIMIT 1`, proj.id))!;
    await run(`UPDATE clip SET status = 'kept' WHERE id = ?`, clip.id);
    const personId = newId("per");
    await run(`INSERT INTO person (id, workspace_id, project_id, name, role, whole_recording, created_at) VALUES (?, ?, ?, 'Thabo K.', 'Guest', 1, ?)`, personId, proj.workspace_id, proj.id, now());
    await run(
      `INSERT INTO consent (id, workspace_id, project_id, person_id, scope, status, statement, requested_by, requested_at, updated_at) VALUES (?, ?, ?, ?, 'appearance', 'requested', ?, 'usr_smoke', ?, ?)`,
      newId("cns"), proj.workspace_id, proj.id, personId, consentStatement("Thabo K.", proj.title, "appearance"), now(), now(),
    );
    await run(`INSERT INTO declaration (id, workspace_id, project_id, user_id, statement, created_at) VALUES (?, ?, ?, 'usr_smoke', ?, ?)`, newId("dec"), proj.workspace_id, proj.id, DECLARATION, now());
    const outputId = newId("out");
    await run(
      `INSERT INTO output (id, workspace_id, project_id, clip_id, preset, language, burn, status, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, 'vertical', 'en', 1, 'queued', 'usr_smoke', ?, ?)`,
      outputId, proj.workspace_id, proj.id, clip.id, now(), now(),
    );
    const j = await enqueue({ workspaceId: proj.workspace_id, projectId: proj.id, type: "render", input: { outputId }, idempotencyKey: `render:${outputId}` });
    await run(`UPDATE output SET job_id = ? WHERE id = ?`, j.id, outputId);
    console.log(JSON.stringify({ clip: clip.title, outputId, job: j.id }));
  }

  if (step === "grant") {
    await run(`UPDATE consent SET status = 'granted', responded_name = 'Thabo K.', responded_at = ?, updated_at = ? WHERE project_id = ?`, now(), now(), proj.id);
    const n = (await run(`UPDATE job SET status = 'queued', error = NULL, run_after = ? WHERE project_id = ? AND type = 'render' AND status = 'blocked'`, now(), proj.id)).changes;
    await run(`UPDATE output SET status = 'queued', note = NULL WHERE project_id = ? AND status = 'blocked'`, proj.id);
    const j = await enqueue({ workspaceId: proj.workspace_id, projectId: proj.id, type: "package", input: {}, idempotencyKey: `package:${Date.now()}` });
    console.log(JSON.stringify({ requeuedRenders: n, package: j.id }));
  }

  if (step === "report") {
    console.log((await all(`SELECT type, status, error, output FROM job ORDER BY created_at`)).map((j) => JSON.stringify(j).slice(0, 220)).join("\n"));
    console.log(await all(`SELECT preset, status, note FROM output`));
    console.log(await all(`SELECT kind, filename, bytes FROM asset WHERE kind IN ('render','caption','package')`));
    const lines = await all<{ text: string; start_ms: number; end_ms: number }>(`SELECT text, start_ms, end_ms FROM caption_line l JOIN caption_track t ON t.id = l.track_id WHERE t.kind = 'source' ORDER BY idx`);
    console.log(lines.map((l) => `${l.start_ms}-${l.end_ms} ${l.text.replace(/\n/g, " / ")}`).join("\n"));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
