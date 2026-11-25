// Prompt → plan → approve → jobs. A model (when connected) only proposes intents; code decides the tool,
// where it runs, what gates apply and whether it can run now. Nothing runs until a person approves.
import { z } from "zod";
import { newId, now, one, run, tx } from "./db";
import { enqueue } from "./jobs";
import { HttpError } from "./http";
import { chatJSON, providerFor } from "./providers";
import { LANGUAGES, langName } from "../lib/languages";
import type { Ctx } from "./guard";

export type Verb = "Hear" | "Cut" | "Translate" | "Dub" | "Storyboard" | "Animate" | "Publish" | "Record";
export type Intent = { verb: Verb; language?: string; count?: number };
export type Step = Intent & { what: string; tool: string; runs: string; gate?: string; runnable: boolean; why?: string };

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
  const p = providerFor(workspaceId, "plan");
  if (!p) return null;
  const codes = LANGUAGES.map((l) => `${l.code}=${l.name}`).join(", ");
  const r = await chatJSON(p,
    `You turn a creator's request into steps for a media workspace. Allowed verbs: Hear (transcribe), Cut (suggest clips; optional count), Translate (captions into one language; language code), Dub (voice in a language), Storyboard, Animate, Publish (render kept clips), Record (export package for editors). Language codes: ${codes}. Return JSON only: {"steps":[{"verb":"...","language":"zu","count":3}]}`,
    prompt.slice(0, 600), ModelPlan, { maxTokens: 400, timeoutMs: 60_000 });
  return { intents: r.data.steps.filter((s) => !s.language || LANGUAGES.some((l) => l.code === s.language)) as Intent[], planner: `${p.label} · ${p.model}` };
}

type State = { hasSource: boolean; hasTranscript: boolean; sourceLanguage: string | null; kept: number; translator: string | null };

export function projectPlanState(workspaceId: string, projectId: string): State {
  const src = one(`SELECT id FROM asset WHERE project_id = ? AND kind = 'source'`, projectId);
  const track = one<{ language: string }>(`SELECT language FROM caption_track WHERE project_id = ? AND kind = 'source'`, projectId);
  const kept = one<{ n: number }>(`SELECT COUNT(*) n FROM clip WHERE project_id = ? AND status = 'kept'`, projectId)!.n;
  const t = providerFor(workspaceId, "translate");
  return { hasSource: !!src, hasTranscript: !!track, sourceLanguage: track?.language ?? null, kept, translator: t ? t.label : null };
}

export function describe(intents: Intent[], s: State): Step[] {
  const hearing = intents.some((i) => i.verb === "Hear") || s.hasTranscript;
  const cutting = intents.some((i) => i.verb === "Cut") && s.hasSource && hearing;
  const seen = new Set<string>();
  return intents.filter((i) => {
    const k = `${i.verb}:${i.language ?? ""}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).map((i): Step => {
    switch (i.verb) {
      case "Hear":
        return { ...i, what: s.hasTranscript ? "Listen again with the current glossary (replaces the transcript and its translations)" : "Transcribe the recording with word timing", tool: "whisper.cpp base", runs: "This device", runnable: s.hasSource, why: s.hasSource ? undefined : "Upload a recording first." };
      case "Cut":
        return { ...i, what: `Suggest ${i.count ?? 3} clips and say why each was chosen`, tool: "IZWI clip finder", runs: "This device", runnable: s.hasSource && hearing, why: hearing ? undefined : "Needs a transcript first. Add Hear to the request." };
      case "Translate": {
        const name = langName(i.language ?? "");
        if (s.sourceLanguage === i.language) return { ...i, what: `Captions are already in ${name}`, tool: "None", runs: "-", runnable: false, why: "Nothing to translate." };
        return { ...i, what: `Draft ${name} captions from the transcript`, tool: s.translator ?? "No translator connected", runs: "Your key", gate: `Stays a draft until a speaker of ${name} approves every line`, runnable: !!s.translator && hearing, why: !s.translator ? "Connect a translation provider in Run on first." : hearing ? undefined : "Needs a transcript first." };
      }
      case "Dub":
        return { ...i, what: `${langName(i.language ?? "en")} voice track`, tool: "Chatterbox (planned)", runs: "GPU service", gate: "Needs the speaker's recorded consent to use their voice", runnable: false, why: "Planned: no GPU voice service is connected." };
      case "Storyboard":
        return { ...i, what: "Break the script into timed scenes", tool: "AI story tab", runs: "This device", runnable: false, why: "Open Create > AI story; it works there now." };
      case "Animate":
        return { ...i, what: "Generate moving frames per scene", tool: "Wan 2.1 / LTX-Video (planned)", runs: "GPU service", runnable: false, why: "Planned: no GPU video service is connected." };
      case "Publish":
        return {
          ...i,
          what: cutting
            ? `Render the clips this plan suggests${s.kept ? ` and your ${s.kept} kept clip${s.kept === 1 ? "" : "s"}` : ""} as 9:16 with burned-in captions`
            : s.kept ? `Render ${s.kept} kept clip${s.kept === 1 ? "" : "s"} as 9:16 with burned-in captions` : "Render kept clips",
          tool: "FFmpeg", runs: "This device", gate: "Held until your declaration and everyone's consent are recorded",
          runnable: cutting || s.kept > 0, why: cutting || s.kept ? undefined : "Keep at least one clip first, or add clips to the request.",
        };
      case "Record":
        return { ...i, what: "Build the hand-off package: captions, EDL and OTIO timelines, renders, record sheet", tool: "IZWI package", runs: "This device", runnable: s.hasSource };
    }
  });
}

export function savePlan(ctx: Ctx, projectId: string, prompt: string, planner: string, steps: Step[]) {
  const id = newId("pln");
  run(`INSERT INTO plan_run (id, workspace_id, project_id, prompt, planner, steps, status, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, 'proposed', ?, ?)`, id, ctx.workspaceId, projectId, prompt, planner, JSON.stringify(steps), ctx.userId, now());
  return id;
}

// Jobs must be enqueued in dependency order, whatever order a model listed the steps in.
const ORDER: Verb[] = ["Hear", "Cut", "Translate", "Dub", "Storyboard", "Animate", "Publish", "Record"];

// One transaction: either every job of the plan is queued and the plan is marked approved, or nothing is.
// Publish does not read clips now. It queues a fan-out step that runs after Cut and renders the clips that exist then.
export function approvePlan(ctx: Ctx, planId: string) {
  return tx(() => {
    const plan = one<{ id: string; project_id: string; steps: string; status: string }>(`SELECT * FROM plan_run WHERE id = ? AND workspace_id = ?`, planId, ctx.workspaceId);
    if (!plan) return null;
    if (plan.status !== "proposed") return { already: true, jobs: [] as string[] };
    const steps = (JSON.parse(plan.steps) as Step[]).map((s, i) => ({ s, i })).sort((a, b) => ORDER.indexOf(a.s.verb) - ORDER.indexOf(b.s.verb));
    const jobs: string[] = [];
    let hear: string | null = null;
    let cut: string | null = null;
    let last: string | null = null;
    const base = { workspaceId: ctx.workspaceId, projectId: plan.project_id, createdBy: ctx.userId };
    for (const { s, i } of steps) {
      if (!s.runnable) continue;
      const key = `plan:${plan.id}:${i}`;
      if (s.verb === "Hear") {
        const src = one<{ id: string }>(`SELECT id FROM asset WHERE project_id = ? AND workspace_id = ? AND kind = 'source' ORDER BY created_at DESC LIMIT 1`, plan.project_id, ctx.workspaceId);
        if (!src) throw new HttpError(409, "Upload a recording first, then approve the plan again.");
        hear = last = enqueue({ ...base, type: "transcribe", input: { assetId: src.id }, idempotencyKey: key }).id;
        jobs.push(hear);
      } else if (s.verb === "Cut") {
        cut = last = enqueue({ ...base, type: "suggest_clips", input: { count: s.count ?? 3 }, idempotencyKey: key, dependsOn: hear }).id;
        jobs.push(cut);
      } else if (s.verb === "Translate") {
        last = enqueue({ ...base, type: "translate", input: { language: s.language }, idempotencyKey: key, dependsOn: hear }).id;
        jobs.push(last);
      } else if (s.verb === "Publish") {
        last = enqueue({ ...base, type: "publish", input: { cutJobId: cut }, idempotencyKey: key, dependsOn: cut ?? hear }).id;
        jobs.push(last);
      } else if (s.verb === "Record") {
        last = enqueue({ ...base, type: "package", input: {}, idempotencyKey: key, dependsOn: last }).id;
        jobs.push(last);
      }
    }
    const changed = run(`UPDATE plan_run SET status = 'approved', approved_by = ?, approved_at = ? WHERE id = ? AND status = 'proposed'`, ctx.userId, now(), plan.id).changes;
    if (!changed) throw new HttpError(409, "This plan was approved or dismissed a moment ago.");
    return { already: false, jobs };
  });
}
