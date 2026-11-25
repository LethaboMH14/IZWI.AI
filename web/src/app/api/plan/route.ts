// Sentence in, plan out. Uses the workspace's planning model when one is connected and tested, otherwise rules.
import { z } from "zod";
import { body, fail, route } from "@/server/http";
import { projectOf, requireCtx } from "@/server/guard";
import { describe, modelIntents, projectPlanState, ruleIntents, savePlan } from "@/server/planner";
import { chatJSON, providerFor } from "@/server/providers";
import { one } from "@/server/db";
import { gateFor, gateReason } from "@/server/rights";
import { storyScenes } from "@/lib/story-scenes";

export const runtime = "nodejs";

export const GET = route(async () => {
  const ctx = await requireCtx();
  const p = providerFor(ctx.workspaceId, "plan");
  return { model: p ? `${p.label} · ${p.model}` : null };
});

export const POST = route(async (req) => {
  const ctx = await requireCtx();
  const x = await body(req, z.object({
    projectId: z.string(), prompt: z.string().trim().min(3).max(600),
    target: z.object({ kind: z.enum(["clip", "person", "output", "track", "scene"]), id: z.string().max(100) }).optional(),
    rights: z.boolean().optional(),
  }));
  const project = projectOf(ctx, x.projectId);
  if (x.target?.kind === "scene") {
    const index = /^\d+$/.test(x.target.id) ? Number(x.target.id) : -1;
    const scene = storyScenes(project.script)[index];
    if (!scene) fail(404, "This scene is no longer in the saved storyboard.");
    const provider = providerFor(ctx.workspaceId, "plan");
    if (!provider) fail(422, "Connect and test a planning model in Run on to request a scene rewrite, or edit the saved script in Create.");
    try {
      const result = await chatJSON(provider, "Suggest a revision to the supplied scene based on the creator’s direction. Return JSON with one text field. Make no claims that project changes were applied.",
        JSON.stringify({ scene: scene.text, direction: x.prompt }), z.object({ text: z.string().min(1).max(2500) }), { maxTokens: 700, timeoutMs: 60_000 });
      return {
        answer: `Scene ${index + 1} suggestion · ${provider.label} · ${provider.model}\n\n${result.data.text}`,
        revision: { index, original: scene.text, text: result.data.text },
      };
    } catch {
      return fail(502, "The planning model could not provide a scene revision. Try again or edit the script in Create.");
    }
  }
  const targets = { clip: "clip", person: "person", output: "output", track: "caption_track" } as const;
  if (x.target && !one(`SELECT id FROM ${targets[x.target.kind]} WHERE project_id = ? AND id = ?`, x.projectId, x.target.id)) {
    fail(404, "This panel is no longer in the project.");
  }
  const output = x.target?.kind === "output"
    ? one<{ clip_id: string | null }>("SELECT clip_id FROM output WHERE id = ? AND project_id = ?", x.target.id, x.projectId)
    : null;
  const clipId = x.target?.kind === "clip" ? x.target.id : output?.clip_id;
  const clip = clipId ? one<{ id: string; title: string; status: string; start_ms: number; end_ms: number }>(
    "SELECT id, title, status, start_ms, end_ms FROM clip WHERE id = ? AND project_id = ?", clipId, x.projectId,
  ) : null;

  if (x.rights && /\b(rights|consent|clear(ed)?|held|permit|permission|blocked|waiting|why|lock(ed)?)\b/i.test(x.prompt)) {
    if (x.target?.kind === "person") {
      const consent = one<{ status: string }>("SELECT status FROM consent WHERE person_id = ? ORDER BY requested_at DESC LIMIT 1", x.target.id);
      return { answer: consent?.status === "granted" ? "This person’s permission is recorded. Open Manage consent to inspect its scope."
        : `Consent status: ${consent?.status ?? "not requested"}. Open Manage consent to review or request permission.` };
    }
    if (clip) {
      const gate = gateFor(x.projectId, clip.start_ms, clip.end_ms);
      return { answer: gate.ok ? "This clip is clear to render under the current declaration and consent records." : gateReason(gate) };
    }
    return { answer: "This panel has no clip with a consent gate. Open Protect to review the project declaration and any outstanding requests." };
  }

  if (x.target?.kind === "person") fail(422, "Ask about the selected person’s consent, or use Manage consent to request permission.");
  let intents = ruleIntents(x.prompt);
  if (clip && intents.some((intent) => intent.verb === "Publish") && !/\b(find|suggest|cut|trim)\b/i.test(x.prompt)) {
    intents = intents.filter((intent) => intent.verb !== "Cut");
  }
  let planner = "IZWI rules";
  let note: string | null = null;
  try {
    const m = await modelIntents(ctx.workspaceId, x.prompt);
    if (m && m.intents.length) {
      intents = m.intents;
      planner = m.planner;
    }
  } catch (e) {
    note = `The planning model did not answer (${(e as Error).message.slice(0, 120)}), so built-in rules made this plan.`;
  }
  if (!intents.length) fail(422, "I could not turn that into steps. Name what you want made: clips, captions in a language, a render or a package for your editor.");
  const state = projectPlanState(ctx.workspaceId, x.projectId);
  let steps = describe(intents, state);
  if (x.target?.kind === "clip" || x.target?.kind === "output") {
    steps = steps.map((step) => step.verb === "Publish" && clip
      ? { ...step, clipId: clip.id, what: `Render “${clip.title}” as 9:16`, runnable: clip.status === "kept",
          why: clip.status === "kept" ? undefined : "Keep this clip before rendering." }
      : { ...step, runnable: false, why: "This action needs the project prompt. From this panel you can render the selected clip." });
  }
  if (x.target?.kind === "track") {
    const track = one<{ language: string }>("SELECT language FROM caption_track WHERE project_id = ? AND id = ?", x.projectId, x.target.id);
    steps = steps.map((step) => step.verb === "Translate" && step.language === track?.language
      ? step : { ...step, runnable: false, why: "This panel can draft captions for its displayed language. Use the project prompt for other actions." });
  }
  const id = savePlan(ctx, x.projectId, x.prompt, planner, steps);
  return { id, planner, steps, note };
});
