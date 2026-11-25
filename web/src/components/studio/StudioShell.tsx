"use client";
// The studio frame: title and source facts, the five stages with a status computed from real data,
// the live job list, and the six tabs. Everything here reads ProjectState; nothing is invented.
import Link from "next/link";
import { useCallback, useState, useSyncExternalStore } from "react";
import { ArrowClockwise, CaretDown, CircleNotch, UploadSimple, Warning, X } from "@phosphor-icons/react";
import { api, ApiError } from "@/lib/api";
import { bytes, clock, JOB_LABEL } from "@/lib/format";
import { langName } from "@/lib/languages";
import { useLive } from "@/lib/useLive";
import type { ProjectState, TabId, TabProps } from "./types";
import { CanvasTab } from "./CanvasTab";
import { CreateTab } from "./CreateTab";
import { LocaliseTab } from "./LocaliseTab";
import { ProtectTab } from "./ProtectTab";
import { PublishTab } from "./PublishTab";
import { EarnTab } from "./EarnTab";
import { AssistantPanel } from "./AssistantPanel";
import "@/app/studio.css";

type Job = ProjectState["jobs"][number];
type Status = "done" | "draft" | "blocked" | "off" | "planned";

const TABS: TabId[] = ["canvas", "create", "localise", "protect", "publish", "earn"];
const STAGES: { id: Exclude<TabId, "canvas">; label: string }[] = [
  { id: "create", label: "Create" }, { id: "localise", label: "Localise" }, { id: "protect", label: "Protect" }, { id: "publish", label: "Publish" }, { id: "earn", label: "Earn" },
];
const KINDS = ["podcast", "video", "lesson", "music", "film", "animation", "client"];
const BODY: Record<TabId, (p: TabProps) => React.ReactNode> = {
  canvas: (p) => <CanvasTab {...p} />, create: (p) => <CreateTab {...p} />, localise: (p) => <LocaliseTab {...p} />,
  protect: (p) => <ProtectTab {...p} />, publish: (p) => <PublishTab {...p} />, earn: (p) => <EarnTab {...p} />,
};

const subscribe = (cb: () => void) => { window.addEventListener("hashchange", cb); return () => window.removeEventListener("hashchange", cb); };
const hashNow = () => window.location.hash.slice(1);
const hashServer = () => "";

const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;
const active = (j: Job) => j.status === "queued" || j.status === "running";

// A failed job stops nagging once a newer job of the same kind has worked or is working.
function visibleJobs(jobs: Job[]) {
  return jobs.filter((j) => {
    if (j.status === "queued" || j.status === "running" || j.status === "blocked") return true;
    if (j.status !== "failed") return false;
    return !jobs.some((o) => o.type === j.type && o.createdAt > j.createdAt && (o.status === "succeeded" || active(o)));
  });
}

function stageStatus(s: ProjectState): Record<Exclude<TabId, "canvas">, { status: Status; hint: string }> {
  const kept = s.clips.filter((c) => c.status === "kept").length;
  const live = s.clips.filter((c) => c.status !== "dropped");
  const translations = s.tracks.filter((t) => t.kind !== "source");
  const unapproved = translations.filter((t) => t.status !== "approved");
  const held = live.filter((c) => !c.gate.ok);
  const ready = s.outputs.filter((o) => o.status === "ready").length;
  const working = s.outputs.filter((o) => o.status === "queued").length;
  const blocked = s.outputs.filter((o) => o.status === "blocked").length;
  const failed = s.outputs.filter((o) => o.status === "failed").length;
  const listed = s.listings.filter((l) => l.enabled).length;
  const transcribing = s.jobs.some((j) => j.type === "transcribe" && active(j));

  const create: { status: Status; hint: string } = !s.source ? { status: "off", hint: "Upload a recording first" }
    : transcribing ? { status: "draft", hint: "Listening to the recording" }
    : s.lines.length === 0 ? { status: "draft", hint: "No transcript yet" }
    : kept > 0 ? { status: "done", hint: `Transcript ready, ${plural(kept, "clip")} kept` }
    : { status: "draft", hint: "Transcript ready, keep a clip" };

  const localise = translations.length === 0 ? { status: "off" as Status, hint: "No translations yet" }
    : unapproved.length > 0 ? { status: "draft" as Status, hint: `${unapproved.map((t) => langName(t.language)).slice(0, 2).join(", ")}${unapproved.length > 2 ? "…" : ""}: draft` }
    : { status: "done" as Status, hint: `${plural(translations.length, "language")} approved` };

  const protect = live.length === 0 ? { status: "off" as Status, hint: "No clips to protect yet" }
    : held.length > 0 ? { status: "blocked" as Status, hint: !held[0].gate.declaration && held.every((c) => c.gate.waiting.length === 0) ? "Declaration needed" : `${plural(held.length, "clip")} waiting on consent` }
    : { status: "done" as Status, hint: "All consent recorded" };

  const publish = ready > 0 ? { status: "done" as Status, hint: `${ready} ready${blocked ? `, ${blocked} held` : ""}` }
    : working > 0 ? { status: "draft" as Status, hint: `${plural(working, "render")} in progress` }
    : blocked > 0 ? { status: "blocked" as Status, hint: `${plural(blocked, "render")} held` }
    : failed > 0 ? { status: "blocked" as Status, hint: `${plural(failed, "render")} failed` }
    : { status: "off" as Status, hint: "Nothing rendered yet" };

  const earn = listed > 0 ? { status: "done" as Status, hint: `${plural(listed, "listing")} live` }
    : s.listings.length > 0 ? { status: "draft" as Status, hint: "Listing switched off" }
    : { status: "off" as Status, hint: "No licence listing yet" };

  return { create, localise, protect, publish, earn };
}

export function StudioShell({ id, initial }: { id: string; initial: ProjectState }) {
  const { data, error, refresh } = useLive<ProjectState>(`/api/projects/${id}`, { initial, busy: (s) => s.jobs.some(active) || s.people.some((p) => p.consent?.status === "pending" || p.consent?.status === "requested") });
  const state = data ?? initial;
  const hash = useSyncExternalStore(subscribe, hashNow, hashServer);
  const tab: TabId = (TABS as string[]).includes(hash) ? (hash as TabId) : "canvas";
  const go = useCallback((t: TabId) => {
    window.location.hash = t;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);
  const refreshed = useCallback(async () => { await refresh(); }, [refresh]);

  const [title, setTitle] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [jobErr, setJobErr] = useState<string | null>(null);
  const [open, setOpen] = useState(true);

  const patch = async (body: { title?: string; kind?: string }) => {
    setSaveErr(null);
    try {
      await api(`/api/projects/${id}`, { method: "PATCH", body });
      await refresh();
    } catch (e) { setSaveErr((e as ApiError).message); }
  };
  const saveTitle = async () => {
    const next = (title ?? state.project.title).trim();
    setTitle(null);
    if (!next || next === state.project.title) return;
    await patch({ title: next });
  };
  const jobAct = async (job: Job, action: "cancel" | "retry") => {
    setJobErr(null);
    try {
      await api(`/api/items/job/${job.id}`, { method: "PATCH", body: { action } });
      await refresh();
    } catch (e) { setJobErr((e as ApiError).message); }
  };

  const stages = stageStatus(state);
  const jobs = visibleJobs(state.jobs);
  const running = jobs.filter(active).length;
  const src = state.source;
  const prep = !state.proxy ? state.jobs.find((j) => (j.type === "probe" || j.type === "proxy") && active(j)) : undefined;
  const props: TabProps = { state, refresh: refreshed, go };

  return (
    <div className="studio">
      <header className="studio-head">
        <div className="studio-id">
        <div className="studio-meta">
          <p className="crumb"><Link href="/app">Stories</Link> <span aria-hidden>/</span>
            <select className="kindpick" aria-label="Kind of story" value={state.project.kind} onChange={(e) => void patch({ kind: e.target.value })}>
              {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </p>
          {src ? (
            <p className="studio-facts mono">
              <span>{src.filename}</span>
              <span>{clock(src.durationMs)}</span>
              {src.width && src.height ? <span>{src.width} × {src.height}</span> : <span>audio only</span>}
              <span>{bytes(src.bytes)}</span>
            </p>
          ) : <p className="studio-facts mono"><span>No recording yet</span></p>}
        </div>
          <input className="studio-title" value={title ?? state.project.title} maxLength={120} aria-label="Story title"
            onChange={(e) => setTitle(e.target.value)} onBlur={() => void saveTitle()}
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { setTitle(null); e.currentTarget.blur(); } }} />
        </div>
        <AssistantPanel projectId={id} tab={tab} refresh={refreshed} />
        <span className={"studio-live" + (running ? " on" : "")} role="status">{running ? <><CircleNotch className="spin" /> {plural(running, "job")} running</> : "Up to date"}</span>
      </header>
      {saveErr && <p className="studio-note bad" role="alert"><Warning weight="fill" /> {saveErr}</p>}
      {error && <p className="studio-note bad" role="alert"><Warning weight="fill" /> Could not refresh just now: {error.message}</p>}

      <nav className="stagenav" aria-label="Stages">
        <button className={"sn-map" + (tab === "canvas" ? " on" : "")} onClick={() => go("canvas")} aria-current={tab === "canvas" ? "page" : undefined}>Canvas</button>
        <ol>
          {STAGES.map((s) => {
            const st = stages[s.id];
            return (
              <li key={s.id} className={`s-${st.status}` + (tab === s.id ? " on" : "")}>
                <button onClick={() => go(s.id)} aria-current={tab === s.id ? "page" : undefined}>
                  <i /><b>{s.label}</b><span>{st.hint}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      {jobs.length > 0 && (
        <section className="jobs" aria-label="Work in progress">
          <button className="jobs-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            <b>{running ? `${plural(running, "job")} running` : "Needs a look"}</b>
            <span>{jobs.filter((j) => j.status === "failed").length ? `${jobs.filter((j) => j.status === "failed").length} failed` : ""}{jobs.filter((j) => j.status === "blocked").length ? ` ${jobs.filter((j) => j.status === "blocked").length} held` : ""}</span>
            <CaretDown className={open ? "up" : ""} />
          </button>
          {open && (
            <ul>
              {jobs.map((j) => (
                <li key={j.id} className={"job j-" + j.status}>
                  <div className="job-main">
                    <b>{JOB_LABEL[j.type] ?? j.type}{j.type === "translate" && typeof j.input.language === "string" ? `: ${langName(j.input.language)}` : ""}</b>
                    <span>
                      {j.status === "running" ? (j.stage ?? "Working") : j.status === "queued" ? (j.error ? `Trying again soon. ${j.error}` : "Waiting its turn") : j.status === "blocked" ? `Held. ${j.error ?? ""}` : `Failed. ${j.error ?? "No reason was recorded."}`}
                    </span>
                    {(j.status === "running" || j.status === "queued") && <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(j.progress * 100)} aria-label={JOB_LABEL[j.type] ?? j.type}><i style={{ width: `${Math.max(3, Math.round(j.progress * 100))}%` }} /></div>}
                  </div>
                  <div className="job-act">
                    {(j.status === "failed" || j.status === "blocked") && <button className="btn btn-quiet" onClick={() => void jobAct(j, "retry")}><ArrowClockwise /> {j.status === "blocked" ? "Check again" : "Retry"}</button>}
                    {(j.status === "queued" || j.status === "running" || j.status === "blocked") && <button className="btn btn-quiet" onClick={() => void jobAct(j, "cancel")}><X /> Cancel</button>}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {jobErr && <p className="cr-err" role="alert">{jobErr}</p>}
        </section>
      )}

      {prep && <p className="studio-note"><CircleNotch className="spin" /> Getting the recording ready: {prep.stage ?? JOB_LABEL[prep.type]}. The player and waveform appear when this finishes.</p>}

      <div className="stagebody" key={tab}>
        {src ? BODY[tab](props) : (
          <div className="studio-empty">
            <UploadSimple />
            <h2>Upload a recording to begin.</h2>
            <p>This story has no recording yet. Once a file is uploaded IZWI reads it, makes a light preview and draws the waveform. Then you can listen, cut clips and caption them.</p>
            <Link className="btn btn-lg" href="/app">Go to Stories to upload</Link>
          </div>
        )}
      </div>
    </div>
  );
}
