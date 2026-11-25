"use client";
// The whole product in one move: see the story as a map, say what you want, read the plan, approve it.
import { useEffect, useState } from "react";
import { ArrowUp, Check, Cpu, LockSimple, Sparkle, Warning, X } from "@phosphor-icons/react";
import { api, ApiError } from "@/lib/api";
import { langName } from "@/lib/languages";
import { storyScenes } from "@/lib/story-scenes";
import { ProjectMap } from "./ProjectMap";
import type { EditTarget, PanelTarget, TabId, TabProps } from "./types";

type Step = { verb: string; what: string; tool: string; runs: string; gate?: string; runnable: boolean; why?: string; language?: string; count?: number };
type Plan = { id: string; planner: string; steps: Step[]; note: string | null };
type Revision = { index: number; original: string; text: string };
type Chip = { key: string; text: string; tone: "done" | "draft" | "blocked"; to: TabId };

const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;

export function CanvasTab({ state, refresh, go, tab, onEdit, children }: TabProps & {
  tab: TabId; onEdit: (card: EditTarget) => void; children: React.ReactNode;
}) {
  const [reply, setReply] = useState<string | null>(null);
  const [revision, setRevision] = useState<Revision | null>(null);
  const [lastPrompt, setLastPrompt] = useState<string | null>(null);
  const [context, setContext] = useState<{ label: string; target?: PanelTarget; rights?: boolean } | null>(null);
  const [text, setText] = useState("");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [busy, setBusy] = useState(false);
  const [approving, setApproving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [queued, setQueued] = useState<string | null>(null);
  const [model, setModel] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let live = true;
    api<{ model: string | null }>("/api/plan").then((d) => live && setModel(d.model)).catch(() => live && setModel(null));
    return () => { live = false; };
  }, []);

  const hasTranscript = state.lines.length > 0;
  const ask = async (prompt: string, scope = context) => {
    const p = prompt.trim();
    if (p.length < 3 || busy || approving || plan) return;
    setBusy(true); setErr(null); setQueued(null); setReply(null); setRevision(null);
    setLastPrompt(p);
    setContext(scope);
    try {
      const result = await api<Plan | { answer: string; revision?: Revision }>("/api/plan", {
        body: { projectId: state.project.id, prompt: p, target: scope?.target, rights: scope?.rights },
      });
      if ("answer" in result) {
        setReply(result.answer);
        setRevision(result.revision ?? null);
      }
      else setPlan(result);
    } catch (e) {
      setErr((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  };
  const applyRevision = async () => {
    if (!revision || approving) return;
    const before = state.project.script;
    const scene = storyScenes(before)[revision.index];
    setErr(null);
    if (!scene || scene.text !== revision.original) {
      setErr("That scene has changed. Request a new suggestion from the map.");
      return;
    }
    setApproving(true);
    try {
      const script = before.slice(0, scene.start) + revision.text + before.slice(scene.end);
      await api(`/api/projects/${state.project.id}`, { method: "PATCH", body: { script, previousScript: before } });
      await refresh();
      setReply("Scene revision saved.");
      setRevision(null);
    } catch (e) {
      setErr((e as ApiError).message);
    } finally {
      setApproving(false);
    }
  };
  const decide = async (action: "approve" | "dismiss") => {
    if (!plan) return;
    setApproving(true); setErr(null);
    try {
      const r = await api<{ jobs?: string[]; already?: boolean }>(`/api/plan/${plan.id}`, { body: { action } });
      if (action === "approve") {
        const n = r.jobs?.length ?? 0;
        setQueued(r.already ? "That plan was already approved." : n ? `${plural(n, "job")} queued. Progress shows above, under the stages.` : "Nothing was runnable, so no jobs were queued.");
        setText("");
      }
      setPlan(null);
      await refresh();
    } catch (e) {
      setErr((e as ApiError).message);
    } finally {
      setApproving(false);
    }
  };

  // What's waiting, computed from the project. Each chip jumps to the tab that can clear it.
  const chips: Chip[] = [];
  const live = state.clips.filter((c) => c.status !== "dropped");
  const kept = state.clips.filter((c) => c.status === "kept");
  const waitingPeople = state.people.filter((p) => p.consent?.status !== "granted");
  if (state.source && !hasTranscript && !state.jobs.some((j) => j.type === "transcribe" && (j.status === "queued" || j.status === "running"))) chips.push({ key: "tr", text: "No transcript yet", tone: "draft", to: "create" });
  const suggested = state.clips.filter((c) => c.status === "suggested").length;
  if (suggested) chips.push({ key: "sug", text: `${plural(suggested, "suggested clip")} to review`, tone: "draft", to: "create" });
  if (waitingPeople.length) chips.push({ key: "con", text: `${waitingPeople.length} consent waiting`, tone: "blocked", to: "protect" });
  if (live.length && !state.declaration) chips.push({ key: "decl", text: "Declaration not recorded", tone: "blocked", to: "protect" });
  for (const t of state.tracks.filter((x) => x.kind !== "source" && x.status !== "approved")) chips.push({ key: t.id, text: `${langName(t.language)} captions are a draft`, tone: "draft", to: "localise" });
  const ready = state.outputs.filter((o) => o.status === "ready").length;
  const held = state.outputs.filter((o) => o.status === "blocked").length;
  const failed = state.outputs.filter((o) => o.status === "failed").length;
  if (held) chips.push({ key: "held", text: `${plural(held, "render")} held`, tone: "blocked", to: "protect" });
  if (failed) chips.push({ key: "fail", text: `${plural(failed, "render")} failed`, tone: "blocked", to: "publish" });
  if (ready) chips.push({ key: "ready", text: `${ready} ready to export`, tone: "done", to: "publish" });
  const enquiries = state.listings.reduce((n, l) => n + (l.enquiries as { status: string }[]).filter((q) => q.status === "new").length, 0);
  if (enquiries) chips.push({ key: "enq", text: `${plural(enquiries, "new enquiry", "new enquiries")}`, tone: "done", to: "earn" });

  // Only things the backend can plan: transcribe, clips, captions in a language, render, package.
  const ideas = !hasTranscript ? ["Transcribe it, then find 3 clips", "Package it for my editor"]
    : kept.length ? ["Find 3 more clips", "Caption it in isiZulu", "Caption it in Sesotho", "Render everything I kept", "Package it for my editor"]
    : ["Find 3 clips", "Caption it in isiZulu", "Package it for my editor"];

  // While /api/plan answers, show only what is always true, so the first paint never names a mode it hasn't checked.
  const mode = model === undefined ? null : model ? `Planning with ${model}` : "Rule-based planning";
  const can = plan ? plan.steps.filter((s) => s.runnable).length : 0;
  const total = state.outputs.length;
  const history = state.plans.filter((entry) => entry.id !== plan?.id);
  const onAsk = (prompt: string, target?: PanelTarget, label?: string, rights?: boolean) =>
    void ask(prompt, label ? { target, label, rights } : null);
  return (
    <section className="studio-editor" aria-label="Project editor">
      <div className="editor-workspace">
        {(plan || reply || queued) && <p className="editor-activity" role="status">
          {reply ?? queued ?? `${context?.label ?? "Project"} · ${plan?.steps.map((step) => step.what).join(" · ")}. Review in the prompt panel.`}
        </p>}
        {tab === "canvas" && <div className="canvas-stage">
        <header>
          <h2>{total ? <>{ready} of {plural(total, "output")} ready.</> : <>Nothing rendered yet.</>}</h2>
          <div className="canvas-jump" aria-label="What is waiting">
            {chips.map((c) => <button key={c.key} className={`pill s-${c.tone}`} onClick={() => go(c.to)}>{c.text}</button>)}
            {chips.length === 0 && <span className="fine">Nothing is waiting on you.</span>}
          </div>
        </header>
      </div>}
      {(tab === "canvas" || tab === "protect") && <ProjectMap key={tab} state={state} rights={tab === "protect"} busy={busy || approving || !!plan} onAsk={onAsk} onEdit={onEdit} />}
      {children}
      </div>
      <aside className="editor-prompt" aria-label="Project prompts">
        <h2><Sparkle weight="fill" /> Prompt</h2>
        {context && <p className="prompt-context"><b>{context.label}</b> <button type="button" className="link" onClick={() => setContext(null)} disabled={busy || !!plan}>Clear selection</button></p>}
        {lastPrompt && <p className="editor-message"><b>You</b>{lastPrompt}</p>}
        {(reply || queued) && <p className="editor-message" role="status"><b>IZWI</b>{reply ?? queued}</p>}
        {revision && <div className="st-row">
          <button type="button" className="btn btn-sm" disabled={approving} onClick={() => void applyRevision()}>Apply scene revision</button>
          <button type="button" className="btn btn-quiet btn-sm" disabled={approving} onClick={() => { setRevision(null); setReply("Scene revision dismissed."); }}>Dismiss</button>
        </div>}

      {plan && (
        <div className="plan" role="region" aria-label="Proposed plan" onKeyDown={(e) => { if (e.key === "Escape") void decide("dismiss"); }}>
          <header>
            <h3>Proposed changes</h3>
            <span className="mono">Planned by {plan.planner}</span>
            <button aria-label="Dismiss plan" onClick={() => void decide("dismiss")} disabled={approving}><X /></button>
          </header>
          {plan.note && <p className="plan-note"><Warning weight="fill" /> {plan.note}</p>}
          <ol>
            {plan.steps.map((s, i) => (
              <li key={i} className={s.runnable ? "" : "no"} style={{ ["--i" as string]: i }}>
                <b>{s.verb}</b>
                <div>
                  <p>{s.what}</p>
                  {s.gate && <small><LockSimple weight="fill" /> {s.gate}</small>}
                  {!s.runnable && s.why && <small className="why"><Warning weight="fill" /> {s.why}</small>}
                </div>
                <span className="mono">{s.tool}</span>
                <span className={"runs" + (s.runnable ? "" : " no")}><Cpu /> {s.runnable ? s.runs : "Can't run yet"}</span>
              </li>
            ))}
          </ol>
          <footer>
            <p>{can === plan.steps.length ? "Every step can run now." : `${can} of ${plan.steps.length} steps can run now.`} Nothing runs until you approve.</p>
            <button className="btn btn-quiet" onClick={() => void decide("dismiss")} disabled={approving}>Dismiss</button>
            <button className="btn" onClick={() => void decide("approve")} disabled={approving || can === 0}><Check weight="bold" /> {approving ? "Queuing…" : can === 0 ? "Nothing to run" : "Approve plan"}</button>
          </footer>
        </div>
      )}

      <form className={"promptbar" + (busy ? " busy" : "")} onSubmit={(e) => { e.preventDefault(); void ask(text); }}>
        {!plan && !context && (
          <div className="ideas">
            {ideas.map((i) => <button type="button" key={i} onClick={() => { setText(i); void ask(i, null); }}>{i}</button>)}
          </div>
        )}
        {err && <p className="miss" role="alert">{err}</p>}
        <p className="plan-mode" id="plan-mode">{mode ? `${mode} · ` : ""}You review before anything runs</p>
        <div className="promptrow">
          <Sparkle weight="fill" />
          <input value={text} onChange={(e) => setText(e.target.value)} maxLength={600} placeholder="What should IZWI do?" aria-label="What should IZWI do?" aria-describedby="plan-mode" />
          <button className="send" aria-label="Plan it" disabled={text.trim().length < 3 || busy || approving || !!plan}><ArrowUp weight="bold" /></button>
        </div>
      </form>
      {history.length > 0 && <details className="editor-history">
        <summary>Recent project prompts</summary>
        <ul>{history.map((entry) => <li key={entry.id}><b>{entry.prompt}</b><small>{entry.status} · {entry.planner}</small>
          {entry.status === "proposed" && Array.isArray(entry.steps) && <button type="button" className="link" disabled={busy || !!plan}
            onClick={() => { setContext(null); setLastPrompt(entry.prompt); setReply(null); setRevision(null); setQueued(null); setPlan({ ...entry, steps: entry.steps as Step[], note: null }); }}>Review proposal</button>}
        </li>)}</ul>
      </details>}
      </aside>
    </section>
  );
}
