// What each job does. Runs in the worker process. Every step writes real files and real rows, or fails with a reason.
import { existsSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { strToU8, zipSync, type Zippable } from "fflate";
import { all, newId, now, one, parse, run, tx } from "./db";
import { BIN, LIMITS, STORAGE } from "./env";
import { enqueue, type JobRow, type JobType } from "./jobs";
import { absPath, ensureDirFor, localCopy, persist, removeObject, sha256File, storageKey } from "./storage";
import { extractSpeechWav, makeProxy, peaks, poster, probe, ToolError, whisper, type Probe } from "./media";
import { applyGlossary, buildLines, lineFlag, lineText, sliceLines, toASS, toSRT, toVTT, type CapLine, type GlossaryEntry, type Seg, type Word } from "./captions";
import { clipDefaults, suggestClips } from "./clips";
import { toEDL, toOTIO } from "./interop";
import { gateFor, gateReason } from "./rights";
import { providerFor, translateLines, type ProviderRow } from "./providers";
import { isPreset, PRESETS, renderClip } from "./render";
import { PROVENANCE_LABEL, verifyProvenance, writeProvenance } from "./provenance";
import { canonical, ledgerKeys } from "./ledger";
import { LANGUAGES, langName } from "../lib/languages";
import { transcribeVoiceJob } from "./voice";

export class Blocked extends Error {}
export type JobCtx = { job: JobRow; input: Record<string, unknown>; beat: (p?: number, stage?: string) => void; signal: AbortSignal };

type Asset = { id: string; workspace_id: string; project_id: string; kind: string; storage_key: string; filename: string; mime: string; bytes: number; duration_ms: number | null; width: number | null; height: number | null; meta: string };
type Project = { id: string; workspace_id: string; title: string; kind: string; spoken_language: string };
type LineRow = { id: string; idx: number; start_ms: number; end_ms: number; text: string; words: string | null; status: string };

// Every lookup is scoped to the job's own workspace, so a job can never read another tenant's rows.
const project = async (ws: string, id: string) => await one<Project>(`SELECT * FROM project WHERE id = ? AND workspace_id = ?`, id, ws) ?? fail("The project no longer exists.");
const asset = async (ws: string, id: unknown) => await one<Asset>(`SELECT * FROM asset WHERE id = ? AND workspace_id = ?`, String(id), ws) ?? fail("A file this step needs is missing.");
const latest = async (projectId: string, kind: string) => await one<Asset>(`SELECT * FROM asset WHERE project_id = ? AND kind = ? ORDER BY created_at DESC LIMIT 1`, projectId, kind);
function fail(msg: string, retryable = false): never {
  throw new ToolError(msg, retryable);
}
const prefs = async (ws: string) => await one<{ glossary: string; accuracy: string }>(`SELECT glossary, accuracy FROM workspace_pref WHERE workspace_id = ?`, ws);

async function addAsset(a: { ws: string; projectId: string; kind: string; key: string; filename: string; mime: string; durationMs?: number | null; width?: number | null; height?: number | null; meta?: unknown }) {
  const file = absPath(a.key);
  const bytes = statSync(file).size;
  const sha256 = await sha256File(file);
  await persist(a.key, file, a.mime); // to the bucket in s3 mode, before the row points at it
  const id = newId("ast");
  await run(
    `INSERT INTO asset (id, workspace_id, project_id, kind, storage_key, filename, mime, bytes, sha256, duration_ms, width, height, meta, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(storage_key) DO UPDATE SET bytes = excluded.bytes, sha256 = excluded.sha256, meta = excluded.meta, created_at = excluded.created_at`,
    id, a.ws, a.projectId, a.kind, a.key, a.filename, a.mime, bytes, sha256,
    a.durationMs ?? null, a.width ?? null, a.height ?? null, JSON.stringify(a.meta ?? {}), now(),
  );
  return (await one<{ id: string }>(`SELECT id FROM asset WHERE storage_key = ?`, a.key))!.id;
}

const tmpDir = (jobId: string) => path.join(STORAGE, "tmp", jobId);

async function renderConsentSnapshot(projectId: string, startMs: number, endMs: number) {
  const everyone = await all<{ id: string; whole_recording: number }>(`SELECT id, whole_recording FROM person WHERE project_id = ? ORDER BY id`, projectId);
  const people: typeof everyone = [];
  for (const person of everyone) {
    if (person.whole_recording === 1 || (await one(`SELECT 1 FROM appearance WHERE person_id = ? AND start_ms < ? AND end_ms > ?`, person.id, endMs, startMs))) people.push(person);
  }
  return Promise.all(people.map(async (person, index) => {
    const consent = await one<{ id: string; status: string }>(`SELECT id, status FROM consent WHERE person_id = ? ORDER BY requested_at DESC LIMIT 1`, person.id);
    if (consent?.status !== "granted") throw new Blocked("Consent changed during rendering. The signed render was discarded; check consent and render again.");
    const entry = await one<{ seq: number; hash: string; record: string }>(`SELECT seq, hash, record FROM consent_ledger WHERE consent_id = ? ORDER BY seq DESC LIMIT 1`, consent.id);
    if (!entry || JSON.parse(entry.record).decision !== "granted") throw new Blocked("A granted consent ledger entry is missing. The signed render was discarded.");
    return { consent_id: consent.id, person_label: `Person ${index + 1}`, ledger_seq: entry.seq, entry_hash: entry.hash };
  }));
}

export async function handle(c: JobCtx): Promise<unknown> {
  switch (c.job.type as string) {
    case "probe": return probeJob(c);
    case "proxy": return proxyJob(c);
    case "transcribe": return transcribeJob(c);
    case "voice_transcribe": return transcribeVoiceJob(c);
    case "suggest_clips": return suggestJob(c);
    case "translate": return translateJob(c);
    case "publish": return publishJob(c);
    case "render": return renderJob(c);
    case "package": return packageJob(c);
    default: return fail(`Unknown step ${c.job.type}`);
  }
}

async function probeJob(c: JobCtx) {
  const a = await asset(c.job.workspace_id, c.input.assetId);
  c.beat(0.1, "Reading the file");
  const p = await probe(await localCopy(a.storage_key));
  if (!p.hasAudio && !p.hasVideo) fail("No audio or video was found in this file.");
  if (p.durationMs < 1000) fail("This file is shorter than one second.");
  if (p.durationMs > LIMITS.sourceSeconds * 1000) fail(`This file is longer than the ${LIMITS.sourceSeconds / 3600}-hour limit.`);
  await run(`UPDATE asset SET duration_ms = ?, width = ?, height = ?, meta = ? WHERE id = ?`, p.durationMs, p.width ?? null, p.height ?? null, JSON.stringify(p), a.id);
  await enqueue({ workspaceId: a.workspace_id, projectId: a.project_id, type: "proxy", input: { assetId: a.id }, idempotencyKey: `proxy:${a.id}`, dependsOn: c.job.id, createdBy: c.job.created_by });
  return { durationMs: p.durationMs, hasVideo: p.hasVideo, hasAudio: p.hasAudio, width: p.width, height: p.height };
}

async function proxyJob(c: JobCtx) {
  const a = await asset(c.job.workspace_id, c.input.assetId);
  const p = parse<Probe>(a.meta, { durationMs: a.duration_ms ?? 0, hasAudio: true, hasVideo: false, format: "" });
  const src = await localCopy(a.storage_key);
  const key = (name: string) => storageKey(a.workspace_id, a.project_id, name);

  const proxyKey = key(`proxy-${a.id}.mp4`);
  ensureDirFor(absPath(proxyKey));
  await makeProxy(src, absPath(proxyKey), p, (x) => c.beat(x * 0.55, "Making a light preview"), c.signal);
  await addAsset({ ws: a.workspace_id, projectId: a.project_id, kind: "proxy", key: proxyKey, filename: `preview-${a.filename.replace(/.[^.]+$/, "")}.mp4`, mime: p.hasVideo ? "video/mp4" : "audio/mp4", durationMs: p.durationMs, width: p.width, height: p.height, meta: { sourceId: a.id } });

  if (p.hasVideo) {
    c.beat(0.6, "Picking a cover frame");
    const posterKey = key(`poster-${a.id}.jpg`);
    await poster(src, absPath(posterKey), p.durationMs);
    await addAsset({ ws: a.workspace_id, projectId: a.project_id, kind: "poster", key: posterKey, filename: "cover.jpg", mime: "image/jpeg", meta: { sourceId: a.id } });
  }
  if (p.hasAudio) {
    c.beat(0.7, "Preparing audio for listening");
    const wavKey = key(`speech-${a.id}.wav`);
    await extractSpeechWav(src, absPath(wavKey), p.durationMs, c.signal);
    await addAsset({ ws: a.workspace_id, projectId: a.project_id, kind: "audio", key: wavKey, filename: "speech-16k.wav", mime: "audio/wav", durationMs: p.durationMs, meta: { sourceId: a.id } });

    c.beat(0.85, "Drawing the waveform");
    const peaksKey = key(`peaks-${a.id}.json`);
    writeFileSync(absPath(peaksKey), JSON.stringify(await peaks(src, p.durationMs, c.signal)));
    await addAsset({ ws: a.workspace_id, projectId: a.project_id, kind: "peaks", key: peaksKey, filename: "peaks.json", mime: "application/json", meta: { sourceId: a.id } });

    if (c.input.transcribe !== false) {
      await enqueue({ workspaceId: a.workspace_id, projectId: a.project_id, type: "transcribe", input: { assetId: a.id }, idempotencyKey: `transcribe:${a.id}`, dependsOn: c.job.id, createdBy: c.job.created_by });
    }
  }
  return { preview: true, poster: p.hasVideo, waveform: p.hasAudio };
}

async function transcribeJob(c: JobCtx) {
  const src = await asset(c.job.workspace_id, c.input.assetId);
  const proj = await project(c.job.workspace_id, src.project_id);
  const wav = await one<Asset>(`SELECT * FROM asset WHERE project_id = ? AND kind = 'audio' ORDER BY created_at DESC LIMIT 1`, proj.id) ?? fail("The audio for listening is missing. Run the preview step again.");
  const pf = await prefs(proj.workspace_id);
  const glossary = parse<GlossaryEntry[]>(pf?.glossary, []);
  const lang = proj.spoken_language === "auto" ? "auto" : proj.spoken_language;
  const known = LANGUAGES.find((l) => l.code === lang);
  if (known && !known.whisper) {
    fail(`Whisper does not list ${known.name}. Connect a ${known.name} speech endpoint in Run on, or set the spoken language to one Whisper covers.`);
  }
  const dir = tmpDir(c.job.id);
  ensureDirFor(path.join(dir, "x"));
  const started = now();
  const t = await whisper(await localCopy(wav.storage_key), path.join(dir, "transcript"), {
    language: lang, prompt: glossary.map((g) => g.term).join(", "), accurate: pf?.accuracy === "accurate",
    onProgress: (x) => c.beat(x * 0.92, "Listening"), signal: c.signal,
  });
  const { segs, fixes } = applyGlossary(t.segments, glossary);
  const lines = buildLines(segs);
  if (!lines.length) fail("No speech was found in this recording.");
  c.beat(0.95, "Writing the transcript");
  const trackId = newId("trk");
  await tx(async () => {
    if (c.input.assistant === true && await one(`SELECT 1 FROM caption_track WHERE project_id = ? AND workspace_id = ? AND kind = 'source'`, proj.id, proj.workspace_id)) {
      fail("This assistant Hear is stale because a transcript already exists.");
    }
    await run(`DELETE FROM caption_track WHERE project_id = ? AND kind = 'source'`, proj.id);
    await run(
      `INSERT INTO caption_track (id, workspace_id, project_id, language, kind, status, engine, created_at, updated_at) VALUES (?, ?, ?, ?, 'source', 'draft', ?, ?, ?)`,
      trackId, proj.workspace_id, proj.id, t.language, t.engine, now(), now(),
    );
    for (const [i, l] of lines.entries())
      await run(
        `INSERT INTO caption_line (id, track_id, idx, start_ms, end_ms, text, words, flag) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        newId("ln"), trackId, i, l.startMs, l.endMs, l.text, JSON.stringify(l.words),
        lineFlag(l.text, l.words),
      );
  });
  rmSync(dir, { recursive: true, force: true });
  await run(
    `INSERT INTO usage_event (id, workspace_id, job_id, unit, amount, provider, idempotency_key, created_at) VALUES (?, ?, ?, 'audio_seconds', ?, 'this device', ?, ?) ON CONFLICT(idempotency_key) DO NOTHING`,
    newId("use"), proj.workspace_id, c.job.id, Math.round((src.duration_ms ?? 0) / 1000), `${c.job.id}:audio`, now(),
  );
  if (!await one(`SELECT 1 FROM clip WHERE project_id = ? LIMIT 1`, proj.id)) {
    await enqueue({ workspaceId: proj.workspace_id, projectId: proj.id, type: "suggest_clips", input: { count: 3 }, idempotencyKey: `suggest:${trackId}`, dependsOn: c.job.id, createdBy: c.job.created_by });
  }
    if (process.env.IZWI_FLAG_INJECTION === "1") {
      await enqueue({
        workspaceId: proj.workspace_id,
        projectId: proj.id,
        type: "injection_scan" as unknown as JobType,
        input: { trackId, afterIdx: -1 },
        idempotencyKey: `injection_scan:${trackId}:start`,
        dependsOn: c.job.id,
        createdBy: c.job.created_by,
        priority: 0,
      });
    }
  return { language: t.language, lines: lines.length, glossaryFixes: fixes, seconds: Math.round((now() - started) / 1000), engine: t.engine };
}

async function sourceLines(projectId: string) {
  const track = await one<{ id: string; language: string; status: string }>(`SELECT id, language, status FROM caption_track WHERE project_id = ? AND kind = 'source'`, projectId);
  if (!track) fail("There is no transcript yet. Run Hear first.");
  const rows = await all<LineRow>(`SELECT * FROM caption_line WHERE track_id = ? ORDER BY idx`, track.id);
  return { track, rows };
}

async function suggestJob(c: JobCtx) {
  const proj = await project(c.job.workspace_id, c.job.project_id!);
  const { rows } = await sourceLines(proj.id);
  const segs: Seg[] = rows.map((r) => ({ startMs: r.start_ms, endMs: r.end_ms, text: r.text.replace(/\n/g, " "), words: parse<Word[]>(r.words, []) }));
  const count = Math.max(1, Math.min(10, Number(c.input.count ?? 3)));
  const ideas = suggestClips(segs, { count, ...(clipDefaults[proj.kind] ?? clipDefaults.podcast) });
  const existing = await all<{ start_ms: number; end_ms: number }>(`SELECT start_ms, end_ms FROM clip WHERE project_id = ? AND status != 'dropped'`, proj.id);
  const clipIds: string[] = [];
  for (const idea of ideas) {
    if (existing.some((e) => idea.startMs < e.end_ms && idea.endMs > e.start_ms)) continue;
    const id = newId("clp");
    await run(
      `INSERT INTO clip (id, workspace_id, project_id, title, start_ms, end_ms, reason, origin, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'heuristic', 'suggested', ?, ?)`,
      id, proj.workspace_id, proj.id, idea.title, idea.startMs, idea.endMs, idea.reason, now(), now(),
    );
    clipIds.push(id);
  }
  return { added: clipIds.length, considered: ideas.length, clipIds };
}

// The Publish step of an approved plan. It runs after Cut, so it sees the clips Cut just made. The person approved a plan
// that renders them, so those suggestions become kept. Each render still passes the consent gate on its own.
async function publishJob(c: JobCtx) {
  const ws = c.job.workspace_id;
  const proj = await project(ws, c.job.project_id!);
  const cutJobId = typeof c.input.cutJobId === "string" ? c.input.cutJobId : null;
  if (cutJobId) {
    const cutJob = await one<{ output: string | null }>(`SELECT output FROM job WHERE id = ? AND workspace_id = ? AND project_id = ? AND type = 'suggest_clips'`, cutJobId, ws, proj.id);
    for (const id of parse<{ clipIds?: string[] }>(cutJob?.output, {}).clipIds ?? []) {
      await run(`UPDATE clip SET status = 'kept', updated_at = ? WHERE id = ? AND project_id = ? AND workspace_id = ? AND status = 'suggested'`, now(), id, proj.id, ws);
    }
  }
  const clips = await all<{ id: string; start_ms: number; end_ms: number; version: number }>(
    `SELECT c.id, c.start_ms, c.end_ms, c.version FROM clip c WHERE c.project_id = ? AND c.workspace_id = ? AND c.status = 'kept'
       AND NOT EXISTS (SELECT 1 FROM output o WHERE o.clip_id = c.id AND o.preset = 'vertical' AND o.status IN ('queued','ready','blocked'))
     ORDER BY c.start_ms`,
    proj.id, ws,
  );
  if (!clips.length) fail("There are no kept clips to render. Keep at least one clip, then run Publish again.");
  const language = (await one<{ language: string }>(`SELECT language FROM caption_track WHERE project_id = ? AND kind = 'source'`, proj.id))?.language ?? null;
  let lastRender: string | null = null;
  const renders: string[] = [];
  await tx(async () => {
    for (const clip of clips) {
      const outId = newId("out");
      await run(
        `INSERT INTO output (id, workspace_id, project_id, clip_id, preset, language, burn, status, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, 'vertical', ?, 1, 'queued', ?, ?, ?)`,
        outId, ws, proj.id, clip.id, language, c.job.created_by ?? "system", now(), now(),
      );
      const j = await enqueue({ workspaceId: ws, projectId: proj.id, type: "render", input: { outputId: outId, clip: { startMs: clip.start_ms, endMs: clip.end_ms, version: clip.version } }, idempotencyKey: `${c.job.id}:${clip.id}`, createdBy: c.job.created_by });
      await run(`UPDATE output SET job_id = ? WHERE id = ?`, j.id, outId);
      renders.push(j.id);
      lastRender = j.id;
    }
    // A Record step queued after Publish should wait for the renders, not just for this fan-out.
    if (lastRender) await run(`UPDATE job SET depends_on = ? WHERE depends_on = ? AND status = 'queued' AND workspace_id = ?`, lastRender, c.job.id, ws);
  });
  return { renders: renders.length, jobIds: renders };
}

async function translateJob(c: JobCtx) {
  const proj = await project(c.job.workspace_id, c.job.project_id!);
  const code = String(c.input.language ?? "");
  const target = LANGUAGES.find((l) => l.code === code) ?? fail("Choose a language IZWI knows.");
  const p: ProviderRow =
    (c.input.providerId ? await one<ProviderRow>(`SELECT * FROM provider WHERE id = ? AND workspace_id = ? AND last_test_ok = 1`, String(c.input.providerId), proj.workspace_id) : undefined) ??
    await providerFor(proj.workspace_id, "translate") ??
    fail("No working translation provider is connected. Add one in Run on, then try again.");
  const { track, rows } = await sourceLines(proj.id);
  if (track.language === code) fail(`The transcript is already in ${target.name}.`);
  const keep = parse<GlossaryEntry[]>((await prefs(proj.workspace_id))?.glossary, []).map((g) => g.term);
  c.beat(0.1, `Translating into ${target.name}`);
  const { result, flags, usage } = await translateLines(p, rows.map((r) => ({ i: r.idx, t: r.text.replace(/\n/g, " ") })), { code, name: target.name }, keep);
  c.beat(0.9, "Saving the draft");
  const trackId = newId("trk");
  await tx(async () => {
    await run(`DELETE FROM caption_track WHERE project_id = ? AND kind = 'translation' AND language = ?`, proj.id, code);
    await run(
      `INSERT INTO caption_track (id, workspace_id, project_id, language, kind, status, source_track_id, engine, created_at, updated_at) VALUES (?, ?, ?, ?, 'translation', 'draft', ?, ?, ?, ?)`,
      trackId, proj.workspace_id, proj.id, code, track.id, `${p.label} · ${p.model ?? p.kind}`, now(), now(),
    );
    for (const r of rows) {
      const text = result.get(r.idx) ?? r.text;
      await run(
        `INSERT INTO caption_line (id, track_id, idx, start_ms, end_ms, text, flag) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        newId("ln"), trackId, r.idx, r.start_ms, r.end_ms, lineText(text.split(/\s+/).map((w) => ({ w }))), flags.get(r.idx) ?? null,
      );
    }
  });
  for (const [unit, amount] of [["tokens_in", usage.input], ["tokens_out", usage.output]] as const) {
    await run(
      `INSERT INTO usage_event (id, workspace_id, job_id, unit, amount, provider, idempotency_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(idempotency_key) DO NOTHING`,
      newId("use"), proj.workspace_id, c.job.id, unit, amount, p.label, `${c.job.id}:${unit}`, now(),
    );
  }
  return { language: code, name: target.name, lines: rows.length, flagged: flags.size, engine: p.label };
}

type OutputRow = { id: string; workspace_id: string; project_id: string; clip_id: string | null; preset: string; language: string | null; burn: number; status: string };

async function renderJob(c: JobCtx) {
  const out = await one<OutputRow>(`SELECT * FROM output WHERE id = ? AND workspace_id = ?`, String(c.input.outputId), c.job.workspace_id) ?? fail("This export was removed.");
  const liveClip = await one<{ id: string; title: string; start_ms: number; end_ms: number; version: number }>(`SELECT * FROM clip WHERE id = ? AND workspace_id = ?`, out.clip_id, out.workspace_id) ?? fail("The clip for this export was removed.");
  const clipSnapshot = c.input.clip as { startMs?: number; endMs?: number; version?: number } | undefined;
  const clip = clipSnapshot && Number.isInteger(clipSnapshot.startMs) && Number.isInteger(clipSnapshot.endMs) && Number.isInteger(clipSnapshot.version)
    ? { ...liveClip, start_ms: clipSnapshot.startMs!, end_ms: clipSnapshot.endMs!, version: clipSnapshot.version! }
    : liveClip;
  const proj = await project(c.job.workspace_id, out.project_id);
  if (!isPreset(out.preset)) fail("Unknown export format.");
  const gate = await gateFor(proj.id, clip.start_ms, clip.end_ms);
  if (!gate.ok) {
    await run(`UPDATE output SET status = 'blocked', note = ?, updated_at = ? WHERE id = ?`, gateReason(gate), now(), out.id);
    throw new Blocked(gateReason(gate));
  }
  const declaration = await one<{ id: string; created_at: number; statement: string }>(`SELECT id, created_at, statement FROM declaration WHERE project_id = ? ORDER BY created_at DESC LIMIT 1`, proj.id);
  if (!declaration) fail("The creator declaration changed before this render could start.");
  const consentSnapshot = await renderConsentSnapshot(proj.id, clip.start_ms, clip.end_ms);
  const snapshot = { declaration: { id: declaration.id, created_at: declaration.created_at, text: declaration.statement }, consentRefs: consentSnapshot };
  const src = await latest(proj.id, "source") ?? fail("The original recording is missing.");
  const p = parse<Probe>(src.meta, { durationMs: src.duration_ms ?? 0, hasAudio: true, hasVideo: false, format: "" });
  let lines: CapLine[] = [];
  if (out.language) {
    const track = await one<{ id: string; kind: string; status: string }>(`SELECT id, kind, status FROM caption_track WHERE project_id = ? AND language = ? ORDER BY kind = 'source' DESC LIMIT 1`, proj.id, out.language);
    if (!track) fail(`There are no ${langName(out.language)} captions yet.`);
    if (track.kind === "translation" && track.status !== "approved") {
      const reason = `${langName(out.language)} captions are still a draft. Approve every line first.`;
      await run(`UPDATE output SET status = 'blocked', note = ?, updated_at = ? WHERE id = ?`, reason, now(), out.id);
      throw new Blocked(reason);
    }
    const rows = await all<LineRow>(`SELECT * FROM caption_line WHERE track_id = ? ORDER BY idx`, track.id);
    lines = sliceLines(rows.map((r) => ({ startMs: r.start_ms, endMs: r.end_ms, text: r.text, words: parse<Word[] | null>(r.words, null) })), clip.start_ms, clip.end_ms);
  }
  const preset = PRESETS[out.preset];
  const key = storageKey(proj.workspace_id, proj.id, `render-${out.id}-${c.job.attempts}-${c.job.worker_id}.mp4`);
  const tempKey = `${key}.tmp`;
  const sidecarKey = `${key}.provenance.json`;
  const tempSidecarKey = `${sidecarKey}.tmp`;
  const srtKey = lines.length ? storageKey(proj.workspace_id, proj.id, `render-${out.id}-${c.job.attempts}-${c.job.worker_id}.srt`) : undefined;
  const tempSrtKey = srtKey ? `${srtKey}.tmp` : undefined;
  ensureDirFor(absPath(tempKey));
  const ass = out.burn && lines.length ? toASS(lines, { width: preset.w, height: preset.h, font: BIN.captionFont, karaoke: lines.some((l) => l.words.length > 0) }) : undefined;
  const renderDir = tmpDir(`${c.job.id}-${c.job.attempts}`);
  try {
    await renderClip({
      src: await localCopy(src.storage_key), out: absPath(tempKey), workDir: renderDir, startMs: clip.start_ms, endMs: clip.end_ms,
      preset: out.preset, hasVideo: p.hasVideo, hasAudio: p.hasAudio, ass, onProgress: (x) => c.beat(x * 0.95, `Rendering ${preset.label}`), signal: c.signal,
    });
  } catch (e) {
    rmSync(absPath(tempKey), { force: true });
    throw e;
  } finally {
    rmSync(renderDir, { recursive: true, force: true });
  }
  const slug = clip.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40).replace(/^-|-$/g, "") || "clip";
  const filename = `${slug}-${out.preset}${out.language ? "-" + out.language : ""}.mp4`;
  let assetId = "";
  let uploaded = false;
  const keys = ledgerKeys();
  try {
    const plan = await one<{ planner: string }>(`SELECT planner FROM plan_run WHERE project_id = ? ORDER BY created_at DESC LIMIT 1`, proj.id);
    const sourceTrack = await one<{ engine: string }>(`SELECT engine FROM caption_track WHERE project_id = ? AND kind = 'source' ORDER BY created_at DESC LIMIT 1`, proj.id);
    await writeProvenance(absPath(tempSidecarKey), {
      output_id: out.id, project_id: proj.id, created_at: now(), declaration: snapshot.declaration,
      ai_use: { transcription: sourceTrack?.engine || "whisper.cpp base", planner: plan?.planner || "rules" },
      consent_refs: snapshot.consentRefs,
    }, absPath(tempKey), keys);
    if (!verifyProvenance(readFileSync(absPath(tempSidecarKey)), readFileSync(absPath(tempKey)), keys.pubHex).ok) throw new Error("Provenance verification failed.");
    if (tempSrtKey) writeFileSync(absPath(tempSrtKey), toSRT(lines), "utf8");
    const mediaBytes = statSync(absPath(tempKey)).size;
    const mediaHash = await sha256File(absPath(tempKey));
    const srtBytes = tempSrtKey ? statSync(absPath(tempSrtKey)).size : 0;
    const srtHash = tempSrtKey ? await sha256File(absPath(tempSrtKey)) : "";
    await persist(key, absPath(tempKey), "video/mp4");
    await persist(sidecarKey, absPath(tempSidecarKey), "application/json");
    if (tempSrtKey && srtKey) await persist(srtKey, absPath(tempSrtKey), "application/x-subrip");
    uploaded = true;
    const release = await tx(async () => {
      const active = await one(`SELECT 1 FROM job WHERE id = ? AND worker_id = ? AND attempts = ? AND status = 'running' AND lease_until > ?`, c.job.id, c.job.worker_id, c.job.attempts, now());
      const current = await one<{ status: string; job_id: string | null }>(`SELECT status, job_id FROM output WHERE id = ? AND workspace_id = ?`, out.id, out.workspace_id);
      if (!active || c.signal.aborted || !current || current.job_id !== c.job.id || current.status !== "queued") return "inactive";
      const currentClip = await one<{ start_ms: number; end_ms: number; version: number }>(`SELECT start_ms, end_ms, version FROM clip WHERE id = ? AND workspace_id = ?`, clip.id, out.workspace_id);
      if (!currentClip || currentClip.start_ms !== clip.start_ms || currentClip.end_ms !== clip.end_ms || currentClip.version !== clip.version) return "The clip changed during rendering. Render it again.";
      const currentDeclaration = await one<{ id: string; created_at: number; statement: string }>(`SELECT id, created_at, statement FROM declaration WHERE project_id = ? ORDER BY created_at DESC LIMIT 1`, proj.id);
      if (!currentDeclaration || currentDeclaration.id !== snapshot.declaration.id || currentDeclaration.created_at !== snapshot.declaration.created_at) return "The creator declaration changed during rendering. Render again to create fresh signed provenance.";
      const currentConsents = await renderConsentSnapshot(proj.id, clip.start_ms, clip.end_ms);
      if (canonical(currentConsents) !== canonical(snapshot.consentRefs)) return "Consent changed during rendering. The signed render was discarded; render again after checking consent.";
      const finalGate = await gateFor(proj.id, clip.start_ms, clip.end_ms);
      if (!finalGate.ok) return gateReason(finalGate);
      renameSync(absPath(tempKey), absPath(key));
      renameSync(absPath(tempSidecarKey), absPath(sidecarKey));
      if (tempSrtKey && srtKey) renameSync(absPath(tempSrtKey), absPath(srtKey));
      assetId = newId("ast");
      await run(`INSERT INTO asset (id, workspace_id, project_id, kind, storage_key, filename, mime, bytes, sha256, duration_ms, width, height, meta, created_at) VALUES (?, ?, ?, 'render', ?, ?, 'video/mp4', ?, ?, ?, ?, ?, ?, ?)`, assetId, proj.workspace_id, proj.id, key, filename, mediaBytes, mediaHash, clip.end_ms - clip.start_ms, preset.w, preset.h, JSON.stringify({ outputId: out.id, clipId: clip.id, provenance: PROVENANCE_LABEL, sidecar: path.basename(absPath(sidecarKey)) }), now());
      if (srtKey && tempSrtKey) await run(`INSERT INTO asset (id, workspace_id, project_id, kind, storage_key, filename, mime, bytes, sha256, meta, created_at) VALUES (?, ?, ?, 'caption', ?, ?, 'application/x-subrip', ?, ?, ?, ?)`, newId("ast"), proj.workspace_id, proj.id, srtKey, `${slug}-${out.language}.srt`, srtBytes, srtHash, JSON.stringify({ outputId: out.id }), now());
      await run(`UPDATE output SET status = 'ready', asset_id = ?, note = NULL, updated_at = ? WHERE id = ?`, assetId, now(), out.id);
      await run(`UPDATE job SET status = 'succeeded', output = ?, progress = 1, stage = 'done', lease_until = NULL, finished_at = ? WHERE id = ?`, JSON.stringify({ outputId: out.id, preset: out.preset, bytes: mediaBytes, provenance: PROVENANCE_LABEL }), now(), c.job.id);
      return "ready";
    });
    if (release !== "ready") throw new Blocked(release);
    return { outputId: out.id, preset: out.preset, bytes: mediaBytes, provenance: PROVENANCE_LABEL, sidecar: path.basename(absPath(sidecarKey)) };
  } catch (error) {
    rmSync(absPath(tempKey), { force: true }); rmSync(absPath(tempSidecarKey), { force: true });
    if (tempSrtKey) rmSync(absPath(tempSrtKey), { force: true });
    if (uploaded) {
      await removeObject(key).catch(() => {});
      await removeObject(sidecarKey).catch(() => {});
      if (srtKey) await removeObject(srtKey).catch(() => {});
    }
    rmSync(absPath(key), { force: true }); rmSync(absPath(sidecarKey), { force: true });
    if (srtKey) rmSync(absPath(srtKey), { force: true });
    if (assetId) await run(`DELETE FROM asset WHERE id = ?`, assetId);
    const reason = error instanceof Error ? error.message : "Signed provenance failed.";
    await run(`UPDATE output SET status = 'failed', note = ?, updated_at = ? WHERE id = ? AND status != 'ready'`, reason, now(), out.id);
    throw error;
  }
}

async function packageJob(c: JobCtx) {
  const proj = await project(c.job.workspace_id, c.job.project_id!);
  const src = await latest(proj.id, "source") ?? fail("The original recording is missing.");
  const p = parse<Probe>(src.meta, { durationMs: src.duration_ms ?? 0, hasAudio: true, hasVideo: false, format: "" });
  const files: Zippable = {};
  const record: { file: string; sha256?: string; bytes: number; note?: string }[] = [];
  const add = (name: string, data: Uint8Array, note?: string, store = false) => {
    files[name] = store ? [data, { level: 0 }] : data;
    record.push({ file: name, bytes: data.length, note });
  };

  c.beat(0.1, "Collecting captions");
  const tracks = await all<{ id: string; language: string; kind: string; status: string; engine: string }>(`SELECT * FROM caption_track WHERE project_id = ? ORDER BY kind DESC, language`, proj.id);
  for (const t of tracks) {
    const rows = await all<LineRow>(`SELECT * FROM caption_line WHERE track_id = ? ORDER BY idx`, t.id);
    const lines = rows.map((r) => ({ startMs: r.start_ms, endMs: r.end_ms, text: r.text }));
    const tag = t.kind === "translation" && t.status !== "approved" ? ".DRAFT" : "";
    add(`captions/${t.language}${tag}.srt`, strToU8(toSRT(lines)), `${langName(t.language)}, ${t.status}, ${t.engine}`);
    add(`captions/${t.language}${tag}.vtt`, strToU8(toVTT(lines)));
    if (t.kind === "source") add("transcript.txt", strToU8(rows.map((r) => r.text.replace(/\n/g, " ")).join("\n")));
  }

  c.beat(0.3, "Writing editor timelines");
  const clips = await all<{ title: string; start_ms: number; end_ms: number; reason: string }>(`SELECT * FROM clip WHERE project_id = ? AND status = 'kept' ORDER BY start_ms`, proj.id);
  if (clips.length) {
    const refs = clips.map((k) => ({ title: k.title, startMs: k.start_ms, endMs: k.end_ms, reason: k.reason }));
    const fps = p.fps && p.fps > 0 ? p.fps : 25;
    add("timeline/clips.edl", strToU8(toEDL(proj.title, src.filename, refs, fps)), "CMX 3600 EDL for DaVinci Resolve and other editors");
    add("timeline/clips.otio", strToU8(JSON.stringify(toOTIO({ title: proj.title, sourceName: src.filename, durationMs: p.durationMs, fps, hasVideo: p.hasVideo, hasAudio: p.hasAudio, clips: refs }), null, 2)), "OpenTimelineIO timeline");
  }

  c.beat(0.5, "Adding finished renders");
  const ready = await all<{ storage_key: string; filename: string; sha256: string; bytes: number }>(
    `SELECT a.storage_key, a.filename, a.sha256, a.bytes FROM output o JOIN asset a ON a.id = o.asset_id WHERE o.project_id = ? AND o.status = 'ready'`, proj.id,
  );
  for (const r of ready) {
    add(`renders/${r.filename}`, new Uint8Array(readFileSync(await localCopy(r.storage_key))), undefined, true);
    record[record.length - 1].sha256 = r.sha256;
    const sidecarPath = await localCopy(`${r.storage_key}.provenance.json`).catch(() => "");
    if (sidecarPath && existsSync(sidecarPath)) add(`renders/${r.filename}.provenance.json`, new Uint8Array(readFileSync(sidecarPath)), PROVENANCE_LABEL);
  }

  c.beat(0.8, "Writing the record sheet");
  const people = await Promise.all((await all<{ id: string; name: string; role: string }>(`SELECT id, name, role FROM person WHERE project_id = ?`, proj.id)).map(async (x) => ({
    ...x,
    consent: await one<{ status: string; scope: string; statement: string; responded_name: string | null; responded_at: number | null }>(
      `SELECT status, scope, statement, responded_name, responded_at FROM consent WHERE person_id = ? ORDER BY requested_at DESC LIMIT 1`, x.id,
    ) ?? null,
  })));
  const declaration = await one<{ statement: string; created_at: number; user_id: string }>(`SELECT statement, created_at, user_id FROM declaration WHERE project_id = ? ORDER BY created_at DESC LIMIT 1`, proj.id) ?? null;
  const sheet = {
    project: { title: proj.title, kind: proj.kind }, source: { filename: src.filename, sha256: (src as unknown as { sha256: string }).sha256, durationMs: src.duration_ms },
    declaration, people, files: record, generatedAt: new Date().toISOString(),
    note: "A declaration and consent records show what people stated and agreed to in IZWI. They are not a legal ownership check.",
  };
  add("record.json", strToU8(JSON.stringify(sheet, null, 2)));
  add("README.txt", strToU8([
    `${proj.title}: export package from IZWI AI`, "",
    "captions/   SRT and VTT per language. Files marked DRAFT have not been approved by a person.",
    "timeline/   clips.edl (CMX 3600) and clips.otio. In DaVinci Resolve: File > Import > Timeline, then relink the source file.",
    "renders/    Finished clips, ready to upload.",
    "renders/*.provenance.json  IZWI signed provenance (not C2PA), signed with the IZWI ledger key.",
    "record.json Who declared and agreed to what, with file checksums.", "",
    "CapCut: on Desktop or Web, use Captions > Add captions > Import file and pick an .srt file. The mobile app cannot import caption files.",
  ].join("\n")));

  const zipped = zipSync(files, { level: 6 });
  const key = storageKey(proj.workspace_id, proj.id, `package-${c.job.id}.zip`);
  ensureDirFor(absPath(key));
  writeFileSync(absPath(key), zipped);
  await addAsset({ ws: proj.workspace_id, projectId: proj.id, kind: "package", key, filename: `${proj.title.replace(/[^\w\- ]+/g, "").slice(0, 40) || "izwi"}-package.zip`, mime: "application/zip", meta: { files: record.length } });
  return { files: record.length, bytes: zipped.length };
}

// Called by the worker when a job fails for good, so the screens can say what happened.
export async function onFailed(job: JobRow, message: string) {
  if (job.type === "render") {
    const outputId = parse<{ outputId?: string }>(job.input, {}).outputId;
    if (outputId) await run(`UPDATE output SET status = 'failed', note = ?, updated_at = ? WHERE id = ?`, message, now(), outputId);
  }
}
