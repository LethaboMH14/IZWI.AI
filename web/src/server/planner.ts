// Prompt → plan → approve → jobs. A model (when connected) only proposes intents; code decides the tool,
// where it runs, what gates apply and whether it can run now. Nothing runs until a person approves.
import { z } from "zod";
import { newId, now, one, run, tx } from "./db";
import { enqueue } from "./jobs";
import { HttpError } from "./http";
import { chatJSON, providerFor } from "./providers";
import { LANGUAGES, langName } from "../lib/languages";
import type { Ctx } from "./guard";
import { audit } from "./audit";
import { updateClip, learnGlossary, requestConsent, previewGlossaryChanges } from "./actions";
import { createHash } from "node:crypto";
import { ConsentScopeSchema } from "./consent-scope";

export type Verb = "Hear" | "Cut" | "Translate" | "Dub" | "Storyboard" | "Animate" | "Publish" | "Record";
export type Intent = { verb: Verb; language?: string; count?: number };
const ClipSnapshot = z.object({ id: z.string().min(1), updatedAt: z.number().int().nonnegative(), textHash: z.string().regex(/^[a-f0-9]{64}$/).optional() }).strict();
const LineSnapshot = z.object({ id: z.string().min(1), textHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
const ClipPre = z.object({ clips: z.array(ClipSnapshot).length(1), lines: z.array(LineSnapshot).max(0).default([]), consent: z.null().default(null) }).strict();
const GlossaryPre = z.object({ clips: z.array(ClipSnapshot).max(0).default([]), lines: z.array(LineSnapshot), consent: z.null().default(null) }).strict();
const ConsentPre = z.object({ clips: z.array(ClipSnapshot).max(0).default([]), lines: z.array(LineSnapshot).max(0).default([]), consent: z.object({ personId: z.string().min(1), id: z.string().nullable(), updatedAt: z.number().int().nullable(), ledgerSeq: z.number().int().nullable() }).strict() }).strict();
const ActionMeta = { title: z.string().max(160).optional(), reason: z.string().max(500).optional(), preview: z.array(z.object({ label: z.string().max(120), before: z.string().max(500).optional(), after: z.string().max(500).optional() }).strict()).max(20).default([]) };
const ActionStepSchema = z.discriminatedUnion("action", [
  z.object({ kind: z.literal("action"), action: z.literal("keepClip"), args: z.object({ clipId: z.string().min(1).max(120) }).strict(), pre: ClipPre, ...ActionMeta }).strict(),
  z.object({ kind: z.literal("action"), action: z.literal("dropClip"), args: z.object({ clipId: z.string().min(1).max(120) }).strict(), pre: ClipPre, ...ActionMeta }).strict(),
  z.object({ kind: z.literal("action"), action: z.literal("trimClip"), args: z.object({ clipId: z.string().min(1).max(120), startMs: z.number().int().nonnegative(), endMs: z.number().int().positive() }).strict(), pre: ClipPre, ...ActionMeta }).strict(),
  z.object({ kind: z.literal("action"), action: z.literal("requestConsent"), args: z.object({ personId: z.string().min(1).max(120), scope: ConsentScopeSchema }).strict(), pre: ConsentPre, ...ActionMeta }).strict(),
  z.object({ kind: z.literal("action"), action: z.literal("addGlossaryTerm"), args: z.object({ term: z.string().trim().min(1).max(60), heard: z.string().trim().min(1).max(60).optional() }).strict(), pre: GlossaryPre, scope: z.string().max(240).optional(), ...ActionMeta }).strict(),
]);
const JobStepSchema = z.object({ kind: z.literal("job"), verb: z.enum(["Hear", "Cut", "Translate", "Dub", "Storyboard", "Animate", "Publish", "Record"]), language: z.string().max(5).optional(), count: z.number().int().min(1).max(10).optional(), what: z.string().max(500).default(""), tool: z.string().max(120).default(""), runs: z.string().max(120).default(""), gate: z.string().max(500).optional(), runnable: z.boolean().optional(), why: z.string().max(500).optional(), stepId: z.string().max(120).optional(), dependsOn: z.array(z.string().max(120)).max(1).default([]), assistant: z.boolean().optional() });
const TaggedStepSchema = z.discriminatedUnion("kind", [JobStepSchema, ActionStepSchema]);
const LegacyJobStepSchema = JobStepSchema.omit({ kind: true }).transform((step) => ({ ...step, kind: "job" as const }));
export const StepSchema = z.union([TaggedStepSchema, LegacyJobStepSchema]).superRefine((step, issue) => {
  if (step.kind !== "action") return;
  if (step.action === "keepClip" || step.action === "dropClip" || step.action === "trimClip") {
    if (step.pre.clips[0]?.id !== step.args.clipId) issue.addIssue({ code: "custom", message: "The clip must be included in the action preconditions.", path: ["pre", "clips"] });
  }
  if (step.action === "trimClip" && step.args.endMs - step.args.startMs < 1000) issue.addIssue({ code: "custom", message: "A clip must be at least one second long.", path: ["args", "endMs"] });
  if (step.action === "requestConsent" && step.pre.consent.personId !== step.args.personId) issue.addIssue({ code: "custom", message: "The person must be included in the consent preconditions.", path: ["pre", "consent", "personId"] });
});
export type JobStep = Intent & { kind: "job"; what: string; tool: string; runs: string; gate?: string; runnable?: boolean; why?: string; stepId?: string; dependsOn?: string[]; assistant?: boolean };
export type Step = JobStep | z.infer<typeof ActionStepSchema>;

async function actionPreconditionsMatch(ctx: Ctx, projectId: string, step: z.infer<typeof ActionStepSchema>): Promise<boolean> {
  if (step.action === "keepClip" || step.action === "dropClip" || step.action === "trimClip") {
    const snapshot = step.pre.clips[0];
    const row = await one<{ updated_at: number; title: string }>(`SELECT updated_at, title FROM clip WHERE id = ? AND project_id = ? AND workspace_id = ?`, snapshot.id, projectId, ctx.workspaceId);
    if (!row || row.updated_at !== snapshot.updatedAt || (snapshot.textHash && createHash("sha256").update(row.title).digest("hex") !== snapshot.textHash)) return false;
    if (step.action === "trimClip") {
      const source = await one<{ duration_ms: number | null }>(`SELECT duration_ms FROM asset WHERE project_id = ? AND workspace_id = ? AND kind = 'source' ORDER BY created_at DESC LIMIT 1`, projectId, ctx.workspaceId);
      if (!source?.duration_ms || step.args.startMs >= step.args.endMs || step.args.endMs - step.args.startMs < 1000 || step.args.endMs > source.duration_ms) return false;
    }
    return true;
  }
  if (step.action === "requestConsent") {
    if (!await one(`SELECT 1 FROM person WHERE id = ? AND project_id = ? AND workspace_id = ?`, step.args.personId, projectId, ctx.workspaceId)) return false;
    const current = await one<{ id: string; updated_at: number; seq: number | null }>(`SELECT c.id, c.updated_at, (SELECT MAX(seq) FROM consent_ledger WHERE consent_id = c.id) seq FROM consent c WHERE c.person_id = ? AND c.project_id = ? AND c.workspace_id = ? ORDER BY c.updated_at DESC LIMIT 1`, step.args.personId, projectId, ctx.workspaceId);
    const pre = step.pre.consent;
    return (current?.id ?? null) === pre.id && (current?.updated_at ?? null) === pre.updatedAt && (current?.seq ?? null) === pre.ledgerSeq;
  }
  const current = (await previewGlossaryChanges(ctx.workspaceId, step.args)).map(({ id, textHash }) => ({ id, textHash })).sort((a, b) => a.id.localeCompare(b.id));
  const expected = [...step.pre.lines].sort((a, b) => a.id.localeCompare(b.id));
  return JSON.stringify(current) === JSON.stringify(expected);
}

async function validateActionPreconditions(ctx: Ctx, projectId: string, step: z.infer<typeof ActionStepSchema>, approval: boolean) {
  if (!await actionPreconditionsMatch(ctx, projectId, step)) throw new HttpError(approval ? 409 : 400, approval ? "This changed since the assistant suggested it" : "The action preconditions do not match the current project.");
}

const STEMS: Record<string, string> = {
  zulu: "zu", xhosa: "xh", sotho: "st", sesotho: "st", tswana: "tn", setswana: "tn", afrikaans: "af", pedi: "nso", sepedi: "nso",
  tsonga: "ts", xitsonga: "ts", venda: "ve", tshivenda: "ve", swati: "ss", siswati: "ss", ndebele: "nr", swahili: "sw", kiswahili: "sw",
  amharic: "am", somali: "so", yoruba: "yo", hausa: "ha", igbo: "ig", shona: "sn", french: "fr", portuguese: "pt", arabic: "ar",
  spanish: "es", hindi: "hi", english: "en",
};

export function ruleIntents(prompt: string): Intent[] {
  const p = prompt.toLowerCase();
  const out: Intent[] = [];
  const langs = [...new Set(Object.entries(STEMS).filter(([stem]) => new RegExp(`\\b(isi|si|se|xi|tshi|ki)?${stem}\\b`).test(p)).map(([, code]) => code))];
  const n = Number((/\b(\d{1,2})\b/.exec(p) ?? [])[1] ?? 0) || ({ one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 } as Record<string, number>)[(/\b(one|two|three|four|five|six)\b/.exec(p) ?? [])[1] ?? ""] || 0;
  if (/\b(transcri|listen|hear)/.test(p)) out.push({ verb: "Hear" });
  if (/\b(clip|short|reel|tiktok|highlight|cut)/.test(p)) out.push({ verb: "Cut", count: n || 3 });
  const wantsDub = /\b(dub|voice ?over)/.test(p);
  if (/\b(caption|subtitle|translat)/.test(p) || (langs.length && !wantsDub)) for (const l of langs) if (l !== "en") out.push({ verb: "Translate", language: l });
  if (wantsDub) for (const l of langs.length ? langs : ["en"]) out.push({ verb: "Dub", language: l });
  if (/\b(storyboard|scene)/.test(p)) out.push({ verb: "Storyboard" });
  if (/\banimat/.test(p)) out.push({ verb: "Animate" });
  if (/\b(publish|post|export|render|ready to upload)/.test(p)) out.push({ verb: "Publish" });
  if (/\b(package|hand ?off|davinci|capcut|record|timeline)/.test(p)) out.push({ verb: "Record" });
  return out;
}

const ModelPlan = z.object({
  steps: z.array(z.object({
    verb: z.enum(["Hear", "Cut", "Translate", "Dub", "Storyboard", "Animate", "Publish", "Record"]),
    language: z.string().max(5).optional(), count: z.number().int().min(1).max(10).optional(),
  })).max(10),
});

export async function modelIntents(workspaceId: string, prompt: string) {
  const p = await providerFor(workspaceId, "plan");
  if (!p) return null;
  const codes = LANGUAGES.map((l) => `${l.code}=${l.name}`).join(", ");
  const r = await chatJSON(p,
    `You turn a creator's request into steps for a media workspace. Allowed verbs: Hear (transcribe), Cut (suggest clips; optional count), Translate (captions into one language; language code), Dub (voice in a language), Storyboard, Animate, Publish (render kept clips), Record (export package for editors). Language codes: ${codes}. Return JSON only: {"steps":[{"verb":"...","language":"zu","count":3}]}`,
    prompt.slice(0, 600), ModelPlan, { maxTokens: 400, timeoutMs: 60_000 });
  return { intents: r.data.steps.filter((s) => !s.language || LANGUAGES.some((l) => l.code === s.language)) as Intent[], planner: `${p.label} · ${p.model}` };
}

type State = { hasSource: boolean; hasTranscript: boolean; sourceLanguage: string | null; kept: number; translator: string | null };

export async function projectPlanState(workspaceId: string, projectId: string): Promise<State> {
  const src = await one(`SELECT id FROM asset WHERE project_id = ? AND kind = 'source'`, projectId);
  const track = await one<{ language: string }>(`SELECT language FROM caption_track WHERE project_id = ? AND kind = 'source'`, projectId);
  const kept = (await one<{ n: number }>(`SELECT COUNT(*) n FROM clip WHERE project_id = ? AND status = 'kept'`, projectId))!.n;
  const t = await providerFor(workspaceId, "translate");
  return { hasSource: !!src, hasTranscript: !!track, sourceLanguage: track?.language ?? null, kept, translator: t ? t.label : null };
}

export function describe(intents: Intent[], s: State): JobStep[] {
  const hearing = intents.some((i) => i.verb === "Hear") || s.hasTranscript;
  const cutting = intents.some((i) => i.verb === "Cut") && s.hasSource && hearing;
  const seen = new Set<string>();
  return intents.filter((i) => {
    const k = `${i.verb}:${i.language ?? ""}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).map((i): JobStep => {
    switch (i.verb) {
      case "Hear":
        return { ...i, kind: "job", what: s.hasTranscript ? "Listen again with the current glossary (replaces the transcript and its translations)" : "Transcribe the recording with word timing", tool: "whisper.cpp base", runs: "This device", runnable: s.hasSource, why: s.hasSource ? undefined : "Upload a recording first." };
      case "Cut":
        return { ...i, kind: "job", what: `Suggest ${i.count ?? 3} clips and say why each was chosen`, tool: "IZWI clip finder", runs: "This device", runnable: s.hasSource && hearing, why: hearing ? undefined : "Needs a transcript first. Add Hear to the request." };
      case "Translate": {
        const name = langName(i.language ?? "");
        if (s.sourceLanguage === i.language) return { ...i, kind: "job", what: `Captions are already in ${name}`, tool: "None", runs: "-", runnable: false, why: "Nothing to translate." };
        return { ...i, kind: "job", what: `Draft ${name} captions from the transcript`, tool: s.translator ?? "No translator connected", runs: "Your key", gate: `Stays a draft until a speaker of ${name} approves every line`, runnable: !!s.translator && hearing, why: !s.translator ? "Connect a translation provider in Run on first." : hearing ? undefined : "Needs a transcript first." };
      }
      case "Dub":
        return { ...i, kind: "job", what: `${langName(i.language ?? "en")} voice track`, tool: "Chatterbox (planned)", runs: "GPU service", gate: "Needs the speaker's recorded consent to use their voice", runnable: false, why: "Planned: no GPU voice service is connected." };
      case "Storyboard":
        return { ...i, kind: "job", what: "Break the script into timed scenes", tool: "AI story tab", runs: "This device", runnable: false, why: "Open Create > AI story; it works there now." };
      case "Animate":
        return { ...i, kind: "job", what: "Generate moving frames per scene", tool: "Wan 2.1 / LTX-Video (planned)", runs: "GPU service", runnable: false, why: "Planned: no GPU video service is connected." };
      case "Publish":
        return {
          ...i, kind: "job",
          what: cutting
            ? `Render the clips this plan suggests${s.kept ? ` and your ${s.kept} kept clip${s.kept === 1 ? "" : "s"}` : ""} as 9:16 with burned-in captions`
            : s.kept ? `Render ${s.kept} kept clip${s.kept === 1 ? "" : "s"} as 9:16 with burned-in captions` : "Render kept clips",
          tool: "FFmpeg", runs: "This device", gate: "Held until your declaration and everyone's consent are recorded",
          runnable: cutting || s.kept > 0, why: cutting || s.kept ? undefined : "Keep at least one clip first, or add clips to the request.",
        };
      case "Record":
        return { ...i, kind: "job", what: "Build the hand-off package: captions, EDL and OTIO timelines, renders, record sheet", tool: "IZWI package", runs: "This device", runnable: s.hasSource };
    }
  });
}

export async function savePlan(ctx: Ctx, projectId: string, prompt: string, planner: string, steps: Step[]) {
  if (!await one(`SELECT 1 FROM project WHERE id = ? AND workspace_id = ?`, projectId, ctx.workspaceId)) throw new HttpError(404, "Not found.");
  const parsed = z.array(StepSchema).parse(steps);
  for (const step of parsed) if (step.kind === "action") await validateActionPreconditions(ctx, projectId, step, false);
  const id = newId("pln");
  await run(`INSERT INTO plan_run (id, workspace_id, project_id, prompt, planner, steps, status, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, 'proposed', ?, ?)`, id, ctx.workspaceId, projectId, prompt, planner, JSON.stringify(parsed), ctx.userId, now());
  return id;
}

// Jobs must be enqueued in dependency order, whatever order a model listed the steps in.
const ORDER: Verb[] = ["Hear", "Cut", "Translate", "Dub", "Storyboard", "Animate", "Publish", "Record"];

// One transaction: either every job of the plan is queued and the plan is marked approved, or nothing is.
// Publish does not read clips now. It queues a fan-out step that runs after Cut and renders the clips that exist then.
export async function approvePlan(ctx: Ctx, planId: string) {
  return await tx(async () => {
    const plan = await one<{ id: string; project_id: string; steps: string; status: string }>(`SELECT * FROM plan_run WHERE id = ? AND workspace_id = ?`, planId, ctx.workspaceId);
    if (!plan) return null;
    if (plan.status !== "proposed") return { already: true, jobs: [] as string[] };
    let rawSteps: unknown;
    try { rawSteps = JSON.parse(plan.steps); } catch { throw new HttpError(409, "This plan is no longer valid."); }
    const parsed = z.array(StepSchema).safeParse(rawSteps);
    if (!parsed.success) throw new HttpError(409, "This plan is no longer valid.");
    const project = await one<{ id: string }>(`SELECT id FROM project WHERE id = ? AND workspace_id = ?`, plan.project_id, ctx.workspaceId);
    if (!project) throw new HttpError(404, "Not found.");
    const steps = parsed.data.map((s, i) => ({ s, i })).sort((a, b) => {
      const av = a.s.kind === "job" ? ORDER.indexOf(a.s.verb) : -1;
      const bv = b.s.kind === "job" ? ORDER.indexOf(b.s.verb) : -1;
      return av - bv;
    });
    const ids = new Set(parsed.data.filter((s) => s.kind === "job").map((s) => s.stepId).filter((x): x is string => !!x));
    for (const { s } of steps) if (s.kind === "job") for (const dep of s.dependsOn) {
      if (ids.has(dep)) continue;
      const succeeded = await one(`SELECT 1 FROM job WHERE id = ? AND project_id = ? AND workspace_id = ? AND status = 'succeeded'`, dep, plan.project_id, ctx.workspaceId);
      if (!succeeded) throw new HttpError(409, "This changed since the assistant suggested it");
    }
    const jobs: string[] = [];
    let hear: string | null = null;
    let cut: string | null = null;
    let last: string | null = null;
    const base = { workspaceId: ctx.workspaceId, projectId: plan.project_id, createdBy: ctx.userId };
    const state = await projectPlanState(ctx.workspaceId, plan.project_id);
    const hasPlanHear = parsed.data.some((s) => s.kind === "job" && s.verb === "Hear");
    const hasPlanCut = parsed.data.some((s) => s.kind === "job" && s.verb === "Cut");
    const runnable = (s: JobStep) => {
      if (s.verb === "Hear") return state.hasSource && (!s.assistant || !state.hasTranscript);
      if (s.verb === "Cut") return state.hasSource && (state.hasTranscript || hasPlanHear);
      if (s.verb === "Translate") return !!state.translator && (state.hasTranscript || hasPlanHear);
      if (s.verb === "Publish") return state.kept > 0 || hasPlanCut;
      if (s.verb === "Record") return state.hasSource;
      return false;
    };
    for (const { s, i } of steps) {
      if (s.kind === "action") {
        await validateActionPreconditions(ctx, plan.project_id, s, true);
        if (s.action === "keepClip") await updateClip(ctx, s.args.clipId, { status: "kept" }, plan.project_id);
        else if (s.action === "dropClip") await updateClip(ctx, s.args.clipId, { status: "dropped" }, plan.project_id);
        else if (s.action === "trimClip") await updateClip(ctx, s.args.clipId, { startMs: s.args.startMs, endMs: s.args.endMs }, plan.project_id);
        else if (s.action === "requestConsent") await requestConsent(ctx, plan.project_id, s.args.personId, s.args.scope, { audit: false });
        else await learnGlossary(ctx, s.args);
        await audit({ workspaceId: ctx.workspaceId, userId: ctx.userId, actor: "user", action: "assistant.action_approved", target: plan.id, meta: { action: s.action } });
        continue;
      }
      if (s.verb === "Hear" && !state.hasSource) throw new HttpError(409, "Upload a recording first, then approve the plan again.");
      // Refuse (not skip) an assistant Hear once a transcript exists, so the creator learns the proposal went stale.
      if (s.assistant && s.verb === "Hear" && await one(`SELECT 1 FROM caption_track WHERE project_id = ? AND workspace_id = ? AND kind = 'source'`, plan.project_id, ctx.workspaceId)) throw new HttpError(409, "This changed since the assistant suggested it");
      if (!runnable(s)) continue;
      const key = `plan:${plan.id}:${i}`;
      if (s.verb === "Hear") {
        const src = await one<{ id: string }>(`SELECT id FROM asset WHERE project_id = ? AND workspace_id = ? AND kind = 'source' ORDER BY created_at DESC LIMIT 1`, plan.project_id, ctx.workspaceId);
        if (!src) throw new HttpError(409, "Upload a recording first, then approve the plan again.");
        hear = last = (await enqueue({ ...base, type: "transcribe", input: { assetId: src.id, ...(s.assistant ? { assistant: true } : {}) }, idempotencyKey: key })).id;
        jobs.push(hear);
      } else if (s.verb === "Cut") {
        cut = last = (await enqueue({ ...base, type: "suggest_clips", input: { count: s.count ?? 3 }, idempotencyKey: key, dependsOn: hear })).id;
        jobs.push(cut);
      } else if (s.verb === "Translate") {
        last = (await enqueue({ ...base, type: "translate", input: { language: s.language }, idempotencyKey: key, dependsOn: hear })).id;
        jobs.push(last);
      } else if (s.verb === "Publish") {
        last = (await enqueue({ ...base, type: "publish", input: { cutJobId: cut }, idempotencyKey: key, dependsOn: cut ?? hear })).id;
        jobs.push(last);
      } else if (s.verb === "Record") {
        last = (await enqueue({ ...base, type: "package", input: {}, idempotencyKey: key, dependsOn: last })).id;
        jobs.push(last);
      }
      await audit({ workspaceId: ctx.workspaceId, userId: ctx.userId, actor: "user", action: "assistant.job_approved", target: jobs.at(-1) ?? plan.id, meta: { verb: s.verb, planId: plan.id } });
    }
    const changed = (await run(`UPDATE plan_run SET status = 'approved', approved_by = ?, approved_at = ? WHERE id = ? AND status = 'proposed'`, ctx.userId, now(), plan.id)).changes;
    if (!changed) throw new HttpError(409, "This plan was approved or dismissed a moment ago.");
    return { already: false, jobs };
  });
}
