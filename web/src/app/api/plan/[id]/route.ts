import { z } from "zod";
import { body, fail, route } from "@/server/http";
import { requireCtx } from "@/server/guard";
import { approvePlan } from "@/server/planner";
import { run } from "@/server/db";
import { audit } from "@/server/audit";

export const runtime = "nodejs";

export const POST = route<{ id: string }>(async (req, { id }) => {
  const ctx = await requireCtx();
  const x = await body(req, z.object({ action: z.enum(["approve", "dismiss"]) }));
  if (x.action === "dismiss") {
    run(`UPDATE plan_run SET status = 'dismissed' WHERE id = ? AND workspace_id = ? AND status = 'proposed'`, id, ctx.workspaceId);
    return { ok: true };
  }
  const r = approvePlan(ctx, id);
  if (!r) fail(404, "Not found.");
  audit({ workspaceId: ctx.workspaceId, userId: ctx.userId, actor: "user", action: "plan.approved", target: id, meta: { jobs: r.jobs.length } });
  return r;
});
