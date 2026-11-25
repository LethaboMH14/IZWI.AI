"use client";
// Protect: the creator's declaration and each person's consent. A render is held until both are in place.
import { useState } from "react";
import { clock, ago } from "@/lib/format";
import { CONSENT_SCOPES, consentScope, type ConsentScopeId } from "@/lib/consent-scope";
import type { TabProps } from "./types";
import { Err, Pill, ShareLink, dateOf, useAct } from "./parts";

const STATEMENT =
  "I made this recording or have permission to use everything in it, including music, footage and voices. This is my statement; IZWI does not verify ownership.";

const SCOPES = Object.entries(CONSENT_SCOPES) as [ConsentScopeId, (typeof CONSENT_SCOPES)[ConsentScopeId]][];

/** "1:05-2:30, 10:00-11:00" or with en dashes. Returns null when something cannot be read. */
function parseRanges(s: string): { startMs: number; endMs: number }[] | null {
  const out: { startMs: number; endMs: number }[] = [];
  const t = (x: string) => {
    const p = x.trim().split(":").map(Number);
    if (p.length < 2 || p.length > 3 || p.some((n) => !Number.isFinite(n) || n < 0)) return null;
    return p.reduce((a, n) => a * 60 + n, 0) * 1000;
  };
  for (const part of s.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean)) {
    const [a, b, ...rest] = part.split(/\s*[-–—]\s*/);
    if (!a || !b || rest.length) return null;
    const startMs = t(a), endMs = t(b);
    if (startMs === null || endMs === null || endMs <= startMs) return null;
    out.push({ startMs, endMs });
  }
  return out;
}

function PersonCard({ person, projectId, act, busy }: { person: TabProps["state"]["people"][number]; projectId: string; act: ReturnType<typeof useAct>["act"]; busy: string | null }) {
  const [scope, setScope] = useState<ConsentScopeId>("appearance");
  const [share, setShare] = useState<{ url: string; message: string } | null>(null);
  const [confirm, setConfirm] = useState(false);
  const c = person.consent;
  const status = c?.status ?? "not asked";
  const ask = async () => {
    const r = await act<{ url: string; message: string }>("ask" + person.id, "POST", `/api/projects/${projectId}/consent`, { personId: person.id, scope });
    if (r?.url) setShare({ url: r.url, message: r.message });
  };
  return (
    <li className="st-item" id={`person-${person.id}`} tabIndex={-1} style={{ ["--sc" as string]: status === "granted" ? "var(--moss)" : status === "not asked" ? "var(--line)" : "var(--clay)" }}>
      <div className="st-head">
        <b>{person.name}</b>
        <Pill status={status} />
      </div>
      <p>
        {person.role}. {person.wholeRecording ? "In the whole recording." : person.ranges.length ? `Appears at ${person.ranges.map((r) => `${clock(r.startMs)}-${clock(r.endMs)}`).join(", ")}.` : "No time ranges set."}
      </p>
      {c && (
        <p>
          {status === "requested" && `Asked ${ago(c.requested_at)} for: ${consentScope(c.scope).label}. No answer yet.`}
          {status === "granted" && <>Recorded permission: {consentScope(c.scope).label}. Granted{c.responded_name ? ` by ${c.responded_name}` : ""}{c.responded_at ? ` on ${dateOf(c.responded_at)}` : ""}.</>}
          {status === "declined" && `Declined${c.responded_name ? ` by ${c.responded_name}` : ""}${c.responded_at ? ` on ${dateOf(c.responded_at)}` : ""}.`}
          {status === "revoked" && `Withdrawn${c.responded_name ? ` by ${c.responded_name}` : ""}${c.responded_at ? ` on ${dateOf(c.responded_at)}` : ""}.`}
        </p>
      )}
      <div className="st-row">
        <label className="st-scope-field" htmlFor={`sc-${person.id}`}><span>Scope for a new request</span>
          <select id={`sc-${person.id}`} value={scope} onChange={(e) => setScope(e.target.value as ConsentScopeId)}>
            {SCOPES.map(([id, s]) => <option key={id} value={id}>{s.label}</option>)}
          </select>
        </label>
        <button type="button" className="btn btn-sm btn-gold" disabled={busy === "ask" + person.id} onClick={ask}>{c ? "Ask again" : "Ask for consent"}</button>
        {!confirm ? (
          <button type="button" className="btn btn-sm btn-quiet" onClick={() => setConfirm(true)}>Remove</button>
        ) : (
          <>
            <button type="button" className="btn btn-sm btn-danger" disabled={busy === "rm" + person.id} onClick={() => act("rm" + person.id, "DELETE", `/api/items/person/${person.id}`)}>Yes, remove {person.name}</button>
            <button type="button" className="btn btn-sm btn-quiet" onClick={() => setConfirm(false)}>Keep</button>
          </>
        )}
      </div>
      {confirm && <p className="fine">Removing a person also removes their consent record. Renders that were held for them are released if nothing else holds them.</p>}
      {share && <ShareLink url={share.url} message={share.message} onDone={() => setShare(null)} note="This consent link works for 30 days. It is shown once and can't be shown again." />}
    </li>
  );
}

export function ProtectTab({ state, refresh }: TabProps) {
  const { act, busy, error } = useAct(refresh);
  const pid = state.project.id;
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [whole, setWhole] = useState(true);
  const [ranges, setRanges] = useState("");
  const [formErr, setFormErr] = useState<string | null>(null);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormErr(null);
    let rs: { startMs: number; endMs: number }[] = [];
    if (!whole) {
      const p = parseRanges(ranges);
      if (!p || p.length === 0) { setFormErr("Enter time ranges like 01:05-02:30, separated by commas."); return; }
      rs = p;
    }
    const r = await act("add", "POST", `/api/projects/${pid}/people`, { name: name.trim(), role: role.trim(), wholeRecording: whole, ranges: rs });
    if (r) { setName(""); setRole(""); setRanges(""); setWhole(true); }
  };

  const clips = state.clips.filter((c) => c.status !== "dropped");

  return (
    <div className="st">
      <section className="st-card" aria-labelledby="pr-decl">
        <h2 id="pr-decl">Your declaration</h2>
        {state.declaration ? (
          <>
            <p>{state.declaration.statement}</p>
            <p className="st-declaration-meta">Recorded {dateOf(state.declaration.created_at)}</p>
          </>
        ) : (
          <>
            <p>{STATEMENT}</p>
            <p className="st-declaration-meta">Not recorded yet</p>
            <p className="fine">Renders stay held until you record this.</p>
            <div className="st-row">
              <button type="button" className="btn" disabled={busy === "decl"} onClick={() => act("decl", "POST", `/api/projects/${pid}/declare`)}>Record my declaration</button>
            </div>
          </>
        )}
      </section>

      <section className="st-card" aria-labelledby="pr-people">
        <h2 id="pr-people">People in this recording</h2>
        {state.people.length === 0 ? (
          <div className="st-empty"><b>No one added yet</b><p>If anyone other than you speaks or appears, add them and ask for their consent. Renders of the stretches they are in are held until they say yes.</p></div>
        ) : (
          <ul className="st-list">{state.people.map((p) => <PersonCard key={p.id} person={p} projectId={pid} act={act} busy={busy} />)}</ul>
        )}
        <form onSubmit={add} className="st-card soft" aria-label="Add a person">
          <h3>Add a person</h3>
          <div className="st-two">
            <label className="field"><span>Name</span><input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required autoComplete="off" style={{ height: 48, fontSize: "1rem" }} /></label>
            <label className="field"><span>Role</span><input value={role} onChange={(e) => setRole(e.target.value)} maxLength={60} required placeholder="Guest, host, musician" autoComplete="off" style={{ height: 48, fontSize: "1rem" }} /></label>
          </div>
          <label className="st-check"><input type="checkbox" checked={whole} onChange={(e) => setWhole(e.target.checked)} /> In the whole recording</label>
          {!whole && (
            <label className="field">
              <span>Time ranges</span>
              <input value={ranges} onChange={(e) => setRanges(e.target.value)} placeholder="01:05-02:30, 10:00-11:20" style={{ height: 48, fontSize: "1rem" }} />
              <small>Minutes and seconds, mm:ss-mm:ss. Separate several ranges with commas.</small>
            </label>
          )}
          {formErr && <p className="st-err" role="alert">{formErr}</p>}
          <div className="st-row"><button type="submit" className="btn" disabled={busy === "add" || !name.trim() || !role.trim()}>Add person</button></div>
        </form>
        <Err error={error} />
      </section>

      <section className="st-card" aria-labelledby="pr-held">
        <h2 id="pr-held">What is held and why</h2>
        {clips.length === 0 ? (
          <p className="fine">No clips yet. When you have clips, each one shows here with whether it can be rendered.</p>
        ) : (
          <ul className="st-list">
            {clips.map((c) => {
              const g = c.gate;
              return (
                <li key={c.id} className="st-item" style={{ ["--sc" as string]: g.ok ? "var(--moss)" : "var(--clay)" }}>
                  <div className="st-head"><b>{c.title}</b><span className="mono st-meta">{clock(c.startMs)}-{clock(c.endMs)}</span></div>
                  <p>
                    {g.ok
                      ? "Clear to render. Your declaration is recorded and everyone in this stretch has said yes."
                      : !g.declaration
                        ? "Held: your creator declaration is not recorded yet."
                        : `Held: waiting on ${g.waiting.map((w) => `${w.name} (${w.status})`).join(", ")}.`}
                    {!g.ok && !g.declaration && g.waiting.length > 0 && ` Also waiting on ${g.waiting.map((w) => `${w.name} (${w.status})`).join(", ")}.`}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
