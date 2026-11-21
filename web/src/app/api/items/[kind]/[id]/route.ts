// Single-item changes: PATCH or DELETE /api/items/<kind>/<id>
import { z } from "zod";
import { body, fail, route } from "@/server/http";
import { requireCtx } from "@/server/guard";
import * as A from "@/server/actions";
import { cancel, retry } from "@/server/jobs";
import { all, one, run } from "@/server/db";

export const runtime = "nodejs";
type P = { kind: string; id: string };

// GET /api/items/track/:id → a caption track with its lines, and the source text beside each translated line.
export const GET = route<P>(async (_req, { kind, id }) => {
  const ctx = await requireCtx();
  if (kind !== "track") return fail(404, "Unknown item.");
  const t = one<{ id: string; project_id: string; language: string; kind: string; status: string; engine: string }>(
    `SELECT id, project_id, language, kind, status, engine FROM caption_track WHERE id = ? AND workspace_id = ?`, id, ctx.workspaceId,
  ) ?? fail(404, "Not found.");
  const lines = all<{ id: string; idx: number; start_ms: number; end_ms: number; text: string; status: string; flag: string | null; approved_by: string | null; edited: number }>(
    `SELECT id, idx, start_ms, end_ms, text, status, flag, approved_by, edited FROM caption_line WHERE track_id = ? ORDER BY idx`, t.id,
  );
  const source = t.kind === "translation"
    ? all<{ idx: number; text: string }>(`SELECT l.idx, l.text FROM caption_line l JOIN caption_track s ON s.id = l.track_id WHERE s.project_id = ? AND s.kind = 'source' ORDER BY l.idx`, t.project_id)
    : [];
  return {
    track: { id: t.id, language: t.language, kind: t.kind, status: t.status, engine: t.engine },
    lines: lines.map((l) => ({ id: l.id, idx: l.idx, startMs: l.start_ms, endMs: l.end_ms, text: l.text, status: l.status, flag: l.flag, approvedBy: l.approved_by, edited: !!l.edited, source: source.find((s) => s.idx === l.idx)?.text ?? null })),
  };
});

export const PATCH = route<P>(async (req, { kind, id }) => {
  const ctx = await requireCtx();
  switch (kind) {
    case "clip":
      return A.updateClip(ctx, id, await body(req, A.ClipIn));
    case "line":
      return A.updateLine(ctx, id, await body(req, A.LineIn), ctx.userName);
    case "track": {
      const x = await body(req, z.object({ approveAll: z.literal(true) }));
      if (x.approveAll) return A.approveAll(ctx, id, ctx.userName);
      return;
    }
    case "output":
      return A.markPosted(ctx, id, await body(req, A.PostedIn));
    case "listing":
      return A.setListing(ctx, id, (await body(req, z.object({ enabled: z.boolean() }))).enabled);
    case "enquiry":
      return A.setEnquiry(ctx, id, (await body(req, z.object({ status: z.enum(["new", "replied", "closed"]) }))).status);
    case "comment":
      return A.resolveComment(ctx, id, (await body(req, z.object({ resolved: z.boolean() }))).resolved);
    case "job": {
      const x = await body(req, z.object({ action: z.enum(["cancel", "retry"]) }));
      const ok = x.action === "cancel" ? cancel(id, ctx.workspaceId) : retry(id, ctx.workspaceId);
      if (!ok) fail(409, x.action === "cancel" ? "This step has already finished." : "Only failed, cancelled or held steps can run again.");
      if (x.action === "retry") run(`UPDATE output SET status = 'queued', note = NULL WHERE job_id = ? AND status IN ('failed','blocked')`, id);
      return { ok };
    }
    default:
      return fail(404, "Unknown item.");
  }
});

export const DELETE = route<P>(async (_req, { kind, id }) => {
  const ctx = await requireCtx();
  switch (kind) {
    case "person":
      return A.removePerson(ctx, id);
    case "link":
      return A.revokeLink(ctx, id);
    case "output": {
      const o = one<{ id: string }>(`SELECT id FROM output WHERE id = ? AND workspace_id = ? AND status != 'ready'`, id, ctx.workspaceId) ?? fail(409, "Finished renders stay in the record. Mark them as not needed instead.");
      run(`DELETE FROM output WHERE id = ?`, o.id);
      return;
    }
    default:
      return fail(404, "Unknown item.");
  }
});
