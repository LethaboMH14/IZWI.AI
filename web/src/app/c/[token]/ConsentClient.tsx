"use client";
import { useRef, useState, type ReactNode } from "react";
import { ApiError, api } from "@/lib/api";
import { clock, media } from "@/lib/format";
import { Mark } from "@/components/Mark";
import { when } from "@/app/guest-time";
import { CONSENT_USES } from "@/lib/consent-scope";
import { STATEMENT_LANG, availableLanguages, consentStrings, fill, segments, type ConsentLang, type ConsentStrings } from "@/lib/consent-i18n";
import "@/app/guest.css";
import "@/app/consent-qr.css";

export type ConsentData = {
  project: string; creator: string; person: string; role: string; scope: "appearance" | "voice" | "likeness" | string; statement: string;
  status: string; respondedName: string | null; respondedAt: number | null; wholeRecording: boolean;
  ranges: { startMs: number; endMs: number }[];
  proxy: { id: string; mime: string; duration_ms: number | null } | null; posterId: string | null;
};

const STATUS: Record<string, { cls: string; key: "statusRequested" | "statusGranted" | "statusDeclined" | "statusRevoked" }> = {
  requested: { cls: "s-draft", key: "statusRequested" },
  granted: { cls: "s-done", key: "statusGranted" },
  declined: { cls: "s-blocked", key: "statusDeclined" },
  revoked: { cls: "s-blocked", key: "statusRevoked" },
};
const SCOPE_KEY: Record<string, "scopeAppearance" | "scopeVoice" | "scopeLikeness"> = { appearance: "scopeAppearance", voice: "scopeVoice", likeness: "scopeLikeness" };
const USE_KEY: Record<(typeof CONSENT_USES)[number], "useClips" | "useCaptioned" | "usePublished"> = {
  "cut into clips": "useClips",
  "captioned or translated": "useCaptioned",
  "published by the creator": "usePublished",
};
type Decision = "grant" | "decline" | "revoke";

/** Wall-clock time of the answer, read in the click handler and never during render. */
const answeredAt = () => Date.now();

/** Fill placeholders, then render `**bold**` spans as <b>. */
function rich(text: string, vars: Record<string, string | number>): ReactNode {
  return segments(fill(text, vars)).map((s, i) => (s.bold ? <b key={i}>{s.text}</b> : s.text));
}

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
  const [lang, setLang] = useState<ConsentLang>("en");
  const langs = availableLanguages();
  const t: ConsentStrings = consentStrings(lang);
  const v = { creator: data.creator, person: data.person, role: data.role };

  const audio = !!data.proxy?.mime.startsWith("audio");
  const src = data.proxy ? media(data.proxy.id, `?t=${token}`) : null;
  const poster = data.posterId ? media(data.posterId, `?t=${token}`) : undefined;
  const known = STATUS[status];
  const st = known ? { cls: known.cls, text: t[known.key] } : { cls: "s-off", text: status };

  const seek = (ms: number) => {
    if (!el.current) return;
    el.current.currentTime = ms / 1000;
    void el.current.play().catch(() => undefined);
  };

  const send = async (decision: Decision) => {
    if (!name.trim()) { setErr(fill(t.nameError, v)); return; }
    setBusy(decision);
    setErr(null);
    try {
      const r = await api<{ status: string }>(`/api/public/consent/${token}`, { method: "POST", body: { decision, name: name.trim() } });
      setStatus(r.status);
      setAt(answeredAt());
      setBy(name.trim());
      setJustDid(decision);
      setName("");
    } catch (e) {
      const x = e as ApiError;
      setErr(x.status === 410 ? t.linkStopped : x.message || t.sendFailed);
    } finally {
      setBusy(null);
    }
  };

  const verb = justDid === "grant" ? t.doneGranted : justDid === "decline" ? t.doneDeclined : t.doneRevoked;
  const answered = status === "granted" ? t.statusGranted : status === "declined" ? t.statusDeclined : t.statusRevoked;

  return (
    <div className="gx gx-consent" lang={lang}><main className="gx-wrap">
      <div className="gx-top"><Mark small /><small>{t.topLabel}</small></div>
      {langs.length > 1 && (
        <div className="gx-lang">
          <label htmlFor="gx-lang"><span>{t.languageLabel}</span>
            <select id="gx-lang" value={lang} onChange={(e) => setLang(e.target.value as ConsentLang)}>
              {langs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </label>
          {lang !== "en" && <small>{t.writtenBy}</small>}
        </div>
      )}

      <header className="gx-head">
        <span className="gx-kicker">{data.project}</span>
        <h1>{fill(t.headline, v)}</h1>
        <p>{rich(data.role ? t.introRole : t.intro, v)}</p>
      </header>

      <section className="gx-card" aria-labelledby="gx-what">
        <h2 id="gx-what">{t.whatTitle}</h2>
        <p>{fill(t.whatLead, { what: SCOPE_KEY[data.scope] ? t[SCOPE_KEY[data.scope]] : t.scopeUnknown })}</p>
        <ul className="gx-uses">
          {CONSENT_USES.map((use) => <li key={use}>{t[USE_KEY[use]]}</li>)}
        </ul>
        <p className="gx-withdraw">{rich(t.withdrawNote, v)}</p>
        <h3 className="gx-statement-label">{t.statementLabel}</h3>
        {lang !== STATEMENT_LANG && <p className="fine">{t.statementNote}</p>}
        <blockquote className="gx-quote" lang={STATEMENT_LANG}>{data.statement}</blockquote>
      </section>

      <section className="gx-card" aria-labelledby="gx-answer">
        <div className="gx-status">
          <h2 id="gx-answer">{t.answerTitle}</h2>
          <span className={`pill ${st.cls}`}>{st.text}</span>
        </div>
        {justDid && <div className="gx-ok" role="status"><b>{verb}</b> {rich(t.recordedAs, { by: by ?? "", when: when(at) })} {justDid === "revoke" ? t.afterRevoke : justDid === "grant" ? t.afterGrant : fill(t.afterDecline, v)}</div>}
        {!justDid && status !== "requested" && at && <p>{by ? rich(t.answeredBy, { answer: answered, by, when: when(at) }) : fill(t.answeredOn, { answer: answered, when: when(at) })}</p>}
        <label className="field"><span>{t.nameLabel}</span><input value={name} onChange={(e) => { setName(e.target.value); setErr(null); }} autoComplete="name" maxLength={80} aria-invalid={!!err} aria-describedby="gx-name-hint" /></label>
        <p className="gx-hint" id="gx-name-hint">{rich(t.nameHint, v)}</p>
        {err && <p className="gx-err" role="alert">{err}</p>}
        {status === "granted" ? (
          <button type="button" className="btn btn-clay btn-full" disabled={busy !== null} onClick={() => send("revoke")}>{busy === "revoke" ? t.sending : t.withdraw}</button>
        ) : (
          <div className="gx-actions two">
            <button type="button" className="btn btn-gold" disabled={busy !== null} onClick={() => send("grant")}>{busy === "grant" ? t.sending : t.yes}</button>
            <button type="button" className="btn btn-gold" disabled={busy !== null} onClick={() => send("decline")}>{busy === "decline" ? t.sending : t.no}</button>
          </div>
        )}
        <a className="link gx-preview-link" href="#gx-watch">{t.seeWhere}</a>
      </section>

      <section className="gx-card gx-flat" id="gx-watch" aria-labelledby="gx-watch-title">
        <h2 id="gx-watch-title">{t.whereTitle}</h2>
        {src ? (
          <div className={"gx-player" + (audio ? " is-audio" : "")}>
            {audio ? (
              <audio ref={el} src={src} controls preload="metadata" onTimeUpdate={(e) => setNow(e.currentTarget.currentTime * 1000)} />
            ) : (
              <video ref={el} src={src} poster={poster} controls playsInline preload="metadata" onTimeUpdate={(e) => setNow(e.currentTarget.currentTime * 1000)} />
            )}
          </div>
        ) : (
          <p className="gx-nomedia">{fill(t.noPreview, v)}</p>
        )}
        {data.wholeRecording ? (
          <p>{rich(t.wholeRecording, v)}</p>
        ) : data.ranges.length > 0 ? (
          <div className="gx-ranges">
            {data.ranges.map((r, i) => (
              <button key={i} type="button" className={"gx-range" + (now >= r.startMs && now < r.endMs ? " on" : "")} onClick={() => seek(r.startMs)}>
                <span>{fill(t.part, { n: i + 1 })}</span>
                <span className="mono">{fill(t.range, { start: clock(r.startMs), end: clock(r.endMs) })}</span>
              </button>
            ))}
          </div>
        ) : (
          <p>{fill(t.notMarked, v)}</p>
        )}
      </section>

      <div className="gx-small">
        <p>{rich(t.recordsNote, v)}</p>
        <p>{fill(t.legalNote, v)}</p>
      </div>
    </main></div>
  );
}
