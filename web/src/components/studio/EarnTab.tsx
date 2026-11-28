"use client";
// Earn: licensing enquiries. No money moves through IZWI yet.
import { useState } from "react";
import type { TabProps } from "./types";
import { Err, Pill, ShareLink, dateOf, useAct } from "./parts";

type Listing = TabProps["state"]["listings"][number];
type Enquiry = { id: string; name: string; contact: string; organisation: string | null; intended_use: string; status: string; created_at: number };

function ListingCard({ l, clipTitle, refresh }: { l: Listing; clipTitle: string } & Pick<TabProps, "refresh">) {
  const { act, busy, error } = useAct(refresh);
  const [copied, setCopied] = useState(false);
  const enquiries = l.enquiries as Enquiry[];
  const copy = async () => {
    try { await navigator.clipboard.writeText(l.url); setCopied(true); } catch { setCopied(false); }
  };
  return (
    <li className="st-item" style={{ ["--sc" as string]: l.enabled ? "var(--moss)" : "var(--line)" }}>
      <div className="st-head"><b>{l.title}</b><span className={`pill ${l.enabled ? "s-done" : "s-off"}`}>{l.enabled ? "Open to enquiries" : "Switched off"}</span></div>
      <p>Clip: {clipTitle}. {l.terms ? `Terms: ${l.terms}` : "No terms written."}</p>
      <div className="st-row">
        <a className="link" href={l.url} target="_blank" rel="noreferrer">{l.url}</a>
        <button type="button" className="btn btn-sm btn-quiet" onClick={copy}>{copied ? "Copied" : "Copy link"}</button>
        <a className="btn btn-sm btn-gold" href={`https://wa.me/?text=${encodeURIComponent(`${l.title}: ${l.url}`)}`} target="_blank" rel="noreferrer">Send on WhatsApp</a>
      </div>
      <label className="st-check"><input type="checkbox" checked={l.enabled} disabled={busy === "en"} onChange={(e) => act("en", "PATCH", `/api/items/listing/${l.id}`, { enabled: e.target.checked })} /> Accept enquiries</label>
      <Err error={error} />
      <h3>Enquiries</h3>
      {enquiries.length === 0 ? (
        <p className="fine">No enquiries yet.</p>
      ) : (
        <ul className="st-list">
          {enquiries.map((q) => (
            <li key={q.id} className="st-card soft">
              <div className="st-head"><b>{q.name}</b><Pill status={q.status} /></div>
              <p className="st-meta">{q.contact}{q.organisation ? ` · ${q.organisation}` : ""} · {dateOf(q.created_at)}</p>
              <p style={{ color: "var(--ink)", fontSize: "var(--z-type-sm)" }}>{q.intended_use}</p>
              <div className="st-row">
                <label className="st-meta" htmlFor={`qs-${q.id}`}>Status</label>
                <select id={`qs-${q.id}`} value={q.status} disabled={busy === "q" + q.id} onChange={(e) => act("q" + q.id, "PATCH", `/api/items/enquiry/${q.id}`, { status: e.target.value })}>
                  <option value="new">New</option><option value="replied">Replied</option><option value="closed">Closed</option>
                </select>
              </div>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function ListForm({ clip, projectId, refresh }: { clip: TabProps["state"]["clips"][number]; projectId: string } & Pick<TabProps, "refresh">) {
  const { act, busy, error } = useAct(refresh);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(clip.title);
  const [terms, setTerms] = useState("");
  const [made, setMade] = useState<{ url: string } | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await act<{ url: string }>("list", "POST", `/api/projects/${projectId}/listings`, { clipId: clip.id, title: title.trim(), terms: terms.trim() });
    if (r?.url) { setMade({ url: r.url }); setOpen(false); }
  };
  return (
    <li className="st-item">
      <div className="st-head"><b>{clip.title}</b>{!open && <button type="button" className="btn btn-sm" onClick={() => setOpen(true)}>List this clip</button>}</div>
      {open && (
        <form onSubmit={submit} className="st-card soft">
          <label className="field"><span>Title buyers see</span><input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required style={{ height: 48, fontSize: "1rem" }} /></label>
          <label className="field"><span>Terms</span><textarea value={terms} onChange={(e) => setTerms(e.target.value)} maxLength={1000} rows={3} placeholder="For example: broadcast use, 12 months, price on request." /></label>
          <div className="st-row">
            <button type="submit" className="btn" disabled={busy === "list" || !title.trim()}>Create listing</button>
            <button type="button" className="btn btn-quiet" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </form>
      )}
      <Err error={error} />
      {made && <ShareLink url={made.url} message={`${title}: ${made.url}`} onDone={() => setMade(null)} note="This is your public listing page. It also stays in the list below." />}
    </li>
  );
}

export function EarnTab({ state, refresh }: TabProps) {
  const ready = new Set(state.outputs.filter((o) => o.status === "ready").map((o) => o.clipId));
  const candidates = state.clips.filter((c) => c.status === "kept" && ready.has(c.id));
  const listed = new Set(state.listings.map((l) => l.clipId));

  return (
    <div className="st">
      <section className="st-card soft" aria-labelledby="er-what">
        <h2 id="er-what">Licensing enquiries</h2>
        <p>List a finished clip on a public page. Producers, brands and broadcasters can send you an enquiry. You reply yourself and agree terms with them directly.</p>
        <p className="fine">IZWI does not take payments yet. <span className="pill s-planned">Planned</span> Payfast. A 7% commission was proposed in the canvas, but nothing is charged.</p>
      </section>

      <section className="st-card" aria-labelledby="er-list">
        <h2 id="er-list">List a clip</h2>
        {candidates.length === 0 ? (
          <div className="st-empty"><b>No finished clips to list</b><p>Keep a clip and render it first, so buyers see the finished piece.</p></div>
        ) : (
          <ul className="st-list">{candidates.map((c) => <ListForm key={c.id} clip={c} projectId={state.project.id} refresh={refresh} />)}</ul>
        )}
        {candidates.some((c) => listed.has(c.id)) && <p className="fine">A clip with a listing can be listed again with different terms.</p>}
      </section>

      <section className="st-card" aria-labelledby="er-ls">
        <h2 id="er-ls">Your listings</h2>
        {state.listings.length === 0 ? (
          <p className="fine">No listings yet.</p>
        ) : (
          <ul className="st-list">{state.listings.map((l) => <ListingCard key={l.id} l={l} clipTitle={state.clips.find((c) => c.id === l.clipId)?.title ?? "Clip"} refresh={refresh} />)}</ul>
        )}
      </section>
    </div>
  );
}
