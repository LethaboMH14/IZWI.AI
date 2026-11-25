"use client";
// Localise: captions in other languages. Every translation is a draft until a person approves each line.
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { LANGUAGES, langName } from "@/lib/languages";
import { clock, ago } from "@/lib/format";
import { api } from "@/lib/api";
import type { TabProps } from "./types";
import { Err, Pill, ShareLink, dateOf, useAct } from "./parts";

type Line = { id: string; idx: number; startMs: number; endMs: number; text: string; status: string; flag: string | null; edited: boolean; source?: string | null };

function LineRow({ line, act, busy }: { line: Line; act: ReturnType<typeof useAct>["act"]; busy: string | null }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(line.text);
  const ok = line.status === "approved";
  const save = async () => {
    const r = await act("edit" + line.id, "PATCH", `/api/items/line/${line.id}`, { text: text.trim() });
    if (r) setEditing(false);
  };
  return (
    <li className={`st-line${ok ? " ok" : ""}`}>
      <span className="mono">{clock(line.startMs)}</span>
      <div style={{ minWidth: 0 }}>
        {line.source && <p className="st-meta" lang="und">{line.source}</p>}
        {editing ? (
          <>
            <label className="sr-only" htmlFor={`l-${line.id}`}>Caption text at {clock(line.startMs)}</label>
            <textarea id={`l-${line.id}`} className="st-in" rows={2} maxLength={400} value={text} onChange={(e) => setText(e.target.value)} />
            <div className="st-row" style={{ marginTop: "0.4rem" }}>
              <button type="button" className="btn btn-sm" disabled={!text.trim() || busy === "edit" + line.id} onClick={save}>Save edit</button>
              <button type="button" className="btn btn-sm btn-quiet" onClick={() => { setEditing(false); setText(line.text); }}>Cancel</button>
            </div>
          </>
        ) : (
          <p className="st-text">{line.text}</p>
        )}
        {line.flag && <span className="st-flag">Check this line: {line.flag}</span>}
        {line.edited && !editing && <span className="st-meta"> Edited by you.</span>}
      </div>
      {!editing && (
        <div className="st-row">
          <button type="button" className="btn btn-sm btn-quiet" onClick={() => setEditing(true)}>Edit</button>
          <button
            type="button"
            className={`btn btn-sm${ok ? " btn-quiet" : ""}`}
            disabled={busy === "ap" + line.id}
            aria-pressed={ok}
            onClick={() => act("ap" + line.id, "PATCH", `/api/items/line/${line.id}`, { approve: !ok })}
          >
            {ok ? "Unapprove" : "Approve"}
          </button>
        </div>
      )}
    </li>
  );
}

export function LocaliseTab({ state, refresh }: TabProps) {
  const { act, busy, error } = useAct(refresh);
  const source = state.tracks.find((t) => t.kind === "source");
  const [picked, setPicked] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [share, setShare] = useState<{ url: string; message: string } | null>(null);
  const [leftMsg, setLeftMsg] = useState<string | null>(null);
  const [started, setStarted] = useState<string | null>(null);

  const have = new Set(state.tracks.map((t) => t.language));
  const regions = useMemo(() => {
    const m = new Map<string, typeof LANGUAGES>();
    for (const l of LANGUAGES) m.set(l.region, [...(m.get(l.region) ?? []), l]);
    return [...m.entries()];
  }, []);
  const translating = state.jobs.filter((j) => j.type === "translate" && (j.status === "queued" || j.status === "running"));
  const sel = state.tracks.find((t) => t.id === selected) ?? source;
  const reviewLinks = state.links.filter((l) => l.purpose === "review");
  const [lines, setLines] = useState<Line[]>([]);
  const [linesErr, setLinesErr] = useState<string | null>(null);
  const selId = (state.tracks.find((t) => t.id === selected) ?? source)?.id ?? null;
  const selStamp = state.tracks.find((t) => t.id === selId);
  const stamp = selStamp ? `${selStamp.updated_at}:${selStamp.approved}:${selStamp.lines}` : "";
  useEffect(() => {
    if (!selId) return;
    let live = true;
    api<{ lines: Line[] }>(`/api/items/track/${selId}`)
      .then((r) => { if (live) { setLines(r.lines); setLinesErr(null); } })
      .catch((e: Error) => { if (live) setLinesErr(e.message); });
    return () => { live = false; };
  }, [selId, stamp]);
  const needsProvider = error?.status === 409 && /translation provider/i.test(error.message);

  if (!source) {
    return (
      <div className="st">
        <div className="st-empty">
          <b>No captions yet</b>
          <p>Captions appear after Listening finishes. Once the recording has a transcript you can check it here and ask for other languages.</p>
        </div>
      </div>
    );
  }

  const translate = async () => {
    if (!picked) return;
    const r = await act("translate", "POST", `/api/projects/${state.project.id}/run`, { type: "translate", language: picked });
    if (r) { setStarted(langName(picked)); setPicked(null); }
  };
  const askReviewer = async (trackId: string) => {
    setShare(null);
    const label = `${langName(state.tracks.find((t) => t.id === trackId)?.language ?? "")} captions`;
    const r = await act<{ url: string; message: string }>("link", "POST", `/api/projects/${state.project.id}/links`, { trackId, label, days: 7 });
    if (r?.url) setShare({ url: r.url, message: r.message });
  };
  const approveAll = async () => {
    if (!sel) return;
    const r = await act<{ left: number }>("all", "PATCH", `/api/items/track/${sel.id}`, { approveAll: true });
    if (r) setLeftMsg(r.left === 0 ? "Every line is approved." : `${r.left} ${r.left === 1 ? "line needs" : "lines need"} your eyes first (flagged or edited).`);
  };

  return (
    <div className="st">
      <section className="st-card" aria-labelledby="lc-tracks">
        <div className="st-head"><h2 id="lc-tracks">Caption tracks</h2><span className="st-meta">Spoken language: {langName(source.language)}</span></div>
        <ul className="st-list">
          {state.tracks.map((t) => {
            const pct = t.lines ? Math.round((t.approved / t.lines) * 100) : 0;
            return (
              <li key={t.id} id={t.id} tabIndex={-1} className="st-item" style={{ ["--sc" as string]: t.status === "approved" ? "var(--moss)" : "var(--gold)" }}>
                <div className="st-head">
                  <b>{langName(t.language)}</b>
                  <span className="st-row"><span className="st-meta">{t.kind === "source" ? "Source transcript" : "Translation"}</span><Pill status={t.status} /></span>
                </div>
                <div className="st-bar" role="progressbar" aria-valuemin={0} aria-valuemax={t.lines} aria-valuenow={t.approved} aria-label={`${t.approved} of ${t.lines} lines approved`}><i style={{ width: `${pct}%` }} /></div>
                <p>{t.approved} of {t.lines} lines approved{t.flagged ? `, ${t.flagged} flagged` : ""}. Made by {t.engine}. Updated {ago(t.updated_at)}.</p>
                <div className="st-row">
                  <button type="button" className={`btn btn-sm${sel?.id === t.id ? "" : " btn-quiet"}`} aria-pressed={sel?.id === t.id} onClick={() => setSelected(t.id)}>{sel?.id === t.id ? "Reviewing" : "Review"}</button>
                  <button type="button" className="btn btn-sm btn-gold" disabled={busy === "link"} onClick={() => askReviewer(t.id)}>Ask a reviewer</button>
                </div>
              </li>
            );
          })}
        </ul>
        {share && <ShareLink url={share.url} message={share.message} onDone={() => setShare(null)} note="This review link works for 7 days. It is shown once and can't be shown again." />}
      </section>

      <section className="st-card" aria-labelledby="lc-add">
        <h2 id="lc-add">Add a language</h2>
        <p className="fine">A translation is always a draft. No caption is used in a render until a person has approved every line. Listed means an open model names the language; it does not mean IZWI has tested its quality.</p>
        {regions.map(([region, langs]) => (
          <div key={region} role="group" aria-label={region} style={{ display: "grid", gap: "0.4rem" }}>
            <span className="st-meta"><b>{region}</b></span>
            <div className="st-lang">
              {langs.map((l) => {
                const done = have.has(l.code);
                return (
                  <button key={l.code} type="button" disabled={done} aria-pressed={picked === l.code} className={picked === l.code ? "on" : ""} onClick={() => setPicked(l.code)}>
                    <b>{l.name}</b>
                    <small>{done ? "Already have captions" : `${l.whisper ? "Whisper lists it" : "Not on Whisper's list"} · ${l.madlad ? "MADLAD lists it" : "Not on MADLAD's list"} · not evaluated`}</small>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        <div className="st-row">
          <button type="button" className="btn" disabled={!picked || busy === "translate"} onClick={translate}>{picked ? `Translate to ${langName(picked)}` : "Choose a language"}</button>
        </div>
        {needsProvider && <p className="st-err" role="alert">{error?.message} <Link href="/app/engine">Open Run on</Link></p>}
        {!needsProvider && <Err error={error} />}
        {started && <p className="st-ok">Translating to {started} has started. The draft appears in the list when it finishes.</p>}
        {translating.length > 0 && (
          <ul className="st-list">
            {translating.map((j) => (
              <li key={j.id} className="st-meta">Translating to {langName(String(j.input.language ?? ""))}: {Math.round(j.progress * 100)}%{j.stage ? ` (${j.stage})` : ""}</li>
            ))}
          </ul>
        )}
      </section>

      {sel && (
        <section className="st-card" aria-labelledby="lc-rev">
          <div className="st-head">
            <h2 id="lc-rev">Review {langName(sel.language)}</h2>
            <button type="button" className="btn btn-sm" disabled={busy === "all"} onClick={approveAll}>Approve all clean lines</button>
          </div>
          {leftMsg && <p className="st-ok">{leftMsg}</p>}
          {linesErr ? <p className="st-err" role="alert">{linesErr}</p> : lines.length === 0 ? (
            <div className="st-empty"><b>No lines yet</b><p>This track has no lines.</p></div>
          ) : (
            <ul className="st-list" style={{ gap: 0 }}>
              {lines.map((l) => <LineRow key={l.id} line={l} act={act} busy={busy} />)}
            </ul>
          )}
          <Err error={needsProvider ? null : error} />
        </section>
      )}

      <section className="st-card" aria-labelledby="lc-links">
        <h2 id="lc-links">Review links</h2>
        {reviewLinks.length === 0 ? (
          <p className="fine">No active review links. Use Ask a reviewer above to make one.</p>
        ) : (
          <ul className="st-list">
            {reviewLinks.map((l) => {
              const t = state.tracks.find((x) => x.id === l.target_id);
              return (
                <li key={l.id} className="st-item">
                  <div className="st-head">
                    <b>{l.label || (t ? `${langName(t.language)} captions` : "Review")}</b>
                    <button type="button" className="btn btn-sm btn-danger" disabled={busy === "rv" + l.id} onClick={() => act("rv" + l.id, "DELETE", `/api/items/link/${l.id}`)}>Revoke</button>
                  </div>
                  <p>Opened {l.opens} {l.opens === 1 ? "time" : "times"}{l.last_opened_at ? `, last ${ago(l.last_opened_at)}` : ""}. Expires {dateOf(l.expires_at)}.</p>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
