import { z } from "zod";
import { body, fail, route } from "@/server/http";
import { requireCtx } from "@/server/guard";
import { all, newId, now, one, run } from "@/server/db";
import { policyPrecheck, type PolicyPlatform, type PolicyResult } from "@/lib/platform-policy";
import { policyPrecheckEnabled } from "@/server/flags";
import { projectState } from "@/server/state";

export const runtime = "nodejs";
const Input = z.object({ outputId: z.string().min(1), platforms: z.array(z.enum(["youtube", "tiktok", "instagram", "facebook"])).min(1).max(4) }).strict();

export const GET = route(async () => {
  if (!policyPrecheckEnabled()) return { enabled: false };
  await requireCtx();
  return { enabled: true };
});

export const POST = route(async (req) => {
  if (!policyPrecheckEnabled()) fail(404, "Not found.");
  const ctx = await requireCtx();
  const input = await body(req, Input);
  const output = await one<{ id: string; project_id: string; clip_id: string; preset: string; language: string | null; status: string }>(
    `SELECT id, project_id, clip_id, preset, language, status FROM output WHERE id = ? AND workspace_id = ?`, input.outputId, ctx.workspaceId,
  ) ?? fail(404, "Render not found.");
  if (output.status !== "ready") fail(409, "Only a finished render can be checked.");
  const clip = await one<{ duration_ms: number }>(`SELECT end_ms - start_ms AS duration_ms FROM clip WHERE id = ? AND project_id = ?`, output.clip_id, output.project_id);
  if (!clip) fail(404, "Scene not found.");
  const project = await projectState(ctx, output.project_id);
  const captions = output.language ? project.tracks.find((track) => track.language === output.language) : null;
  const captionsApproved = output.language ? captions ? captions.status === "approved" : false : null;
  const consentKnown = project.people.length > 0 && project.people.every((person) => person.consent?.status === "granted");
  const rightsDeclared = project.declaration !== null;
  const results: PolicyResult[] = input.platforms.map((platform) => policyPrecheck({ platform: platform as PolicyPlatform, durationMs: clip.duration_ms, preset: output.preset, captionsApproved, rightsDeclared, consentKnown }));
  for (const result of results) await run(`INSERT INTO policy_check (id, workspace_id, output_id, platform, result, findings, checked_at, checked_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(output_id, platform) DO UPDATE SET result = excluded.result, findings = excluded.findings, checked_at = excluded.checked_at, checked_by = excluded.checked_by`,
  newId("pol"), ctx.workspaceId, output.id, result.platform, result.status, JSON.stringify(result.findings), now(), ctx.userId);
  const saved = await all<{ platform: PolicyPlatform; result: PolicyResult["status"]; findings: string; checked_at: number }>(
    `SELECT platform, result, findings, checked_at FROM policy_check WHERE output_id = ? AND workspace_id = ? ORDER BY platform`, output.id, ctx.workspaceId,
  );
  return { results: saved.map((row) => ({ platform: row.platform, status: row.result, findings: JSON.parse(row.findings), checkedAt: row.checked_at, scope: "limited pre-check" as const })) };
});
