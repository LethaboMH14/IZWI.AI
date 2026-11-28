import { z } from "zod";
import { body, fail, route } from "@/server/http";
import { requireCtx } from "@/server/guard";
import { newId, now, one, run } from "@/server/db";
import { scheduledPostsEnabled } from "@/server/flags";

export const runtime = "nodejs";
const Input = z.object({
  outputId: z.string().min(1), platform: z.enum(["youtube", "tiktok", "instagram", "facebook"]),
  scheduledAt: z.number().int().positive(), timezone: z.literal("Africa/Johannesburg"),
  title: z.string().trim().min(1).max(120), description: z.string().max(5000), tags: z.array(z.string().trim().min(1).max(50)).max(20), acknowledgeReview: z.boolean(),
}).strict();

export const GET = route(async () => {
  if (!scheduledPostsEnabled()) return { enabled: false };
  await requireCtx();
  return { enabled: true };
});

export const POST = route(async (req) => {
  if (!scheduledPostsEnabled()) fail(404, "Not found.");
  const ctx = await requireCtx();
  const input = await body(req, Input);
  if (input.scheduledAt <= now()) fail(400, "Choose a future date and time.");
  const output = await one<{ id: string; status: string }>("SELECT id, status FROM output WHERE id = ? AND workspace_id = ?", input.outputId, ctx.workspaceId);
  if (!output || output.status !== "ready") fail(409, "Choose a finished render before preparing a post.");
  const policy = await one<{ result: "pass" | "review" | "block" }>("SELECT result FROM policy_check WHERE output_id = ? AND workspace_id = ? AND platform = ?", output.id, ctx.workspaceId, input.platform);
  if (!policy || policy.result === "block") fail(409, "Run the policy pre-check first. A blocked result cannot be prepared.");
  if (policy.result === "review" && !input.acknowledgeReview) fail(409, "Review the findings and acknowledge them before preparing this manual export.");
  const id = newId("sch");
  const createdAt = now();
  await run(`INSERT INTO post_schedule (id, workspace_id, output_id, platform, scheduled_at, timezone, title, description, tags, policy_status, acknowledged_by, status, created_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual_export', ?, ?)`, id, ctx.workspaceId, output.id, input.platform, input.scheduledAt, input.timezone, input.title, input.description, JSON.stringify(input.tags), policy.result, policy.result === "review" ? ctx.userId : null, ctx.userId, createdAt);
  return { id, outputId: output.id, platform: input.platform, scheduledAt: input.scheduledAt, timezone: input.timezone, title: input.title, description: input.description, tags: input.tags, policyStatus: policy.result, status: "manual_export", message: "Manual export prepared. IZWI has not scheduled or posted this content." };
});
