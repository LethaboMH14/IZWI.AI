// What people without an account can do, through a link: review captions, give or withdraw consent,
// ask to license a clip. Links are random tokens stored only as hashes; they expire and can be revoked.
import { z } from "zod";
import { all, newId, now, one, parse, run, tx } from "./db";
import { hashToken } from "./crypto";
import { fail } from "./http";
import { audit } from "./audit";
import { appendConsent } from "./ledger";
import { limit, LIMIT } from "./ratelimit";
import { refreshTrack } from "./actions";
import { releaseHeldRenders } from "./jobs";
import { langName } from "../lib/languages";

type Link = { id: string; workspace_id: string; project_id: string; purpose: string; target_id: string | null; label: string | null; expires_at: number; revoked_at: number | null };

export async function linkFor(token: string, purpose: "review" | "consent"): Promise<Link> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) fail(404, "This link is not valid.");
  const l = await one<Link>(`SELECT * FROM share_link WHERE token_hash = ? AND purpose = ?`, hashToken(token), purpose);
  if (!l) fail(404, "This link is not valid.");
  if (l.revoked_at) {
    if (purpose === "consent" && l.target_id && await one(`SELECT 1 FROM consent old JOIN consent newer ON newer.workspace_id = old.workspace_id AND newer.project_id = old.project_id AND newer.person_id = old.person_id AND newer.requested_at > old.requested_at WHERE old.id = ? LIMIT 1`, l.target_id)) fail(404, "This link is not valid.");
    fail(410, "This link was switched off by the creator.");
  }
  if (l.expires_at < now()) fail(410, "This link has expired. Ask the creator for a new one.");
  return l;
}


async function mediaFor(projectId: string) {
  const proxy = await one<{ id: string; mime: string; duration_ms: number | null }>(`SELECT id, mime, duration_ms FROM asset WHERE project_id = ? AND kind = 'proxy' ORDER BY created_at DESC LIMIT 1`, projectId);
  const poster = await one<{ id: string }>(`SELECT id FROM asset WHERE project_id = ? AND kind = 'poster' ORDER BY created_at DESC LIMIT 1`, projectId);
  return { proxy: proxy ?? null, posterId: poster?.id ?? null };
}

export async function reviewData(token: string) {
  const l = await linkFor(token, "review");
  await run(`UPDATE share_link SET opens = opens + 1, last_opened_at = ? WHERE id = ?`, now(), l.id);
  const p = (await one<{ title: string; kind: string }>(`SELECT title, kind FROM project WHERE id = ?`, l.project_id))!;
  const creator = await one<{ name: string }>(`SELECT u.name FROM share_link s JOIN "user" u ON u.id = s.created_by WHERE s.id = ?`, l.id);
  const track = l.target_id ? await one<{ id: string; language: string; kind: string; status: string }>(`SELECT id, language, kind, status FROM caption_track WHERE id = ?`, l.target_id) : undefined;
  const lines = track
    ? await all<{ id: string; idx: number; start_ms: number; end_ms: number; text: string; status: string; flag: string | null; approved_by: string | null }>(`SELECT id, idx, start_ms, end_ms, text, status, flag, approved_by FROM caption_line WHERE track_id = ? ORDER BY idx`, track.id)
    : [];
  const source = track?.kind === "translation"
    ? await all<{ idx: number; text: string }>(`SELECT l.idx, l.text FROM caption_line l JOIN caption_track t ON t.id = l.track_id WHERE t.project_id = ? AND t.kind = 'source' ORDER BY l.idx`, l.project_id)
    : [];
  const comments = await all(`SELECT id, author, at_ms, body, kind, created_at FROM comment WHERE link_id = ? ORDER BY created_at`, l.id);
  return {
    label: l.label, project: p, creator: creator?.name ?? "The creator", expiresAt: l.expires_at, ...(await mediaFor(l.project_id)),
    track: track ? { id: track.id, language: track.language, name: langName(track.language), kind: track.kind, status: track.status } : null,
    lines: lines.map((x) => ({ id: x.id, idx: x.idx, startMs: x.start_ms, endMs: x.end_ms, text: x.text, status: x.status, flag: x.flag, approvedBy: x.approved_by, source: source.find((s) => s.idx === x.idx)?.text ?? null })),
    comments,
  };
}

export const ReviewIn = z.discriminatedUnion("action", [
  z.object({ action: z.literal("comment"), author: z.string().trim().min(1).max(60), atMs: z.number().int().min(0).nullable(), body: z.string().trim().min(1).max(2000), lineId: z.string().optional() }),
  z.object({ action: z.literal("approveLine"), author: z.string().trim().min(1).max(60), lineId: z.string(), approve: z.boolean() }),
  z.object({ action: z.literal("decision"), author: z.string().trim().min(1).max(60), decision: z.enum(["approve", "changes"]), note: z.string().trim().max(2000).default("") }),
]);

export async function reviewAction(token: string, input: z.infer<typeof ReviewIn>, ip: string) {
  await limit(`review:${ip}`, LIMIT.publicWrite);
  const l = await linkFor(token, "review");
  const by = `${input.author} (review link)`;
  if (input.action === "comment") {
    const line = input.lineId && l.target_id ? await one<{ idx: number }>(`SELECT idx FROM caption_line WHERE id = ? AND track_id = ?`, input.lineId, l.target_id) : undefined;
    await run(`INSERT INTO comment (id, workspace_id, project_id, link_id, author, at_ms, body, kind, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'note', ?)`, newId("cmt"), l.workspace_id, l.project_id, l.id, by, input.atMs, line ? `Line ${line.idx + 1}: ${input.body}` : input.body, now());
    return { ok: true };
  }
  if (input.action === "approveLine") {
    if (!l.target_id) fail(400, "This link is for comments only.");
    const n = (await run(`UPDATE caption_line SET status = ?, approved_by = ?, approved_at = ? WHERE id = ? AND track_id = ?`, input.approve ? "approved" : "draft", input.approve ? by : null, input.approve ? now() : null, input.lineId, l.target_id)).changes;
    if (!n) fail(404, "Line not found.");
    await refreshTrack(l.target_id);
    await audit({ workspaceId: l.workspace_id, actor: "guest", action: input.approve ? "review.line_approved" : "review.line_reopened", target: input.lineId, meta: { author: input.author, link: l.id } });
    return { ok: true };
  }
  await run(`INSERT INTO comment (id, workspace_id, project_id, link_id, author, at_ms, body, kind, created_at) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?)`, newId("cmt"), l.workspace_id, l.project_id, l.id, by, input.note || (input.decision === "approve" ? "Approved." : "Changes requested."), input.decision === "approve" ? "approve" : "changes", now());
  if (input.decision === "changes" && l.target_id) await run(`UPDATE caption_track SET status = 'revision_requested', updated_at = ? WHERE id = ?`, now(), l.target_id);
  await audit({ workspaceId: l.workspace_id, actor: "guest", action: `review.${input.decision}`, target: l.id, meta: { author: input.author } });
  return { ok: true };
}

export async function consentData(token: string) {
  const l = await linkFor(token, "consent");
  await run(`UPDATE share_link SET opens = opens + 1, last_opened_at = ? WHERE id = ?`, now(), l.id);
  const c = await one<{ id: string; person_id: string; scope: string; status: string; statement: string; responded_name: string | null; responded_at: number | null }>(`SELECT * FROM consent WHERE id = ?`, l.target_id) ?? fail(404, "This request was removed.");
  const person = await one<{ name: string; role: string; whole_recording: number }>(`SELECT name, role, whole_recording FROM person WHERE id = ?`, c.person_id) ?? fail(404, "This request was removed.");
  const ranges = await all<{ start_ms: number; end_ms: number }>(`SELECT start_ms, end_ms FROM appearance WHERE person_id = ? ORDER BY start_ms`, c.person_id);
  const p = (await one<{ title: string }>(`SELECT title FROM project WHERE id = ?`, l.project_id))!;
  const creator = await one<{ name: string }>(`SELECT u.name FROM consent c JOIN "user" u ON u.id = c.requested_by WHERE c.id = ?`, c.id);
  return {
    project: p.title, creator: creator?.name ?? "The creator", person: person.name, role: person.role, scope: c.scope, statement: c.statement,
    status: c.status, respondedName: c.responded_name, respondedAt: c.responded_at, wholeRecording: !!person.whole_recording,
    ranges: ranges.map((r) => ({ startMs: r.start_ms, endMs: r.end_ms })), ...(await mediaFor(l.project_id)),
  };
}

export const ConsentIn = z.object({ decision: z.enum(["grant", "decline", "revoke"]), name: z.string().trim().min(1).max(80) });

export async function consentAction(token: string, input: z.infer<typeof ConsentIn>, ip: string, userAgent: string) {
  await limit(`consent:${ip}`, LIMIT.publicWrite);
  const l = await linkFor(token, "consent");
  await limit(`consent-link:${l.id}`, LIMIT.consentPerLink);
  const c = await one<{ id: string; person_id: string; status: string; scope: string }>(`SELECT id, person_id, status, scope FROM consent WHERE id = ? AND workspace_id = ?`, l.target_id, l.workspace_id) ?? fail(404, "This request was removed.");
  const person = (await one<{ name: string }>(`SELECT name FROM person WHERE id = ?`, c.person_id))!;
  const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\s]/gu, "").replace(/\s+/g, " ").trim();
  if (norm(input.name) !== norm(person.name)) fail(400, `Type your name exactly as the creator wrote it: ${person.name}`);
  if (input.decision === "revoke" && c.status !== "granted") fail(409, "There is no yes to withdraw.");
  const status = input.decision === "grant" ? "granted" : input.decision === "decline" ? "declined" : "revoked";
  const at = now();
  // The answer, its ledger entry and what it does to renders land together, so no render can see half of it.
  const entry = await tx(async () => {
    await run(`UPDATE consent SET status = ?, responded_name = ?, responded_at = ?, user_agent = ?, updated_at = ? WHERE id = ?`, status, input.name, at, userAgent.slice(0, 200), at, c.id);
    const appended = await appendConsent({ consentId: c.id, workspaceId: l.workspace_id, projectId: l.project_id, personId: c.person_id, scope: c.scope, decision: status, respondedName: input.name, at });
    if (status === "revoked") {
      // Unposted renders that this person appears in are held again. Anything already posted stays where it is.
      await run(
        `UPDATE output SET status = 'blocked', note = ?, updated_at = ? WHERE project_id = ? AND status IN ('ready','queued') AND posted_at IS NULL
           AND NOT EXISTS (SELECT 1 FROM clip k JOIN person who ON who.id = ? WHERE k.id = output.clip_id AND who.whole_recording = 0
             AND NOT EXISTS (SELECT 1 FROM appearance a WHERE a.person_id = who.id AND a.start_ms < k.end_ms AND a.end_ms > k.start_ms))`,
        `${person.name} withdrew consent. Remove their part or ask again.`, at, l.project_id, c.person_id,
      );
    }
    // Releases what this answer clears, and brings the reason on anything still held up to date.
    await releaseHeldRenders(l.project_id);
    return appended;
  });
  await audit({ workspaceId: l.workspace_id, actor: "guest", action: `consent.${status}`, target: c.id, meta: { name: input.name, ledgerSeq: entry.seq } });
  return { status };
}

export async function listingData(slug: string) {
  if (!/^[a-z0-9_-]{3,80}$/.test(slug)) fail(404, "Not found.");
  const l = await one<{ id: string; workspace_id: string; clip_id: string; title: string; terms: string; enabled: number }>(`SELECT * FROM listing WHERE slug = ?`, slug);
  if (!l || !l.enabled) fail(404, "This clip is not listed.");
  const render = await one<{ id: string; duration_ms: number | null; width: number | null; height: number | null }>(
    `SELECT a.id, a.duration_ms, a.width, a.height FROM output o JOIN asset a ON a.id = o.asset_id WHERE o.clip_id = ? AND o.status = 'ready' ORDER BY o.created_at DESC LIMIT 1`, l.clip_id,
  );
  const clip = await one<{ start_ms: number; end_ms: number }>(`SELECT start_ms, end_ms FROM clip WHERE id = ?`, l.clip_id);
  const ws = await one<{ name: string }>(`SELECT name FROM organization WHERE id = ?`, l.workspace_id);
  const langs = (await all<{ language: string }>(`SELECT DISTINCT o.language FROM output o WHERE o.clip_id = ? AND o.status = 'ready' AND o.language IS NOT NULL`, l.clip_id)).map((x) => langName(x.language));
  return { title: l.title, terms: l.terms, by: ws?.name ?? "A creator", render: render ?? null, posterId: null, durationMs: render?.duration_ms ?? (clip ? clip.end_ms - clip.start_ms : null), languages: langs };
}

export const EnquiryIn = z.object({
  name: z.string().trim().min(1).max(80), contact: z.string().trim().min(5).max(120), organisation: z.string().trim().max(120).default(""),
  use: z.string().trim().min(10).max(1500), website: z.string().max(0).default(""),
});

export async function enquire(slug: string, input: z.infer<typeof EnquiryIn>, ip: string) {
  await limit(`enquiry:${ip}:${slug}`, LIMIT.enquiry);
  const l = await one<{ id: string; workspace_id: string; enabled: number }>(`SELECT id, workspace_id, enabled FROM listing WHERE slug = ?`, slug);
  if (!l || !l.enabled) fail(404, "This clip is not listed.");
  await run(`INSERT INTO enquiry (id, workspace_id, listing_id, name, contact, organisation, intended_use, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, newId("enq"), l.workspace_id, l.id, input.name, input.contact, input.organisation || null, input.use, now());
  await audit({ workspaceId: l.workspace_id, actor: "guest", action: "enquiry.received", target: l.id });
  return { ok: true };
}

// Which assets a token may open: the light preview and cover for review and consent links; the finished render for a listing.
export async function assetAllowedForToken(assetId: string, token: string | null, slug: string | null) {
  const a = await one<{ id: string; project_id: string; kind: string; meta: string }>(`SELECT id, project_id, kind, meta FROM asset WHERE id = ?`, assetId);
  if (!a) return null;
  if (token) {
    const h = hashToken(token);
    // Review and consent links both show the light preview and cover of their own project, nothing else.
    const l = await one<{ project_id: string; purpose: string; expires_at: number; revoked_at: number | null }>(`SELECT project_id, purpose, expires_at, revoked_at FROM share_link WHERE token_hash = ?`, h);
    if (l && (l.purpose === "review" || l.purpose === "consent") && !l.revoked_at && l.expires_at > now() && l.project_id === a.project_id && ["proxy", "poster"].includes(a.kind)) return a;
  }
  if (slug) {
    const l = await one<{ clip_id: string; enabled: number }>(`SELECT clip_id, enabled FROM listing WHERE slug = ?`, slug);
    const outputId = parse<{ outputId?: string }>(a.meta, {}).outputId;
    if (l?.enabled && a.kind === "render" && outputId && await one(`SELECT 1 FROM output WHERE id = ? AND clip_id = ? AND asset_id = ? AND status = 'ready'`, outputId, l.clip_id, a.id)) return a;
  }
  return null;
}
