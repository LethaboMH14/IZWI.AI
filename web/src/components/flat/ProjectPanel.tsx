"use client";
// The charcoal project panel: what the project holds, from ProjectState only. Nothing here is a quota or a total
// the data does not have.
import type { ReactNode } from "react";
import { Waveform, X } from "@phosphor-icons/react";
import { IconButton, StatusPill, Timecode, Tooltip, type Status } from "@/components/z";
import { bytes } from "@/lib/format";
import { langName } from "@/lib/languages";
import { useProject } from "@/components/workspace/ProjectProvider";
import { percentOf } from "./jobs";
import { SceneList } from "./SceneList";
import { useScenes } from "./hooks";

const PRESET: Record<string, string> = { vertical: "Vertical 9:16", square: "Square 1:1", wide: "Wide 16:9" };
const TRACK_STATUS: Record<string, string> = { draft: "draft", in_review: "in review", approved: "approved", revision_requested: "changes requested" };

function Section({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <section className="fs-sec">
      <h2 className="fs-sec-h"><span>{title}</span>{count != null && <span className="fs-mono">{count}</span>}</h2>
      {children}
    </section>
  );
}

function Outputs() {
  const outputs = useProject((s) => s.state.outputs);
  const jobs = useProject((s) => s.state.jobs);
  return (
    <Section title="Outputs" count={outputs.length}>
      {outputs.length === 0 ? <p className="fs-none">No outputs yet</p> : (
        <ul className="fs-rows">
          {outputs.map((o) => {
            const job = o.jobId ? jobs.find((j) => j.id === o.jobId) : undefined;
            const running = o.status === "running" || (o.status === "queued" && job?.status === "running");
            const status: Status = o.status === "ready" ? "ready" : o.status === "failed" ? "failed" : o.status === "blocked" ? "held" : running ? "running" : "queued";
            const pill = <span className="fs-pillwrap" tabIndex={o.note ? 0 : undefined}><StatusPill status={status} percent={percentOf(job) ?? undefined} /></span>;
            return (
              <li key={o.id} className="fs-row">
                <span className="fs-row-text">{PRESET[o.preset] ?? o.preset} · {o.language ? langName(o.language) : "Source language"}</span>
                {o.note && status !== "ready" ? <Tooltip content={o.note}>{pill}</Tooltip> : pill}
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

function Languages() {
  const tracks = useProject((s) => s.state.tracks);
  return (
    <Section title="Languages" count={tracks.length}>
      {tracks.length === 0 ? <p className="fs-none">No languages yet</p> : (
        <ul className="fs-rows">
          {tracks.map((t) => {
            const source = t.kind === "source";
            return (
              <li key={t.id} className="fs-row">
                <span className="fs-row-text">{langName(t.language)} · {source ? "source" : (TRACK_STATUS[t.status] ?? t.status)}</span>
                <span className={`fs-mono fs-row-meta${!source && t.approved < t.lines ? " is-open" : ""}`}>{source ? `${t.lines} lines` : `${t.approved}/${t.lines}`}</span>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

const CONSENT: string[] = ["requested", "granted", "declined", "revoked"];

function People() {
  const people = useProject((s) => s.state.people);
  return (
    <Section title="People" count={people.length}>
      {people.length === 0 ? <p className="fs-none">No people yet</p> : (
        <ul className="fs-rows">
          {people.map((p) => {
            const c = p.consent;
            const known = !!c && CONSENT.includes(c.status);
            return (
              <li key={p.id} className="fs-row">
                <span className="fs-row-text">
                  {p.name} · {p.role}
                  {c && <span className="fs-row-sub">{c.scope}</span>}
                </span>
                {c ? <StatusPill status={known ? (c.status as Status) : "unknown"} label={known ? undefined : c.status} /> : <StatusPill status="unknown" label="Not asked" />}
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

export function ProjectPanel({ onClose }: { onClose?: () => void }) {
  const source = useProject((s) => s.state.source);
  const posterId = useProject((s) => s.state.poster?.id);
  const storageBytes = useProject((s) => s.state.storage?.bytes ?? 0); // all of this project's assets (ui-contracts D)
  const scenes = useScenes();
  const facts = source
    ? ["Source", source.width && source.height ? `${source.width}×${source.height}` : null, source.bytes ? bytes(source.bytes) : null].filter(Boolean).join(" · ")
    : null;

  return (
    <div className="fs-project-in">
      <div className="fs-project-head">
        <h2 className="fs-project-title">Project</h2>
        {source?.durationMs ? <span className="fs-mono fs-muted"><Timecode ms={source.durationMs} /></span> : null}
        {onClose && <IconButton tone="shell" size="sm" label="Close project panel" icon={<X size={16} />} onClick={onClose} />}
      </div>
      {source ? (
        <div className="fs-source">
          {/* eslint-disable-next-line @next/next/no-img-element -- same-origin project media URL */}
          <span className="fs-thumb fs-thumb-lg" aria-hidden="true">{posterId ? <img src={`/api/media/${posterId}`} alt="" /> : <Waveform size={18} />}</span>
          <span className="fs-source-text">
            <span className="fs-source-name" title={source.filename}>{source.filename}</span>
            <span className="fs-source-facts">{facts}</span>
          </span>
        </div>
      ) : <p className="fs-none">No recording yet</p>}
      <Section title="Scenes" count={scenes.length}>
        {scenes.length === 0 ? <p className="fs-none">No scenes yet</p> : <SceneList />}
      </Section>
      <Outputs />
      <Languages />
      <People />
      {storageBytes > 0 && <p className="fs-project-foot" title="All files in this project: source, preview, renders, captions, packages">Project files <span className="fs-mono">{bytes(storageBytes)}</span></p>}
    </div>
  );
}
