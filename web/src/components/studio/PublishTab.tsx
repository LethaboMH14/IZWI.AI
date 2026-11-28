"use client";
// Publish: renders for each platform shape, a hand-off package for editors, and honest posting records.
import { useState } from "react";
import { langName } from "@/lib/languages";
import { bytes, clock, media, ago } from "@/lib/format";
import type { TabProps } from "./types";
import { Err, Pill, dateOf, useAct } from "./parts";

const PRESETS = [
  { id: "vertical", label: "9:16 vertical", use: "Reels, Shorts, TikTok" },
  { id: "square", label: "1:1 square", use: "Feed posts" },
  { id: "wide", label: "16:9 wide", use: "YouTube, web" },
  { id: "small", label: "Small file", use: "WhatsApp Status and low data" },
] as const;
const PLATFORMS = ["YouTube", "TikTok", "Instagram", "Facebook", "WhatsApp", "Other"];
const presetLabel = (id: string) => PRESETS.find((p) => p.id === id)?.label ?? id;

type Clip = TabProps["state"]["clips"][number];
type Output = TabProps["state"]["outputs"][number];

function RenderCard({ clip, state, refresh, go }: { clip: Clip } & TabProps) {
  const { act, busy, error } = useAct(refresh);
  const [preset, setPreset] = useState<string>("vertical");
  const [language, setLanguage] = useState("");
  const [burn, setBurn] = useState(true);
  const [heldId, setHeldId] = useState<string | null>(null);
  // Read from the project, so the notice follows the render: a new reason replaces it and a release removes it.
  const held = state.outputs.find((o) => o.id === heldId && o.status === "blocked");
  const render = async () => {
    setHeldId(null);
    const r = await act<{ id: string; blocked: boolean }>("render", "POST", `/api/projects/${state.project.id}/outputs`, { clipId: clip.id, preset, language: language || null, burn });
    if (r?.blocked) setHeldId(r.id);
  };
  const track = state.tracks.find((t) => t.language === language);
  return (
    <li className="st-item">
      <div className="st-head"><b>{clip.title}</b><span className="mono st-meta">{clock(clip.startMs)}-{clock(clip.endMs)}</span></div>
      <div className="st-presets" role="group" aria-label="Format">
        {PRESETS.map((p) => (
          <button key={p.id} type="button" className={preset === p.id ? "on" : ""} aria-pressed={preset === p.id} onClick={() => setPreset(p.id)}>
            <b>{p.label}</b><small>{p.use}</small>
          </button>
        ))}
      </div>
      <div className="st-row">
        <label className="st-meta" htmlFor={`cl-${clip.id}`}>Captions</label>
        <select id={`cl-${clip.id}`} value={language} onChange={(e) => setLanguage(e.target.value)}>
          <option value="">No captions</option>
          {state.tracks.map((t) => <option key={t.id} value={t.language}>{langName(t.language)}{t.status === "approved" ? "" : " (not approved yet)"}</option>)}
        </select>
        {language && <label className="st-check"><input type="checkbox" checked={burn} onChange={(e) => setBurn(e.target.checked)} /> Burn captions into the video</label>}
      </div>
      {track && track.kind === "translation" && track.status !== "approved" && <p className="fine">A translation must be approved line by line before it renders. This render will wait for you in Localise.</p>}
      <p className="st-summary" aria-live="polite"><b>New render:</b> {presetLabel(preset)} · {language ? `${langName(language)} caption track` : "No captions"} · Burn-in {language && burn ? "on" : "off"}</p>
      <div className="st-row"><button type="button" className="btn" disabled={busy === "render"} onClick={render}>Render</button></div>
      <Err error={error} />
      {held && (
        <div className="st-row" role="alert">
          <p className="st-err">Held: {held.note ?? "This render is held."}</p>
          <button type="button" className="btn btn-sm btn-gold" onClick={() => go("protect")}>Go to Protect</button>
        </div>
      )}
    </li>
  );
}

function OutputRow({ o, state, refresh }: { o: Output } & Pick<TabProps, "state" | "refresh">) {
  const { act, busy, error } = useAct(refresh);
  const [platform, setPlatform] = useState(PLATFORMS[0]);
  const [url, setUrl] = useState("");
  const [open, setOpen] = useState(false);
  const clip = state.clips.find((c) => c.id === o.clipId);
  const job = o.jobId ? state.jobs.find((j) => j.id === o.jobId) : undefined;
  const running = job && (job.status === "running" || job.status === "queued");
  const mark = async () => {
    const body: { platform: string; url?: string } = { platform };
    if (url.trim()) body.url = url.trim();
    const r = await act("post", "PATCH", `/api/items/output/${o.id}`, body);
    if (r) setOpen(false);
  };
  return (
    <li className="st-item" style={{ ["--sc" as string]: o.status === "ready" ? "var(--moss)" : o.status === "queued" ? "var(--gold)" : "var(--clay)" }}>
      <div className="st-head">
        <b>{clip?.title ?? "Clip"}</b>
        <Pill status={o.status} />
      </div>
      <p>{presetLabel(o.preset)}{o.language ? `, ${langName(o.language)} captions${o.burn ? " burned in" : ""}` : ", no captions"}. Started {ago(o.createdAt)}.</p>
      {o.note && <p className="st-err">{o.note}</p>}
      {job && job.status === "failed" && job.error && <p className="st-err">{job.error}</p>}
      {running && job && (
        <div className="st-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(job.progress * 100)} aria-label="Render progress"><i style={{ width: `${Math.max(3, Math.round(job.progress * 100))}%` }} /></div>
      )}
      {o.status === "ready" && o.asset && (
        <p>
          <a className="link" href={media(o.asset.id, "?download")}>Download</a> · {bytes(o.asset.bytes)}
          {o.asset.sha256 ? <> · <span className="mono">sha256 {o.asset.sha256.slice(0, 8)}</span></> : null}
        </p>
      )}
      {o.posted ? (
        <p className="st-ok">You report posting on {o.posted.platform}{o.posted.url ? <> · <a className="link" href={o.posted.url} target="_blank" rel="noreferrer">open</a></> : ""}. Recorded on {dateOf(o.posted.at)}.</p>
      ) : o.status === "ready" ? (
        open ? (
          <div className="st-row">
            <label className="sr-only" htmlFor={`pf-${o.id}`}>Platform</label>
            <select id={`pf-${o.id}`} value={platform} onChange={(e) => setPlatform(e.target.value)}>{PLATFORMS.map((p) => <option key={p}>{p}</option>)}</select>
            <label className="sr-only" htmlFor={`pu-${o.id}`}>Link to the post (optional)</label>
            <input id={`pu-${o.id}`} className="st-in st-grow" type="url" placeholder="Link to the post (optional)" value={url} onChange={(e) => setUrl(e.target.value)} />
            <button type="button" className="btn btn-sm" disabled={busy === "post"} onClick={mark}>Save</button>
            <button type="button" className="btn btn-sm btn-quiet" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        ) : (
          <div className="st-row"><button type="button" className="btn btn-sm btn-quiet" onClick={() => setOpen(true)}>Mark as posted</button><span className="st-meta">Creator report: mark this after you post.</span></div>
        )
      ) : null}
      {o.status !== "ready" && (
        <div className="st-row"><button type="button" className="btn btn-sm btn-quiet" disabled={busy === "rm"} onClick={() => act("rm", "DELETE", `/api/items/output/${o.id}`)}>Remove</button></div>
      )}
      <Err error={error} />
    </li>
  );
}

export function PublishTab(props: TabProps) {
  const { state, refresh, go } = props;
  const pk = useAct(refresh);
  const kept = state.clips.filter((c) => c.status === "kept");
  const building = state.jobs.find((j) => j.type === "package" && (j.status === "queued" || j.status === "running"));

  return (
    <div className="st">
      <section className="st-card" aria-labelledby="pb-render">
        <h2 id="pb-render">Render a clip</h2>
        <p className="st-intro">Render and download. Post it yourself.</p>
        {kept.length === 0 ? (
          <div className="st-empty">
            <b>No kept clips</b>
            <p>Keep at least one clip first. Then choose a shape and render it here.</p>
            <button type="button" className="btn btn-sm" onClick={() => go("create")}>Go to Create</button>
          </div>
        ) : (
          <ul className="st-list">{kept.map((c) => <RenderCard key={c.id} clip={c} {...props} />)}</ul>
        )}
      </section>

      <section className="st-card" aria-labelledby="pb-outs">
        <h2 id="pb-outs">Your renders</h2>
        {state.outputs.length === 0 ? (
          <p className="fine">Nothing rendered yet.</p>
        ) : (
          <ul className="st-list">{state.outputs.map((o) => <OutputRow key={o.id} o={o} state={state} refresh={refresh} />)}</ul>
        )}
      </section>

      <section className="st-card" aria-labelledby="pb-pkg">
        <h2 id="pb-pkg">Hand-off package</h2>
        <p className="fine">A bundle for your editor: clip list, caption files (.srt) and timelines (clips.edl, clips.otio).</p>
        <div className="st-row">
          <button type="button" className="btn" disabled={pk.busy === "pkg" || !!building} onClick={() => pk.act("pkg", "POST", `/api/projects/${state.project.id}/run`, { type: "package" })}>{building ? `Building ${Math.round(building.progress * 100)}%` : "Build package"}</button>
        </div>
        <Err error={pk.error} />
        {state.packages.length > 0 ? (
          <ul className="st-list">
            {state.packages.map((a) => a && (
              <li key={a.id} className="st-meta"><a className="link" href={media(a.id, "?download")}>{a.filename}</a> · {bytes(a.bytes)}</li>
            ))}
          </ul>
        ) : <p className="fine">No package built yet.</p>}
        <details>
          <summary>Open in your editor</summary>
          <ul className="st-guide">
            <li><b>CapCut Desktop or Web:</b> Captions &gt; Add captions &gt; Import file, and choose the .srt. The mobile app can&apos;t import caption files.</li>
            <li><b>DaVinci Resolve:</b> File &gt; Import &gt; Timeline, pick clips.edl or clips.otio, then relink the source file.</li>
          </ul>
        </details>
      </section>

      <section className="st-card" aria-labelledby="pb-dest">
        <h2 id="pb-dest">Posting directly</h2>
        <ul className="st-list">
          {["YouTube", "TikTok", "Instagram", "Facebook", "WhatsApp"].map((d) => (
            <li key={d} className="st-row"><b>{d}</b><span className="pill s-planned">Planned</span></li>
          ))}
        </ul>
        <p className="fine">IZWI is not connected to any platform yet. Download a render, post it yourself, then mark it as posted above.</p>
      </section>
    </div>
  );
}
