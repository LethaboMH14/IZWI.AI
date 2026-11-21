// Prompt → plan → approve → jobs. A model (when connected) only proposes intents; code decides the tool,
// where it runs, what gates apply and whether it can run now. Nothing runs until a person approves.
import { z } from "zod";
import { all, newId, now, one, run } from "./db";
import { enqueue } from "./jobs";
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
        return { ...i, what: s.kept ? `Render ${s.kept} kept clip${s.kept === 1 ? "" : "s"} as 9:16 with burned-in captions` : "Render kept clips", tool: "FFmpeg", runs: "This device", gate: "Held until your declaration and everyone's consent are recorded", runnable: s.kept > 0, why: s.kept ? undefined : "Keep at least one clip first." };
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

export function approvePlan(ctx: Ctx, planId: string) {
  const plan = one<{ id: string; project_id: string; steps: string; status: string }>(`SELECT * FROM plan_run WHERE id = ? AND workspace_id = ?`, planId, ctx.workspaceId);
  if (!plan) return null;
  if (plan.status !== "proposed") return { already: true, jobs: [] as string[] };
  const steps = JSON.parse(plan.steps) as Step[];
  const jobs: string[] = [];
  let hear: string | null = null;
  let last: string | null = null;
  const base = { workspaceId: ctx.workspaceId, projectId: plan.project_id, createdBy: ctx.userId };
  steps.forEach((s, i) => {
    if (!s.runnable) return;
    const key = `plan:${plan.id}:${i}`;
    if (s.verb === "Hear") {
      const src = one<{ id: string }>(`SELECT id FROM asset WHERE project_id = ? AND kind = 'source' ORDER BY created_at DESC LIMIT 1`, plan.project_id)!;
      hear = enqueue({ ...base, type: "transcribe", input: { assetId: src.id }, idempotencyKey: key }).id;
      last = hear;
      jobs.push(hear);
    } else if (s.verb === "Cut") {
      last = enqueue({ ...base, type: "suggest_clips", input: { count: s.count ?? 3 }, idempotencyKey: key, dependsOn: hear }).id;
      jobs.push(last);
    } else if (s.verb === "Translate") {
      last = enqueue({ ...base, type: "translate", input: { language: s.language }, idempotencyKey: key, dependsOn: hear }).id;
      jobs.push(last);
    } else if (s.verb === "Publish") {
      const src = one<{ language: string }>(`SELECT language FROM caption_track WHERE project_id = ? AND kind = 'source'`, plan.project_id);
      for (const c of all<{ id: string }>(`SELECT id FROM clip WHERE project_id = ? AND status = 'kept'`, plan.project_id)) {
        const outId = newId("out");
        run(`INSERT INTO output (id, workspace_id, project_id, clip_id, preset, language, burn, status, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, 'vertical', ?, 1, 'queued', ?, ?, ?)`, outId, ctx.workspaceId, plan.project_id, c.id, src?.language ?? null, ctx.userId, now(), now());
        const j = enqueue({ ...base, type: "render", input: { outputId: outId }, idempotencyKey: `${key}:${c.id}`, dependsOn: hear });
        run(`UPDATE output SET job_id = ? WHERE id = ?`, j.id, outId);
        last = j.id;
        jobs.push(j.id);
      }
    } else if (s.verb === "Record") {
      last = enqueue({ ...base, type: "package", input: {}, idempotencyKey: key, dependsOn: last }).id;
      jobs.push(last);
    }
  });
  run(`UPDATE plan_run SET status = 'approved', approved_by = ?, approved_at = ? WHERE id = ?`, ctx.userId, now(), plan.id);
  return { already: false, jobs };
}
