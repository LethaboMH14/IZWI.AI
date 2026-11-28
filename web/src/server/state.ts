// Everything the studio screen needs about one project, read in one go. All rows are from this workspace only.
import { all, one, parse } from "./db";
import { managesConsent, projectOf, type Ctx } from "./guard";
import { projectJobs } from "./jobs";
import { readText } from "./storage";
import { gateFor } from "./rights";
import { PUBLIC_URL } from "./env";

type A = { id: string; kind: string; filename: string; mime: string; bytes: number; sha256: string | null; duration_ms: number | null; width: number | null; height: number | null; meta: string; storage_key: string; created_at: number };

export async function projectState(ctx: Ctx, projectId: string, options: { lite?: boolean } = {}) {
  const p = await projectOf(ctx, projectId);
  const assets = await all<A>(`SELECT * FROM asset WHERE workspace_id = ? AND project_id = ? ORDER BY created_at`, ctx.workspaceId, p.id);
  const pick = (kind: string) => [...assets].reverse().find((a) => a.kind === kind);
  const source = pick("source");
  let peaks: number[] = [];
  if (!options.lite) {
    const peaksAsset = pick("peaks");
    if (peaksAsset) peaks = parse<number[]>(await readText(peaksAsset.storage_key), []);
  }
  const pub = (a?: A) => a && { id: a.id, filename: a.filename, mime: a.mime, bytes: a.bytes, sha256: a.sha256, durationMs: a.duration_ms, width: a.width, height: a.height, meta: parse<Record<string, unknown>>(a.meta, {}) };

  const tracks = await all<{ id: string; language: string; kind: string; status: string; engine: string; updated_at: number; lines: number; approved: number; flagged: number }>(
    `SELECT t.id, t.language, t.kind, t.status, t.engine, t.updated_at,
       (SELECT COUNT(*) FROM caption_line WHERE track_id = t.id) lines,
       (SELECT COUNT(*) FROM caption_line WHERE track_id = t.id AND status = 'approved') approved,
       (SELECT COUNT(*) FROM caption_line WHERE track_id = t.id AND flag IS NOT NULL) flagged
     FROM caption_track t WHERE t.project_id = ? ORDER BY t.kind DESC, t.language`, p.id,
  );
  const sourceTrack = tracks.find((t) => t.kind === "source");
  const lines = sourceTrack
    ? (await all<{ id: string; idx: number; start_ms: number; end_ms: number; text: string; words: string | null; status: string; flag: string | null; edited: number }>(
        `SELECT id, idx, start_ms, end_ms, text, words, status, flag, edited FROM caption_line WHERE track_id = ? ORDER BY idx`, sourceTrack.id,
      )).map((l) => ({ id: l.id, idx: l.idx, startMs: l.start_ms, endMs: l.end_ms, text: l.text, words: parse(l.words, []), status: l.status, flag: l.flag, edited: !!l.edited }))
    : [];

  const clips = await Promise.all((await all<{ id: string; title: string; start_ms: number; end_ms: number; reason: string; origin: string; status: string; version: number; updated_at: number }>(
    `SELECT * FROM clip WHERE workspace_id = ? AND project_id = ? ORDER BY start_ms`, ctx.workspaceId, p.id,
  )).map(async (c) => ({ id: c.id, title: c.title, startMs: c.start_ms, endMs: c.end_ms, reason: c.reason, origin: c.origin, status: c.status, version: c.version, updatedAt: c.updated_at, gate: await gateFor(p.id, c.start_ms, c.end_ms) })));
  const storageRows = await all<{ kind: string; bytes: number | null }>(`SELECT kind, SUM(bytes) AS bytes FROM asset WHERE workspace_id = ? AND project_id = ? GROUP BY kind`, ctx.workspaceId, p.id);
  const byKind = Object.fromEntries(storageRows.map((row) => [row.kind, row.bytes ?? 0]));
  const storage = { bytes: Object.values(byKind).reduce((sum, bytes) => sum + bytes, 0), byKind };

  const people = await Promise.all((await all<{ id: string; name: string; role: string; whole_recording: number }>(`SELECT * FROM person WHERE project_id = ? ORDER BY created_at`, p.id)).map(async (x) => ({
    id: x.id, name: x.name, role: x.role, wholeRecording: !!x.whole_recording,
    ranges: (await all<{ start_ms: number; end_ms: number }>(`SELECT start_ms, end_ms FROM appearance WHERE person_id = ? ORDER BY start_ms`, x.id)).map((r) => ({ startMs: r.start_ms, endMs: r.end_ms })),
    consent: await one<{ id: string; status: string; scope: string; responded_name: string | null; responded_at: number | null; requested_at: number }>(
      `SELECT id, status, scope, responded_name, responded_at, requested_at FROM consent WHERE person_id = ? ORDER BY requested_at DESC LIMIT 1`, x.id,
    ) ?? null,
  })));

  const outputs = (await all<{ id: string; clip_id: string | null; preset: string; language: string | null; burn: number; status: string; note: string | null; job_id: string | null; asset_id: string | null; posted_platform: string | null; posted_url: string | null; posted_at: number | null; created_at: number }>(
    `SELECT * FROM output WHERE project_id = ? ORDER BY created_at DESC`, p.id,
  )).map((o) => {
    const a = o.asset_id ? assets.find((x) => x.id === o.asset_id) : undefined;
    return { id: o.id, clipId: o.clip_id, preset: o.preset, language: o.language, burn: !!o.burn, status: o.status, note: o.note, jobId: o.job_id, asset: pub(a) ?? null, posted: o.posted_at ? { platform: o.posted_platform, url: o.posted_url, at: o.posted_at } : null, createdAt: o.created_at };
  });

  const links = await all<{ id: string; purpose: string; target_id: string | null; label: string | null; expires_at: number; opens: number; last_opened_at: number | null; created_at: number }>(
    `SELECT id, purpose, target_id, label, expires_at, opens, last_opened_at, created_at FROM share_link WHERE project_id = ? AND revoked_at IS NULL ORDER BY created_at DESC`, p.id,
  );
  const comments = await all<{ id: string; author: string; at_ms: number | null; body: string; kind: string; link_id: string | null; created_at: number; resolved_at: number | null }>(
    `SELECT id, author, at_ms, body, kind, link_id, created_at, resolved_at FROM comment WHERE project_id = ? ORDER BY COALESCE(at_ms, 0), created_at`, p.id,
  );
  const listings = await Promise.all((await all<{ id: string; clip_id: string; slug: string; title: string; terms: string; enabled: number; created_at: number }>(`SELECT * FROM listing WHERE project_id = ? ORDER BY created_at DESC`, p.id)).map(async (l) => ({
    id: l.id, clipId: l.clip_id, slug: l.slug, url: `${PUBLIC_URL}/l/${l.slug}`, title: l.title, terms: l.terms, enabled: !!l.enabled,
    enquiries: await all(`SELECT id, name, contact, organisation, intended_use, status, created_at FROM enquiry WHERE listing_id = ? ORDER BY created_at DESC`, l.id),
  })));
  const declaration = await one<{ statement: string; created_at: number }>(`SELECT statement, created_at FROM declaration WHERE project_id = ? ORDER BY created_at DESC LIMIT 1`, p.id) ?? null;
  const plans = (await all<{ id: string; prompt: string; planner: string; steps: string; status: string; created_at: number }>(`SELECT * FROM plan_run WHERE project_id = ? ORDER BY created_at DESC LIMIT 5`, p.id)).map((x) => ({ ...x, steps: parse(x.steps, []) }));

  const result = {
    project: { id: p.id, title: p.title, kind: p.kind, spokenLanguage: p.spoken_language, createdAt: p.created_at, updatedAt: p.updated_at },
    source: pub(source) ?? null, proxy: pub(pick("proxy")) ?? null, poster: pub(pick("poster")) ?? null, peaks, storage,
    packages: assets.filter((a) => a.kind === "package").reverse().map(pub),
    tracks, lines, clips, people, outputs, links, comments, listings, declaration, plans,
    jobs: await projectJobs(p.id),
    // What this person may do here, so the screen does not offer a button the server will refuse.
    canManageConsent: managesConsent(ctx),
  };
  if (options.lite) delete (result as { peaks?: number[] }).peaks;
  return result;
}

export type ProjectState = Awaited<ReturnType<typeof projectState>>;

export async function projectList(ctx: Ctx) {
  const rows = (await all<{ id: string; title: string; kind: string; updated_at: number }>(`SELECT id, title, kind, updated_at FROM project WHERE workspace_id = ? ORDER BY updated_at DESC`, ctx.workspaceId));
  return Promise.all(rows.map(async (p) => {
    const counts = (await one<{ clips: number; kept: number; outputs: number; ready: number; tracks: number; people: number; waiting: number; running: number; failed: number }>(
      `SELECT (SELECT COUNT(*) FROM clip WHERE project_id = $id AND status != 'dropped') clips,
              (SELECT COUNT(*) FROM clip WHERE project_id = $id AND status = 'kept') kept,
              (SELECT COUNT(*) FROM output WHERE project_id = $id) outputs,
              (SELECT COUNT(*) FROM output WHERE project_id = $id AND status = 'ready') ready,
              (SELECT COUNT(*) FROM caption_track WHERE project_id = $id) tracks,
              (SELECT COUNT(*) FROM person WHERE project_id = $id) people,
              (SELECT COUNT(*) FROM output WHERE project_id = $id AND status = 'blocked') waiting,
              (SELECT COUNT(*) FROM job WHERE project_id = $id AND status IN ('queued','running')) running,
              (SELECT COUNT(*) FROM job WHERE project_id = $id AND status = 'failed') failed`,
      { id: p.id },
    ))!;
    const poster = await one<{ id: string }>(`SELECT id FROM asset WHERE project_id = ? AND kind = 'poster' ORDER BY created_at DESC LIMIT 1`, p.id);
    const src = await one<{ duration_ms: number | null; filename: string }>(`SELECT duration_ms, filename FROM asset WHERE project_id = ? AND kind = 'source' ORDER BY created_at DESC LIMIT 1`, p.id);
    const peaksAsset = await one<{ storage_key: string }>(`SELECT storage_key FROM asset WHERE project_id = ? AND kind = 'peaks' ORDER BY created_at DESC LIMIT 1`, p.id);
    let peaks: number[] = [];
    if (peaksAsset) {
      const full = parse<number[]>(await readText(peaksAsset.storage_key), []);
      const step = Math.max(1, Math.floor(full.length / 120));
      peaks = full.filter((_, i) => i % step === 0).slice(0, 120);
    }
    return { id: p.id, title: p.title, kind: p.kind, updatedAt: p.updated_at, posterId: poster?.id ?? null, durationMs: src?.duration_ms ?? null, filename: src?.filename ?? null, peaks, counts };
  }));
}
