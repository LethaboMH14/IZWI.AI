// Sentence in, plan out. Uses the workspace's planning model when one is connected and tested, otherwise rules.
import { z } from "zod";
import { body, fail, route } from "@/server/http";
import { projectOf, requireCtx } from "@/server/guard";
import { describe, modelIntents, projectPlanState, ruleIntents, savePlan } from "@/server/planner";
import { providerFor } from "@/server/providers";

export const runtime = "nodejs";

export const GET = route(async () => {
  const ctx = await requireCtx();
  const p = providerFor(ctx.workspaceId, "plan");
  return { model: p ? `${p.label} · ${p.model}` : null };
});

export const POST = route(async (req) => {
  const ctx = await requireCtx();
  const x = await body(req, z.object({ projectId: z.string(), prompt: z.string().trim().min(3).max(600) }));
  projectOf(ctx, x.projectId);
  let intents = ruleIntents(x.prompt);
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
  const steps = describe(intents, projectPlanState(ctx.workspaceId, x.projectId));
  const id = savePlan(ctx, x.projectId, x.prompt, planner, steps);
  return { id, planner, steps, note };
});
