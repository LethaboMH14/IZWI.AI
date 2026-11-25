// Creator actions. Each one checks the caller's workspace, validates input, writes rows, and leaves an audit entry.
import { z } from "zod";
import { all, newId, now, one, parse, run, tx } from "./db";
import { projectOf, requireRole, type Ctx } from "./guard";
import { HttpError, fail } from "./http";
import { enqueue, publicJob, requeueBlocked } from "./jobs";
import { audit } from "./audit";
import { hashToken, newToken } from "./crypto";
import { LIMITS, PUBLIC_URL } from "./env";
import { DECLARATION, consentStatement, gateFor, gateReason } from "./rights";
import { removeProjectFiles } from "./storage";
import { isPreset } from "./render";
import { providerFor } from "./providers";
import { LANGUAGES, langName } from "../lib/languages";
import { applyGlossary, lineText, type GlossaryEntry, type Word } from "./captions";
import { purgeOldAssistantMessages } from "./assistant-store";
import { createHash } from "node:crypto";

export const KINDS = ["podcast", "video", "lesson", "music", "film", "animation", "client"] as const;

export const ProjectIn = z.object({ title: z.string().trim().min(1).max(120), kind: z.enum(KINDS), spokenLanguage: z.string().max(5).default("auto") });

export function createProject(ctx: Ctx, input: z.infer<typeof ProjectIn>) {
  const id = newId("prj");
  run(`INSERT INTO project (id, workspace_id, title, kind, spoken_language, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, id, ctx.workspaceId, input.title, input.kind, input.spokenLanguage, ctx.userId, now(), now());
  audit({ workspaceId: ctx.workspaceId, userId: ctx.userId, actor: "user", action: "project.created", target: id });
  return { id };
}

export function updateProject(ctx: Ctx, id: string, patch: Partial<z.infer<typeof ProjectIn>>) {
  const p = projectOf(ctx, id);
  run(`UPDATE project SET title = ?, kind = ?, spoken_language = ?, updated_at = ? WHERE id = ?`, patch.title ?? p.title, patch.kind ?? p.kind, patch.spokenLanguage ?? p.spoken_language, now(), p.id);
  audit({ workspaceId: ctx.workspaceId, userId: ctx.userId, actor: "user", action: "project.updated", target: p.id, meta: { fields: Object.keys(patch) } });
}

export function deleteProject(ctx: Ctx, id: string) {
  requireRole(ctx, ["owner", "admin"]);
  const p = projectOf(ctx, id);
  purgeOldAssistantMessages();
  run(`DELETE FROM project WHERE id = ?`, p.id);
  removeProjectFiles(ctx.workspaceId, p.id);
  audit({ workspaceId: ctx.workspaceId, userId: ctx.userId, actor: "user", action: "project.deleted", target: p.id, meta: { title: p.title } });
}

const touch = (projectId: string) => run(`UPDATE project SET updated_at = ? WHERE id = ?`, now(), projectId);

export const StepIn = z.discriminatedUnion("type", [
  z.object({ type: z.literal("transcribe") }),
  z.object({ type: z.literal("suggest_clips"), count: z.number().int().min(1).max(10).default(3) }),
  z.object({ type: z.literal("translate"), language: z.string().max(5) }),
  z.object({ type: z.literal("package") }),
]);

// Returns only the public job shape: no worker id, lease or idempotency key goes back to the browser.
export function runStep(ctx: Ctx, projectId: string, step: z.infer<typeof StepIn>, idem: string | null) {
  return publicJob(queueStep(ctx, projectId, step, idem));
}

function queueStep(ctx: Ctx, projectId: string, step: z.infer<typeof StepIn>, idem: string | null) {
  const p = projectOf(ctx, projectId);
  const key = idem ? `api:${idem.slice(0, 80)}` : `api:${step.type}:${p.id}:${now()}`;
  const base = { workspaceId: ctx.workspaceId, projectId: p.id, createdBy: ctx.userId, idempotencyKey: key };
  if (step.type === "transcribe") {
    const src = one<{ id: string }>(`SELECT id FROM asset WHERE project_id = ? AND kind = 'source' ORDER BY created_at DESC LIMIT 1`, p.id) ?? fail(409, "Upload a recording first.");
    if (!one(`SELECT 1 FROM asset WHERE project_id = ? AND kind = 'audio'`, p.id)) fail(409, "The preview is still being made. Try again in a moment.");
    return enqueue({ ...base, type: "transcribe", input: { assetId: src.id } });
  }
  if (!one(`SELECT 1 FROM caption_track WHERE project_id = ? AND kind = 'source'`, p.id) && step.type !== "package") fail(409, "There is no transcript yet.");
  if (step.type === "suggest_clips") return enqueue({ ...base, type: "suggest_clips", input: { count: step.count } });
  if (step.type === "translate") {
    if (!LANGUAGES.some((l) => l.code === step.language)) fail(400, "Choose a language from the list.");
    if (!providerFor(ctx.workspaceId, "translate")) fail(409, "Connect a translation provider in Run on first.");
    return enqueue({ ...base, type: "translate", input: { language: step.language } });
  }
  return enqueue({ ...base, type: "package", input: {} });
}

export const ClipIn = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  startMs: z.number().int().min(0).optional(),
  endMs: z.number().int().min(1).optional(),
  status: z.enum(["suggested", "kept", "dropped"]).optional(),
});

export function createClip(ctx: Ctx, projectId: string, c: { title: string; startMs: number; endMs: number }) {
  const p = projectOf(ctx, projectId);
  if (c.endMs - c.startMs < 1000) fail(400, "A clip must be at least one second long.");
  const id = newId("clp");
  run(`INSERT INTO clip (id, workspace_id, project_id, title, start_ms, end_ms, reason, origin, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'Chosen by you.', 'manual', 'kept', ?, ?)`, id, ctx.workspaceId, p.id, c.title, c.startMs, c.endMs, now(), now());
  touch(p.id);
  return { id };
}

export function updateClip(ctx: Ctx, id: string, patch: z.infer<typeof ClipIn>, expectedProjectId?: string) {
  const c = one<{ id: string; project_id: string; title: string; start_ms: number; end_ms: number; status: string }>(`SELECT * FROM clip WHERE id = ? AND workspace_id = ? AND (? IS NULL OR project_id = ?)`, id, ctx.workspaceId, expectedProjectId ?? null, expectedProjectId ?? null) ?? fail(404, "Not found.");
  const start = patch.startMs ?? c.start_ms, end = patch.endMs ?? c.end_ms;
  if (end - start < 1000) fail(400, "A clip must be at least one second long.");
  const src = one<{ duration_ms: number | null }>(`SELECT duration_ms FROM asset WHERE project_id = ? AND kind = 'source' ORDER BY created_at DESC LIMIT 1`, c.project_id);
  if (src?.duration_ms && end > src.duration_ms + 50) fail(400, "The clip ends after the recording does.");
  const moved = start !== c.start_ms || end !== c.end_ms;
  run(`UPDATE clip SET title = ?, start_ms = ?, end_ms = ?, status = ?, version = version + ?, updated_at = ? WHERE id = ?`, patch.title ?? c.title, start, end, patch.status ?? c.status, moved ? 1 : 0, now(), c.id);
  if (moved) run(`UPDATE output SET status = 'failed', note = 'The clip changed after this render. Render it again.' WHERE clip_id = ? AND status = 'ready' AND posted_at IS NULL`, c.id);
  touch(c.project_id);
}

type LineCtx = { id: string; track_id: string; idx: number; start_ms: number; end_ms: number; text: string; status: string; project_id: string; kind: string; language: string };
const lineOf = (ctx: Ctx, id: string) =>
  one<LineCtx>(`SELECT l.*, t.project_id, t.kind, t.language FROM caption_line l JOIN caption_track t ON t.id = l.track_id WHERE l.id = ? AND t.workspace_id = ?`, id, ctx.workspaceId) ?? fail(404, "Not found.");

// Track status follows its lines: approved only when every line has a person's yes.
export function refreshTrack(trackId: string) {
  const t = one<{ project_id: string; language: string; status: string; total: number; ok: number }>(
    `SELECT project_id, language, status, (SELECT COUNT(*) FROM caption_line WHERE track_id = t.id) total, (SELECT COUNT(*) FROM caption_line WHERE track_id = t.id AND status = 'approved') ok FROM caption_track t WHERE id = ?`, trackId,
  );
  if (!t) return;
  const next = t.total > 0 && t.ok === t.total ? "approved" : t.status === "approved" ? "in_review" : t.status;
  run(`UPDATE caption_track SET status = ?, updated_at = ? WHERE id = ?`, next, now(), trackId);
  if (next === "approved") {
    run(`UPDATE output SET status = 'queued', note = NULL WHERE project_id = ? AND language = ? AND status = 'blocked'`, t.project_id, t.language);
    requeueBlocked(t.project_id, "render");
  }
}

export const LineIn = z.object({ text: z.string().trim().min(1).max(400).optional(), approve: z.boolean().optional() });

export function updateLine(ctx: Ctx, id: string, patch: z.infer<typeof LineIn>, by: string) {
  const l = lineOf(ctx, id);
  if (patch.text !== undefined && patch.text !== l.text.replace(/\n/g, " ")) {
    const words = patch.text.split(/\s+/);
    const step = (l.end_ms - l.start_ms) / words.length;
    run(
      `UPDATE caption_line SET text = ?, words = ?, edited = 1, status = 'draft', approved_by = NULL, approved_at = NULL, flag = NULL WHERE id = ?`,
      lineText(words.map((w) => ({ w }))), JSON.stringify(words.map((w, i) => ({ w, s: Math.round(l.start_ms + i * step), e: Math.round(l.start_ms + (i + 1) * step) }))), l.id,
    );
  }
  if (patch.approve !== undefined) {
    run(`UPDATE caption_line SET status = ?, approved_by = ?, approved_at = ? WHERE id = ?`, patch.approve ? "approved" : "draft", patch.approve ? by : null, patch.approve ? now() : null, l.id);
    audit({ workspaceId: ctx.workspaceId, userId: ctx.userId, actor: "user", action: patch.approve ? "caption.line_approved" : "caption.line_reopened", target: l.id });
  }
  refreshTrack(l.track_id);
  touch(l.project_id);
}

export function approveAll(ctx: Ctx, trackId: string, by: string) {
  const t = one<{ id: string; project_id: string }>(`SELECT id, project_id FROM caption_track WHERE id = ? AND workspace_id = ?`, trackId, ctx.workspaceId) ?? fail(404, "Not found.");
  const approved = run(`UPDATE caption_line SET status = 'approved', approved_by = ?, approved_at = ? WHERE track_id = ? AND status = 'draft' AND flag IS NULL`, by, now(), t.id).changes;
  audit({ workspaceId: ctx.workspaceId, userId: ctx.userId, actor: "user", action: "caption.approved_all", target: t.id, meta: { lines: approved } });
  refreshTrack(t.id);
  const left = one<{ n: number }>(`SELECT COUNT(*) n FROM caption_line WHERE track_id = ? AND status = 'draft'`, t.id)!.n;
  return { left };
}

export const GlossaryIn = z.object({ term: z.string().trim().min(1).max(60), heard: z.string().trim().max(60).optional() });

export function previewGlossaryChanges(workspaceId: string, entry: z.infer<typeof GlossaryIn>) {
  if (!entry.heard) return [] as { id: string; projectId: string; textHash: string; text: string; words: string }[];
  const rows = all<{ id: string; text: string; words: string | null; start_ms: number; end_ms: number; project_id: string }>(
    `SELECT l.id, l.text, l.words, l.start_ms, l.end_ms, t.project_id FROM caption_line l JOIN caption_track t ON t.id = l.track_id WHERE t.workspace_id = ? AND t.kind = 'source' AND l.status = 'draft' AND l.text LIKE ? ESCAPE '!'`,
    workspaceId, `%${entry.heard.replace(/[!%_]/g, (c) => `!${c}`)}%`,
  );
  return rows.flatMap((row) => {
    const seg = { startMs: row.start_ms, endMs: row.end_ms, text: row.text.replace(/\n/g, " "), words: parse<Word[]>(row.words, []) };
    const { segs, fixes } = applyGlossary([seg], [{ term: entry.term, heard: [entry.heard!] }]);
    return fixes ? [{ id: row.id, projectId: row.project_id, textHash: createHash("sha256").update(row.text).digest("hex"), text: lineText(segs[0].words), words: JSON.stringify(segs[0].words) }] : [];
  });
}

export function learnGlossary(ctx: Ctx, entry: z.infer<typeof GlossaryIn>) {
  const row = one<{ glossary: string }>(`SELECT glossary FROM workspace_pref WHERE workspace_id = ?`, ctx.workspaceId);
  const g = parse<GlossaryEntry[]>(row?.glossary, []);
  const found = g.find((x) => x.term.toLowerCase() === entry.term.toLowerCase());
  if (found) {
    if (entry.heard && !found.heard?.some((h) => h.toLowerCase() === entry.heard!.toLowerCase())) found.heard = [...(found.heard ?? []), entry.heard];
  } else g.push({ term: entry.term, heard: entry.heard ? [entry.heard] : [] });
  if (g.length > 300) fail(400, "The glossary is full.");
  run(`UPDATE workspace_pref SET glossary = ?, updated_at = ? WHERE workspace_id = ?`, JSON.stringify(g), now(), ctx.workspaceId);
  // Fix the same mishearing everywhere it already appears in this workspace's draft source lines.
  const changes = previewGlossaryChanges(ctx.workspaceId, entry);
  tx(() => changes.forEach((change) => run(`UPDATE caption_line SET text = ?, words = ?, edited = 1 WHERE id = ?`, change.text, change.words, change.id)));
  return { glossary: g, fixed: changes.length };
}

export const PersonIn = z.object({ name: z.string().trim().min(1).max(80), role: z.string().trim().min(1).max(60), wholeRecording: z.boolean().default(true), ranges: z.array(z.object({ startMs: z.number().int().min(0), endMs: z.number().int().min(1) })).max(50).default([]) });

export function addPerson(ctx: Ctx, projectId: string, input: z.infer<typeof PersonIn>) {
  const p = projectOf(ctx, projectId);
  const id = newId("per");
  tx(() => {
    run(`INSERT INTO person (id, workspace_id, project_id, name, role, whole_recording, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`, id, ctx.workspaceId, p.id, input.name, input.role, input.wholeRecording ? 1 : 0, now());
    for (const r of input.ranges) if (r.endMs > r.startMs) run(`INSERT INTO appearance (id, person_id, start_ms, end_ms) VALUES (?, ?, ?, ?)`, newId("apr"), id, r.startMs, r.endMs);
  });
  touch(p.id);
  return { id };
}

export function removePerson(ctx: Ctx, personId: string) {
  const x = one<{ id: string; project_id: string }>(`SELECT id, project_id FROM person WHERE id = ? AND workspace_id = ?`, personId, ctx.workspaceId) ?? fail(404, "Not found.");
  run(`DELETE FROM person WHERE id = ?`, x.id);
  requeueBlocked(x.project_id, "render");
  run(`UPDATE output SET status = 'queued', note = NULL WHERE project_id = ? AND status = 'blocked'`, x.project_id);
  audit({ workspaceId: ctx.workspaceId, userId: ctx.userId, actor: "user", action: "person.removed", target: x.id });
}

function makeLink(ctx: Ctx, projectId: string, purpose: "review" | "consent", targetId: string | null, label: string, days: number) {
  const token = newToken();
  const id = newId("lnk");
  run(
    `INSERT INTO share_link (id, workspace_id, project_id, purpose, target_id, label, token_hash, expires_at, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, ctx.workspaceId, projectId, purpose, targetId, label.slice(0, 80), hashToken(token), now() + days * 86400_000, ctx.userId, now(),
  );
  return { id, url: `${PUBLIC_URL}/${purpose === "review" ? "r" : "c"}/${token}` };
}

export function requestConsent(ctx: Ctx, projectId: string, personId: string, scope: "appearance" | "voice" | "likeness", options: { audit?: boolean } = {}) {
  const p = projectOf(ctx, projectId);
  const person = one<{ id: string; name: string }>(`SELECT id, name FROM person WHERE id = ? AND project_id = ?`, personId, p.id) ?? fail(404, "Not found.");
  const consentId = newId("cns");
  const link = tx(() => {
    const pending = all<{ id: string }>(`SELECT id FROM consent WHERE workspace_id = ? AND project_id = ? AND person_id = ? AND status = 'requested'`, ctx.workspaceId, p.id, person.id);
    for (const prior of pending) run(`UPDATE share_link SET revoked_at = ? WHERE workspace_id = ? AND purpose = 'consent' AND target_id = ? AND revoked_at IS NULL`, now(), ctx.workspaceId, prior.id);
    run(
      `INSERT INTO consent (id, workspace_id, project_id, person_id, scope, status, statement, requested_by, requested_at, updated_at) VALUES (?, ?, ?, ?, ?, 'requested', ?, ?, ?, ?)`,
      consentId, ctx.workspaceId, p.id, person.id, scope, consentStatement(person.name, p.title, scope), ctx.userId, now(), now(),
    );
    return makeLink(ctx, p.id, "consent", consentId, `Consent: ${person.name}`, LIMITS.linkDays);
  });
  if (options.audit !== false) audit({ workspaceId: ctx.workspaceId, userId: ctx.userId, actor: "user", action: "consent.requested", target: consentId });
  return { url: link.url, message: `Hi ${person.name}, please confirm you're happy for me to use your part of “${p.title}”. It takes a minute: ${link.url}` };
}

export function declare(ctx: Ctx, projectId: string) {
  const p = projectOf(ctx, projectId);
  run(`INSERT INTO declaration (id, workspace_id, project_id, user_id, statement, created_at) VALUES (?, ?, ?, ?, ?, ?)`, newId("dec"), ctx.workspaceId, p.id, ctx.userId, DECLARATION, now());
  run(`UPDATE output SET status = 'queued', note = NULL WHERE project_id = ? AND status = 'blocked'`, p.id);
  requeueBlocked(p.id, "render");
  audit({ workspaceId: ctx.workspaceId, userId: ctx.userId, actor: "user", action: "declaration.recorded", target: p.id });
}

export function createReviewLink(ctx: Ctx, projectId: string, trackId: string | null, label: string, days: number) {
  const p = projectOf(ctx, projectId);
  if (trackId) {
    const t = one<{ id: string; language: string }>(`SELECT id, language FROM caption_track WHERE id = ? AND project_id = ?`, trackId, p.id) ?? fail(404, "Not found.");
    run(`UPDATE caption_track SET status = CASE WHEN status = 'draft' THEN 'in_review' ELSE status END, updated_at = ? WHERE id = ?`, now(), t.id);
  }
  const link = makeLink(ctx, p.id, "review", trackId, label || "Review", Math.min(Math.max(days, 1), LIMITS.linkDays));
  audit({ workspaceId: ctx.workspaceId, userId: ctx.userId, actor: "user", action: "link.created", target: link.id });
  return { ...link, message: `Please check ${trackId ? "these captions" : "this cut"} of “${p.title}” and approve or suggest changes: ${link.url}` };
}

export function revokeLink(ctx: Ctx, linkId: string) {
  const n = run(`UPDATE share_link SET revoked_at = ? WHERE id = ? AND workspace_id = ? AND revoked_at IS NULL`, now(), linkId, ctx.workspaceId).changes;
  if (!n) fail(404, "Not found.");
  audit({ workspaceId: ctx.workspaceId, userId: ctx.userId, actor: "user", action: "link.revoked", target: linkId });
}

export function addComment(ctx: Ctx, projectId: string, atMs: number | null, body: string) {
  const p = projectOf(ctx, projectId);
  run(`INSERT INTO comment (id, workspace_id, project_id, user_id, author, at_ms, body, kind, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'note', ?)`, newId("cmt"), ctx.workspaceId, p.id, ctx.userId, ctx.userName, atMs, body, now());
}

export function resolveComment(ctx: Ctx, id: string, resolved: boolean) {
  const n = run(`UPDATE comment SET resolved_at = ? WHERE id = ? AND workspace_id = ?`, resolved ? now() : null, id, ctx.workspaceId).changes;
  if (!n) fail(404, "Not found.");
}

export const OutputIn = z.object({ clipId: z.string(), preset: z.string(), language: z.string().max(5).nullable(), burn: z.boolean().default(true) });

export function createOutput(ctx: Ctx, projectId: string, o: z.infer<typeof OutputIn>, idem: string | null) {
  const p = projectOf(ctx, projectId);
  if (!isPreset(o.preset)) fail(400, "Unknown format.");
  const clip = one<{ id: string; start_ms: number; end_ms: number; version: number }>(`SELECT id, start_ms, end_ms, version FROM clip WHERE id = ? AND project_id = ?`, o.clipId, p.id) ?? fail(404, "Clip not found.");
  if (o.language && !one(`SELECT 1 FROM caption_track WHERE project_id = ? AND language = ?`, p.id, o.language)) fail(409, `There are no ${langName(o.language)} captions yet.`);
  const outId = newId("out");
  const gate = gateFor(p.id, clip.start_ms, clip.end_ms);
  run(
    `INSERT INTO output (id, workspace_id, project_id, clip_id, preset, language, burn, status, note, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    outId, ctx.workspaceId, p.id, clip.id, o.preset, o.language, o.burn ? 1 : 0, gate.ok ? "queued" : "blocked", gate.ok ? null : gateReason(gate), ctx.userId, now(), now(),
  );
  const job = enqueue({ workspaceId: ctx.workspaceId, projectId: p.id, type: "render", input: { outputId: outId }, idempotencyKey: idem ? `api:${idem.slice(0, 80)}` : `render:${outId}`, createdBy: ctx.userId });
  run(`UPDATE output SET job_id = ? WHERE id = ?`, job.id, outId);
  if (!gate.ok) run(`UPDATE job SET status = 'blocked', error = ? WHERE id = ? AND status = 'queued'`, gateReason(gate), job.id);
  touch(p.id);
  return { id: outId, blocked: !gate.ok, reason: gate.ok ? null : gateReason(gate) };
}

export const PostedIn = z.object({ platform: z.string().trim().min(1).max(40), url: z.string().trim().url().max(500).optional() });

export function markPosted(ctx: Ctx, outputId: string, input: z.infer<typeof PostedIn>) {
  const o = one<{ id: string; status: string }>(`SELECT id, status FROM output WHERE id = ? AND workspace_id = ?`, outputId, ctx.workspaceId) ?? fail(404, "Not found.");
  if (o.status !== "ready") fail(409, "Only a finished render can be marked as posted.");
  run(`UPDATE output SET posted_platform = ?, posted_url = ?, posted_at = ?, updated_at = ? WHERE id = ?`, input.platform, input.url ?? null, now(), now(), o.id);
  audit({ workspaceId: ctx.workspaceId, userId: ctx.userId, actor: "user", action: "output.posted", target: o.id, meta: input });
}

export const ListingIn = z.object({ clipId: z.string(), title: z.string().trim().min(1).max(120), terms: z.string().trim().max(1000).default("") });

export function createListing(ctx: Ctx, projectId: string, input: z.infer<typeof ListingIn>) {
  const p = projectOf(ctx, projectId);
  const clip = one<{ id: string }>(`SELECT id FROM clip WHERE id = ? AND project_id = ?`, input.clipId, p.id) ?? fail(404, "Clip not found.");
  if (!one(`SELECT 1 FROM output WHERE clip_id = ? AND status = 'ready'`, clip.id)) fail(409, "Render this clip first, so buyers see the finished piece.");
  const slug = `${input.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "clip"}-${newToken().replace(/[^a-z0-9]/gi, "").slice(0, 6).toLowerCase()}`;
  const id = newId("lst");
  run(`INSERT INTO listing (id, workspace_id, project_id, clip_id, slug, title, terms, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`, id, ctx.workspaceId, p.id, clip.id, slug, input.title, input.terms, now(), now());
  audit({ workspaceId: ctx.workspaceId, userId: ctx.userId, actor: "user", action: "listing.created", target: id });
  return { id, url: `${PUBLIC_URL}/l/${slug}` };
}

export function setListing(ctx: Ctx, id: string, enabled: boolean) {
  if (!run(`UPDATE listing SET enabled = ?, updated_at = ? WHERE id = ? AND workspace_id = ?`, enabled ? 1 : 0, now(), id, ctx.workspaceId).changes) fail(404, "Not found.");
}

export function setEnquiry(ctx: Ctx, id: string, status: "new" | "replied" | "closed") {
  if (!run(`UPDATE enquiry SET status = ? WHERE id = ? AND workspace_id = ?`, status, id, ctx.workspaceId).changes) fail(404, "Not found.");
}

export { HttpError };
