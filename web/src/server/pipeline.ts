// What each job does. Runs in the worker process. Every step writes real files and real rows, or fails with a reason.
import { readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { strToU8, zipSync, type Zippable } from "fflate";
import { all, newId, now, one, parse, run, tx } from "./db";
import { BIN, LIMITS, STORAGE } from "./env";
import { enqueue, type JobRow } from "./jobs";
import { absPath, ensureDirFor, sha256File, storageKey } from "./storage";
import { extractSpeechWav, makeProxy, peaks, poster, probe, ToolError, whisper, type Probe } from "./media";
import { applyGlossary, buildLines, lineFlag, lineText, sliceLines, toASS, toSRT, toVTT, type CapLine, type GlossaryEntry, type Seg, type Word } from "./captions";
import { clipDefaults, suggestClips } from "./clips";
import { toEDL, toOTIO } from "./interop";
import { gateFor, gateReason } from "./rights";
import { providerFor, translateLines, type ProviderRow } from "./providers";
import { isPreset, PRESETS, renderClip } from "./render";
import { LANGUAGES, langName } from "../lib/languages";

export class Blocked extends Error {}
export type JobCtx = { job: JobRow; input: Record<string, unknown>; beat: (p?: number, stage?: string) => void; signal: AbortSignal };

type Asset = { id: string; workspace_id: string; project_id: string; kind: string; storage_key: string; filename: string; mime: string; bytes: number; duration_ms: number | null; width: number | null; height: number | null; meta: string };
type Project = { id: string; workspace_id: string; title: string; kind: string; spoken_language: string };
type LineRow = { id: string; idx: number; start_ms: number; end_ms: number; text: string; words: string | null; status: string };

const project = (id: string) => one<Project>(`SELECT * FROM project WHERE id = ?`, id) ?? fail("The project no longer exists.");
const asset = (id: unknown) => one<Asset>(`SELECT * FROM asset WHERE id = ?`, String(id)) ?? fail("A file this step needs is missing.");
const latest = (projectId: string, kind: string) => one<Asset>(`SELECT * FROM asset WHERE project_id = ? AND kind = ? ORDER BY created_at DESC LIMIT 1`, projectId, kind);
function fail(msg: string, retryable = false): never {
  throw new ToolError(msg, retryable);
}
const prefs = (ws: string) => one<{ glossary: string; accuracy: string }>(`SELECT glossary, accuracy FROM workspace_pref WHERE workspace_id = ?`, ws);

async function addAsset(a: { ws: string; projectId: string; kind: string; key: string; filename: string; mime: string; durationMs?: number | null; width?: number | null; height?: number | null; meta?: unknown }) {
  const file = absPath(a.key);
  const id = newId("ast");
  run(
    `INSERT INTO asset (id, workspace_id, project_id, kind, storage_key, filename, mime, bytes, sha256, duration_ms, width, height, meta, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(storage_key) DO UPDATE SET bytes = excluded.bytes, sha256 = excluded.sha256, meta = excluded.meta, created_at = excluded.created_at`,
    id, a.ws, a.projectId, a.kind, a.key, a.filename, a.mime, statSync(file).size, await sha256File(file),
    a.durationMs ?? null, a.width ?? null, a.height ?? null, JSON.stringify(a.meta ?? {}), now(),
  );
  return one<{ id: string }>(`SELECT id FROM asset WHERE storage_key = ?`, a.key)!.id;
}

const tmpDir = (jobId: string) => path.join(STORAGE, "tmp", jobId);

export async function handle(c: JobCtx): Promise<unknown> {
  switch (c.job.type) {
    case "probe": return probeJob(c);
    case "proxy": return proxyJob(c);
    case "transcribe": return transcribeJob(c);
    case "suggest_clips": return suggestJob(c);
    case "translate": return translateJob(c);
    case "render": return renderJob(c);
    case "package": return packageJob(c);
    default: return fail(`Unknown step ${c.job.type}`);
  }
}

async function probeJob(c: JobCtx) {
  const a = asset(c.input.assetId);
  c.beat(0.1, "Reading the file");
  const p = await probe(absPath(a.storage_key));
  if (!p.hasAudio && !p.hasVideo) fail("No audio or video was found in this file.");
  if (p.durationMs < 1000) fail("This file is shorter than one second.");
  if (p.durationMs > LIMITS.sourceSeconds * 1000) fail(`This file is longer than the ${LIMITS.sourceSeconds / 3600}-hour limit.`);
  run(`UPDATE asset SET duration_ms = ?, width = ?, height = ?, meta = ? WHERE id = ?`, p.durationMs, p.width ?? null, p.height ?? null, JSON.stringify(p), a.id);
  enqueue({ workspaceId: a.workspace_id, projectId: a.project_id, type: "proxy", input: { assetId: a.id }, idempotencyKey: `proxy:${a.id}`, dependsOn: c.job.id, createdBy: c.job.created_by });
  return { durationMs: p.durationMs, hasVideo: p.hasVideo, hasAudio: p.hasAudio, width: p.width, height: p.height };
}

async function proxyJob(c: JobCtx) {
  const a = asset(c.input.assetId);
  const p = parse<Probe>(a.meta, { durationMs: a.duration_ms ?? 0, hasAudio: true, hasVideo: false, format: "" });
  const src = absPath(a.storage_key);
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
      enqueue({ workspaceId: a.workspace_id, projectId: a.project_id, type: "transcribe", input: { assetId: a.id }, idempotencyKey: `transcribe:${a.id}`, dependsOn: c.job.id, createdBy: c.job.created_by });
    }
  }
  return { preview: true, poster: p.hasVideo, waveform: p.hasAudio };
}

async function transcribeJob(c: JobCtx) {
  const src = asset(c.input.assetId);
  const proj = project(src.project_id);
  const wav = one<Asset>(`SELECT * FROM asset WHERE project_id = ? AND kind = 'audio' ORDER BY created_at DESC LIMIT 1`, proj.id) ?? fail("The audio for listening is missing. Run the preview step again.");
  const pf = prefs(proj.workspace_id);
  const glossary = parse<GlossaryEntry[]>(pf?.glossary, []);
  const lang = proj.spoken_language === "auto" ? "auto" : proj.spoken_language;
  const known = LANGUAGES.find((l) => l.code === lang);
  if (known && !known.whisper) {
    fail(`Whisper does not list ${known.name}. Connect a ${known.name} speech endpoint in Run on, or set the spoken language to one Whisper covers.`);
  }
  const dir = tmpDir(c.job.id);
  ensureDirFor(path.join(dir, "x"));
  const started = now();
  const t = await whisper(absPath(wav.storage_key), path.join(dir, "transcript"), {
    language: lang, prompt: glossary.map((g) => g.term).join(", "), accurate: pf?.accuracy === "accurate",
    onProgress: (x) => c.beat(x * 0.92, "Listening"), signal: c.signal,
  });
  const { segs, fixes } = applyGlossary(t.segments, glossary);
  const lines = buildLines(segs);
  if (!lines.length) fail("No speech was found in this recording.");
  c.beat(0.95, "Writing the transcript");
  const trackId = newId("trk");
  tx(() => {
    run(`DELETE FROM caption_track WHERE project_id = ? AND kind = 'source'`, proj.id);
    run(
      `INSERT INTO caption_track (id, workspace_id, project_id, language, kind, status, engine, created_at, updated_at) VALUES (?, ?, ?, ?, 'source', 'draft', ?, ?, ?)`,
      trackId, proj.workspace_id, proj.id, t.language, t.engine, now(), now(),
    );
    lines.forEach((l, i) =>
      run(
        `INSERT INTO caption_line (id, track_id, idx, start_ms, end_ms, text, words, flag) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        newId("ln"), trackId, i, l.startMs, l.endMs, l.text, JSON.stringify(l.words),
        lineFlag(l.text, l.words),
      ),
    );
  });
  rmSync(dir, { recursive: true, force: true });
  run(
    `INSERT INTO usage_event (id, workspace_id, job_id, unit, amount, provider, idempotency_key, created_at) VALUES (?, ?, ?, 'audio_seconds', ?, 'this device', ?, ?) ON CONFLICT(idempotency_key) DO NOTHING`,
    newId("use"), proj.workspace_id, c.job.id, Math.round((src.duration_ms ?? 0) / 1000), `${c.job.id}:audio`, now(),
  );
  if (!one(`SELECT 1 FROM clip WHERE project_id = ? LIMIT 1`, proj.id)) {
    enqueue({ workspaceId: proj.workspace_id, projectId: proj.id, type: "suggest_clips", input: { count: 3 }, idempotencyKey: `suggest:${trackId}`, dependsOn: c.job.id, createdBy: c.job.created_by });
  }
  return { language: t.language, lines: lines.length, glossaryFixes: fixes, seconds: Math.round((now() - started) / 1000), engine: t.engine };
}

function sourceLines(projectId: string) {
  const track = one<{ id: string; language: string; status: string }>(`SELECT id, language, status FROM caption_track WHERE project_id = ? AND kind = 'source'`, projectId);
  if (!track) fail("There is no transcript yet. Run Hear first.");
  const rows = all<LineRow>(`SELECT * FROM caption_line WHERE track_id = ? ORDER BY idx`, track.id);
  return { track, rows };
}

async function suggestJob(c: JobCtx) {
  const proj = project(c.job.project_id!);
  const { rows } = sourceLines(proj.id);
  const segs: Seg[] = rows.map((r) => ({ startMs: r.start_ms, endMs: r.end_ms, text: r.text.replace(/\n/g, " "), words: parse<Word[]>(r.words, []) }));
  const count = Math.max(1, Math.min(10, Number(c.input.count ?? 3)));
  const ideas = suggestClips(segs, { count, ...(clipDefaults[proj.kind] ?? clipDefaults.podcast) });
  const existing = all<{ start_ms: number; end_ms: number }>(`SELECT start_ms, end_ms FROM clip WHERE project_id = ? AND status != 'dropped'`, proj.id);
  let added = 0;
  for (const idea of ideas) {
    if (existing.some((e) => idea.startMs < e.end_ms && idea.endMs > e.start_ms)) continue;
    run(
      `INSERT INTO clip (id, workspace_id, project_id, title, start_ms, end_ms, reason, origin, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'heuristic', 'suggested', ?, ?)`,
      newId("clp"), proj.workspace_id, proj.id, idea.title, idea.startMs, idea.endMs, idea.reason, now(), now(),
    );
    added++;
  }
  return { added, considered: ideas.length };
}

async function translateJob(c: JobCtx) {
  const proj = project(c.job.project_id!);
  const code = String(c.input.language ?? "");
  const target = LANGUAGES.find((l) => l.code === code) ?? fail("Choose a language IZWI knows.");
  const p: ProviderRow =
    (c.input.providerId ? one<ProviderRow>(`SELECT * FROM provider WHERE id = ? AND workspace_id = ? AND last_test_ok = 1`, String(c.input.providerId), proj.workspace_id) : undefined) ??
    providerFor(proj.workspace_id, "translate") ??
    fail("No working translation provider is connected. Add one in Run on, then try again.");
  const { track, rows } = sourceLines(proj.id);
  if (track.language === code) fail(`The transcript is already in ${target.name}.`);
  const keep = parse<GlossaryEntry[]>(prefs(proj.workspace_id)?.glossary, []).map((g) => g.term);
  c.beat(0.1, `Translating into ${target.name}`);
  const { result, flags, usage } = await translateLines(p, rows.map((r) => ({ i: r.idx, t: r.text.replace(/\n/g, " ") })), { code, name: target.name }, keep);
  c.beat(0.9, "Saving the draft");
  const trackId = newId("trk");
  tx(() => {
    run(`DELETE FROM caption_track WHERE project_id = ? AND kind = 'translation' AND language = ?`, proj.id, code);
    run(
      `INSERT INTO caption_track (id, workspace_id, project_id, language, kind, status, source_track_id, engine, created_at, updated_at) VALUES (?, ?, ?, ?, 'translation', 'draft', ?, ?, ?, ?)`,
      trackId, proj.workspace_id, proj.id, code, track.id, `${p.label} · ${p.model ?? p.kind}`, now(), now(),
    );
    for (const r of rows) {
      const text = result.get(r.idx) ?? r.text;
      run(
        `INSERT INTO caption_line (id, track_id, idx, start_ms, end_ms, text, flag) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        newId("ln"), trackId, r.idx, r.start_ms, r.end_ms, lineText(text.split(/\s+/).map((w) => ({ w }))), flags.get(r.idx) ?? null,
      );
    }
  });
  for (const [unit, amount] of [["tokens_in", usage.input], ["tokens_out", usage.output]] as const) {
    run(
      `INSERT INTO usage_event (id, workspace_id, job_id, unit, amount, provider, idempotency_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(idempotency_key) DO NOTHING`,
      newId("use"), proj.workspace_id, c.job.id, unit, amount, p.label, `${c.job.id}:${unit}`, now(),
    );
  }
  return { language: code, name: target.name, lines: rows.length, flagged: flags.size, engine: p.label };
}

type OutputRow = { id: string; workspace_id: string; project_id: string; clip_id: string | null; preset: string; language: string | null; burn: number; status: string };

async function renderJob(c: JobCtx) {
  const out = one<OutputRow>(`SELECT * FROM output WHERE id = ?`, String(c.input.outputId)) ?? fail("This export was removed.");
  const clip = one<{ id: string; title: string; start_ms: number; end_ms: number }>(`SELECT * FROM clip WHERE id = ?`, out.clip_id) ?? fail("The clip for this export was removed.");
  const proj = project(out.project_id);
  if (!isPreset(out.preset)) fail("Unknown export format.");
  const gate = gateFor(proj.id, clip.start_ms, clip.end_ms);
  if (!gate.ok) {
    run(`UPDATE output SET status = 'blocked', note = ?, updated_at = ? WHERE id = ?`, gateReason(gate), now(), out.id);
    throw new Blocked(gateReason(gate));
  }
  const src = latest(proj.id, "source") ?? fail("The original recording is missing.");
  const p = parse<Probe>(src.meta, { durationMs: src.duration_ms ?? 0, hasAudio: true, hasVideo: false, format: "" });
  let lines: CapLine[] = [];
  if (out.language) {
    const track = one<{ id: string; kind: string; status: string }>(`SELECT id, kind, status FROM caption_track WHERE project_id = ? AND language = ? ORDER BY kind = 'source' DESC LIMIT 1`, proj.id, out.language);
    if (!track) fail(`There are no ${langName(out.language)} captions yet.`);
    if (track.kind === "translation" && track.status !== "approved") {
      const reason = `${langName(out.language)} captions are still a draft. Approve every line first.`;
      run(`UPDATE output SET status = 'blocked', note = ?, updated_at = ? WHERE id = ?`, reason, now(), out.id);
      throw new Blocked(reason);
    }
    const rows = all<LineRow>(`SELECT * FROM caption_line WHERE track_id = ? ORDER BY idx`, track.id);
    lines = sliceLines(rows.map((r) => ({ startMs: r.start_ms, endMs: r.end_ms, text: r.text, words: parse<Word[] | null>(r.words, null) })), clip.start_ms, clip.end_ms);
  }
  const preset = PRESETS[out.preset];
  const key = storageKey(proj.workspace_id, proj.id, `render-${out.id}.mp4`);
  ensureDirFor(absPath(key));
  const ass = out.burn && lines.length ? toASS(lines, { width: preset.w, height: preset.h, font: BIN.captionFont, karaoke: lines.some((l) => l.words.length > 0) }) : undefined;
  await renderClip({
    src: absPath(src.storage_key), out: absPath(key), workDir: tmpDir(c.job.id), startMs: clip.start_ms, endMs: clip.end_ms,
    preset: out.preset, hasVideo: p.hasVideo, hasAudio: p.hasAudio, ass, onProgress: (x) => c.beat(x * 0.95, `Rendering ${preset.label}`), signal: c.signal,
  });
  rmSync(tmpDir(c.job.id), { recursive: true, force: true });
  const slug = clip.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40).replace(/^-|-$/g, "") || "clip";
  const assetId = await addAsset({ ws: proj.workspace_id, projectId: proj.id, kind: "render", key, filename: `${slug}-${out.preset}${out.language ? "-" + out.language : ""}.mp4`, mime: "video/mp4", durationMs: clip.end_ms - clip.start_ms, width: preset.w, height: preset.h, meta: { outputId: out.id, clipId: clip.id } });
  if (lines.length) {
    const srtKey = storageKey(proj.workspace_id, proj.id, `render-${out.id}.srt`);
    writeFileSync(absPath(srtKey), toSRT(lines), "utf8");
    await addAsset({ ws: proj.workspace_id, projectId: proj.id, kind: "caption", key: srtKey, filename: `${slug}-${out.language}.srt`, mime: "application/x-subrip", meta: { outputId: out.id } });
  }
  run(`UPDATE output SET status = 'ready', asset_id = ?, note = NULL, updated_at = ? WHERE id = ?`, assetId, now(), out.id);
  return { outputId: out.id, preset: out.preset, bytes: statSync(absPath(key)).size };
}

async function packageJob(c: JobCtx) {
  const proj = project(c.job.project_id!);
  const src = latest(proj.id, "source") ?? fail("The original recording is missing.");
  const p = parse<Probe>(src.meta, { durationMs: src.duration_ms ?? 0, hasAudio: true, hasVideo: false, format: "" });
  const files: Zippable = {};
  const record: { file: string; sha256?: string; bytes: number; note?: string }[] = [];
  const add = (name: string, data: Uint8Array, note?: string, store = false) => {
    files[name] = store ? [data, { level: 0 }] : data;
    record.push({ file: name, bytes: data.length, note });
  };

  c.beat(0.1, "Collecting captions");
  const tracks = all<{ id: string; language: string; kind: string; status: string; engine: string }>(`SELECT * FROM caption_track WHERE project_id = ? ORDER BY kind DESC, language`, proj.id);
  for (const t of tracks) {
    const rows = all<LineRow>(`SELECT * FROM caption_line WHERE track_id = ? ORDER BY idx`, t.id);
    const lines = rows.map((r) => ({ startMs: r.start_ms, endMs: r.end_ms, text: r.text }));
    const tag = t.kind === "translation" && t.status !== "approved" ? ".DRAFT" : "";
    add(`captions/${t.language}${tag}.srt`, strToU8(toSRT(lines)), `${langName(t.language)}, ${t.status}, ${t.engine}`);
    add(`captions/${t.language}${tag}.vtt`, strToU8(toVTT(lines)));
    if (t.kind === "source") add("transcript.txt", strToU8(rows.map((r) => r.text.replace(/\n/g, " ")).join("\n")));
  }

  c.beat(0.3, "Writing editor timelines");
  const clips = all<{ title: string; start_ms: number; end_ms: number; reason: string }>(`SELECT * FROM clip WHERE project_id = ? AND status = 'kept' ORDER BY start_ms`, proj.id);
  if (clips.length) {
    const refs = clips.map((k) => ({ title: k.title, startMs: k.start_ms, endMs: k.end_ms, reason: k.reason }));
    const fps = p.fps && p.fps > 0 ? p.fps : 25;
    add("timeline/clips.edl", strToU8(toEDL(proj.title, src.filename, refs, fps)), "CMX 3600 EDL for DaVinci Resolve and other editors");
    add("timeline/clips.otio", strToU8(JSON.stringify(toOTIO({ title: proj.title, sourceName: src.filename, durationMs: p.durationMs, fps, hasVideo: p.hasVideo, hasAudio: p.hasAudio, clips: refs }), null, 2)), "OpenTimelineIO timeline");
  }

  c.beat(0.5, "Adding finished renders");
  const ready = all<{ storage_key: string; filename: string; sha256: string; bytes: number }>(
    `SELECT a.storage_key, a.filename, a.sha256, a.bytes FROM output o JOIN asset a ON a.id = o.asset_id WHERE o.project_id = ? AND o.status = 'ready'`, proj.id,
  );
  for (const r of ready) {
    add(`renders/${r.filename}`, new Uint8Array(readFileSync(absPath(r.storage_key))), undefined, true);
    record[record.length - 1].sha256 = r.sha256;
  }

  c.beat(0.8, "Writing the record sheet");
  const people = all<{ id: string; name: string; role: string }>(`SELECT id, name, role FROM person WHERE project_id = ?`, proj.id).map((x) => ({
    ...x,
    consent: one<{ status: string; scope: string; statement: string; responded_name: string | null; responded_at: number | null }>(
      `SELECT status, scope, statement, responded_name, responded_at FROM consent WHERE person_id = ? ORDER BY requested_at DESC LIMIT 1`, x.id,
    ) ?? null,
  }));
  const declaration = one<{ statement: string; created_at: number; user_id: string }>(`SELECT statement, created_at, user_id FROM declaration WHERE project_id = ? ORDER BY created_at DESC LIMIT 1`, proj.id) ?? null;
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
export function onFailed(job: JobRow, message: string) {
  if (job.type === "render") {
    const outputId = parse<{ outputId?: string }>(job.input, {}).outputId;
    if (outputId) run(`UPDATE output SET status = 'failed', note = ?, updated_at = ? WHERE id = ?`, message, now(), outputId);
  }
}
