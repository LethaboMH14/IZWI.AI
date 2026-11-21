"use client";
import { useRef, useState } from "react";
import { ApiError, api } from "@/lib/api";
import { clock, media } from "@/lib/format";
import { Mark } from "@/components/Mark";
import { when } from "@/app/guest-time";
import { CONSENT_USES, consentScope } from "@/lib/consent-scope";
import "@/app/guest.css";

export type ConsentData = {
  project: string; creator: string; person: string; role: string; scope: "appearance" | "voice" | "likeness" | string; statement: string;
  status: string; respondedName: string | null; respondedAt: number | null; wholeRecording: boolean;
  ranges: { startMs: number; endMs: number }[];
  proxy: { id: string; mime: string; duration_ms: number | null } | null; posterId: string | null;
};

const STATUS: Record<string, { cls: string; text: string }> = {
  requested: { cls: "s-draft", text: "Waiting for your answer" },
  granted: { cls: "s-done", text: "You said yes" },
  declined: { cls: "s-blocked", text: "You said no" },
  revoked: { cls: "s-blocked", text: "You withdrew your yes" },
};
type Decision = "grant" | "decline" | "revoke";

export function ConsentClient({ token, data }: { token: string; data: ConsentData }) {
  const el = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  const [status, setStatus] = useState(data.status);
  const [at, setAt] = useState(data.respondedAt);
  const [by, setBy] = useState(data.respondedName);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<Decision | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [justDid, setJustDid] = useState<Decision | null>(null);
  const [now, setNow] = useState(0);

  const audio = !!data.proxy?.mime.startsWith("audio");
  const src = data.proxy ? media(data.proxy.id, `?t=${token}`) : null;
  const poster = data.posterId ? media(data.posterId, `?t=${token}`) : undefined;
  const st = STATUS[status] ?? { cls: "s-off", text: status };

  const seek = (ms: number) => {
    if (!el.current) return;
    el.current.currentTime = ms / 1000;
    void el.current.play().catch(() => undefined);
  };

  const send = async (decision: Decision) => {
    if (!name.trim()) { setErr(`Type your name as shown above: ${data.person}`); return; }
    setBusy(decision);
    setErr(null);
    try {
      const r = await api<{ status: string }>(`/api/public/consent/${token}`, { method: "POST", body: { decision, name: name.trim() } });
      setStatus(r.status);
      setAt(Date.now());
      setBy(name.trim());
      setJustDid(decision);
      setName("");
    } catch (e) {
      const x = e as ApiError;
      setErr(x.status === 410 ? "This link has just stopped working. Ask the creator for a new one." : x.message || "That did not go through. Try again.");
    } finally {
      setBusy(null);
    }
  };

  const verb = justDid === "grant" ? "You said yes." : justDid === "decline" ? "You said no." : "You withdrew your yes.";

  return (
    <div className="gx gx-consent"><main className="gx-wrap">
      <div className="gx-top"><Mark small /><small>Permission request</small></div>

      <header className="gx-head">
        <span className="gx-kicker">{data.project}</span>
        <h1>{data.creator} is asking for your permission</h1>
        <p>
          You are <b>{data.person}</b>{data.role ? <>, listed as <b>{data.role}</b></> : null}. Nothing happens until you answer, and you can say no.
        </p>
      </header>

      <section className="gx-card" aria-labelledby="gx-what">
        <h2 id="gx-what">What you are agreeing to</h2>
        <p>{consentScope(data.scope).what} in this recording may be:</p>
        <ul className="gx-uses">
          {CONSENT_USES.map((use) => <li key={use}>{use}</li>)}
        </ul>
        <p className="gx-withdraw"><b>If you withdraw later:</b> anything already published stays published.</p>
        <h3 className="gx-statement-label">Exact recorded statement</h3>
        <blockquote className="gx-quote">{data.statement}</blockquote>
      </section>

      <section className="gx-card" aria-labelledby="gx-answer">
        <div className="gx-status">
          <h2 id="gx-answer">Your answer</h2>
          <span className={`pill ${st.cls}`}>{st.text}</span>
        </div>
        {justDid && <div className="gx-ok" role="status"><b>{verb}</b> Recorded as <b>{by}</b> on {when(at)}. {justDid === "revoke" ? "Clips that were already published stay published. Anything not yet published is held." : justDid === "grant" ? "You can withdraw this later using this same link." : `${data.creator} has been told.`}</div>}
        {!justDid && status !== "requested" && at && <p>{status === "granted" ? "You said yes" : status === "declined" ? "You said no" : "You withdrew your yes"}{by ? <> as <b>{by}</b></> : null} on {when(at)}.</p>}
        <label className="field"><span>Type your name to answer, yes or no</span><input value={name} onChange={(e) => { setName(e.target.value); setErr(null); }} autoComplete="name" maxLength={80} aria-invalid={!!err} aria-describedby="gx-name-hint" /></label>
        <p className="gx-hint" id="gx-name-hint">Type: <b>{data.person}</b></p>
        {err && <p className="gx-err" role="alert">{err}</p>}
        {status === "granted" ? (
          <button type="button" className="btn btn-clay btn-full" disabled={busy !== null} onClick={() => send("revoke")}>{busy === "revoke" ? "Sending…" : "Withdraw my yes"}</button>
        ) : (
          <div className="gx-actions two">
            <button type="button" className="btn btn-gold" disabled={busy !== null} onClick={() => send("grant")}>{busy === "grant" ? "Sending…" : "Yes, I agree"}</button>
            <button type="button" className="btn btn-gold" disabled={busy !== null} onClick={() => send("decline")}>{busy === "decline" ? "Sending…" : "No"}</button>
          </div>
        )}
        <a className="link gx-preview-link" href="#gx-watch">See where you appear</a>
      </section>

      <section className="gx-card gx-flat" id="gx-watch" aria-labelledby="gx-watch-title">
        <h2 id="gx-watch-title">Where you appear</h2>
        {src ? (
          <div className={"gx-player" + (audio ? " is-audio" : "")}>
            {audio ? (
              <audio ref={el} src={src} controls preload="metadata" onTimeUpdate={(e) => setNow(e.currentTarget.currentTime * 1000)} />
            ) : (
              <video ref={el} src={src} poster={poster} controls playsInline preload="metadata" onTimeUpdate={(e) => setNow(e.currentTarget.currentTime * 1000)} />
            )}
          </div>
        ) : (
          <p className="gx-nomedia">There is no preview to watch yet. You can ask {data.creator} to show you before you answer.</p>
        )}
        {data.wholeRecording ? (
          <p>{data.creator} says you appear in <b>the whole recording</b>. Watch as much as you like.</p>
        ) : data.ranges.length > 0 ? (
          <div className="gx-ranges">
            {data.ranges.map((r, i) => (
              <button key={i} type="button" className={"gx-range" + (now >= r.startMs && now < r.endMs ? " on" : "")} onClick={() => seek(r.startMs)}>
                <span>Part {i + 1}</span>
                <span className="mono">{clock(r.startMs)} to {clock(r.endMs)}</span>
              </button>
            ))}
          </div>
        ) : (
          <p>{data.creator} has not marked where you appear yet. Ask them before you answer.</p>
        )}
      </section>

      

      <div className="gx-small">
        <p><b>What IZWI records:</b> the name you type, the time you answer, and the kind of browser you used. It is kept with this project so {data.creator} can show you agreed.</p>
        <p>This is a record of your answer, not a legal contract and not legal advice. If you are unsure, ask {data.creator} or someone you trust before you answer.</p>
      </div>
    </main></div>
  );
}
