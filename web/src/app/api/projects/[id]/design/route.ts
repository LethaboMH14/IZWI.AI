import { z } from "zod";
import { body, fail, route } from "@/server/http";
import { requireCtx, projectOf } from "@/server/guard";
import { all, newId, now, one, run } from "@/server/db";
import { designStageEnabled } from "@/server/flags";

export const runtime = "nodejs";
type P = { id: string };
const Create = z.object({ artifact: z.enum(["thumbnail", "cover", "poster", "countdown", "illustration"]), platform: z.enum(["youtube", "tiktok", "instagram", "facebook", "general"]), headline: z.string().max(100), subtitle: z.string().max(180), accent: z.enum(["amber", "terracotta", "forest", "ocean"]) }).strict();
const Action = z.object({ id: z.string().min(1), action: z.literal("approve") }).strict();
function enabled() { if (!designStageEnabled()) fail(404, "Not found."); }
export const GET = route<P>(async (_req, { id }) => {
  enabled(); const ctx = await requireCtx(); const project = await projectOf(ctx, id);
  return { drafts: await all(`SELECT id, artifact, platform, headline, subtitle, accent, status, created_at, approved_at FROM design_draft WHERE project_id = ? AND workspace_id = ? ORDER BY created_at DESC`, project.id, ctx.workspaceId) };
});
export const POST = route<P>(async (req, { id }) => {
  enabled(); const ctx = await requireCtx(); const project = await projectOf(ctx, id); const draft = await body(req, Create);
  if (!draft.headline.trim()) fail(400, "Add a headline before saving the mock-up.");
  const draftId = newId("dsg"); const createdAt = now();
  await run(`INSERT INTO design_draft (id, workspace_id, project_id, created_by, artifact, platform, headline, subtitle, accent, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?)`, draftId, ctx.workspaceId, project.id, ctx.userId, draft.artifact, draft.platform, draft.headline.trim(), draft.subtitle.trim(), draft.accent, createdAt);
  return { id: draftId, ...draft, status: "draft", createdAt };
});
export const PATCH = route<P>(async (req, { id }) => {
  enabled(); const ctx = await requireCtx(); const project = await projectOf(ctx, id); const { id: draftId } = await body(req, Action);
  const draft = await one<{ id: string; status: string }>("SELECT id, status FROM design_draft WHERE id = ? AND project_id = ? AND workspace_id = ?", draftId, project.id, ctx.workspaceId) ?? fail(404, "Design draft not found.");
  if (draft.status === "approved") return { id: draft.id, status: "approved" };
  await run("UPDATE design_draft SET status = 'approved', approved_at = ? WHERE id = ?", now(), draft.id);
  return { id: draft.id, status: "approved" };
});
