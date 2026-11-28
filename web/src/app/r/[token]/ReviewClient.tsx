"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, api } from "@/lib/api";
import { clock, media } from "@/lib/format";
import { Mark } from "@/components/Mark";
import { day, when } from "@/app/guest-time";
import "@/app/guest.css";

type Line = { id: string; idx: number; startMs: number; endMs: number; text: string; status: string; flag: string | null; approvedBy: string | null; source: string | null };
type Cmt = { id: string; author: string; at_ms: number | null; body: string; kind: string; created_at: number };
export type ReviewData = {
  label: string | null; project: { title: string; kind: string }; creator: string; expiresAt: number;
  proxy: { id: string; mime: string; duration_ms: number | null } | null; posterId: string | null;
  track: { id: string; language: string; name: string; kind: string; status: string } | null;
  lines: Line[]; comments: Cmt[];
};

const NAME_KEY = "izwi.reviewer";
const who = (a: string) => a.replace(/ \(review link\)$/, "");

export function ReviewClient({ token, data }: { token: string; data: ReviewData }) {
  const url = `/api/public/review/${token}`;
  const mediaEl = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  const listEl = useRef<HTMLDivElement>(null);
  const [name, setName] = useState("");
  const [now, setNow] = useState(0);
  const [lines, setLines] = useState(data.lines);
  const [comments, setComments] = useState(data.comments);
  const [body, setBody] = useState("");
  const [suggest, setSuggest] = useState<string | null>(null);
  const [suggestBody, setSuggestBody] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const errRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (err) errRef.current?.scrollIntoView({ block: "nearest" }); }, [err]);
  const [needName, setNeedName] = useState(false);
  const [sent, setSent] = useState<"approve" | "changes" | null>(null);

  useEffect(() => {
    // Read after hydration, in a callback, so the server and first client render match.
    const t = setTimeout(() => {
      try {
        const v = sessionStorage.getItem(NAME_KEY);
        if (v) setName(v);
      } catch { /* private window: the name is just not remembered */ }
    }, 0);
    return () => clearTimeout(t);
  }, []);
  const rememberName = (v: string) => {
    setName(v);
    setNeedName(false);
    try { sessionStorage.setItem(NAME_KEY, v); } catch { /* ignore */ }
  };

  const audio = !!data.proxy?.mime.startsWith("audio");
  const src = data.proxy ? media(data.proxy.id, `?t=${token}`) : null;
  const poster = data.posterId ? media(data.posterId, `?t=${token}`) : undefined;
  const active = useMemo(() => lines.find((l) => now >= l.startMs && now < l.endMs)?.id ?? null, [lines, now]);

  // Keep the line under the playhead in view inside the list only (never scroll the whole page).
  useEffect(() => {
    if (!active || !listEl.current) return;
    const el = listEl.current.querySelector<HTMLElement>(`[data-line="${active}"]`);
    if (!el) return;
    const box = listEl.current;
    const top = el.offsetTop - box.offsetTop;
    if (top < box.scrollTop || top + el.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTo({ top: top - 8 });
  }, [active]);

  const seek = (ms: number) => {
    const m = mediaEl.current;
    if (!m) return;
    m.currentTime = ms / 1000;
    void m.play().catch(() => undefined);
  };

  const post = useCallback(
    async (key: string, payload: Record<string, unknown>): Promise<boolean> => {
      const author = name.trim();
      if (!author) { setNeedName(true); setErr("Please add your name first, so the creator knows who said what."); return false; }
      setBusy(key);
      setErr(null);
      try {
        await api(url, { method: "POST", body: { ...payload, author } });
        return true;
      } catch (e) {
        const x = e as ApiError;
        setErr(x.status === 410 ? "This link has just stopped working. Ask the creator for a new one." : x.message || "That did not go through. Try again.");
        return false;
      } finally {
        setBusy(null);
      }
    },
    [name, url],
  );

  const addComment = (c: Omit<Cmt, "id" | "created_at">) => setComments((p) => [...p, { ...c, id: `local-${p.length}-${c.body.length}`, created_at: Date.now() }]);

  const sendComment = async () => {
    const text = body.trim();
    if (!text) return;
    const atMs = Math.round(now);
    if (await post("comment", { action: "comment", atMs, body: text })) {
      await addComment({ author: name.trim(), at_ms: atMs, body: text, kind: "note" });
      setBody("");
    }
  };

  const toggleLine = async (l: Line) => {
    const approve = l.status !== "approved";
    if (await post(`ap-${l.id}`, { action: "approveLine", lineId: l.id, approve })) {
      setLines((p) => p.map((x) => (x.id === l.id ? { ...x, status: approve ? "approved" : "draft", approvedBy: approve ? `${name.trim()} (review link)` : null } : x)));
    }
  };

  const sendSuggestion = async (l: Line) => {
    const text = suggestBody.trim();
    if (!text) return;
    if (await post(`sg-${l.id}`, { action: "comment", atMs: l.startMs, lineId: l.id, body: text })) {
      await addComment({ author: name.trim(), at_ms: l.startMs, body: `Line ${l.idx + 1}: ${text}`, kind: "note" });
      setSuggest(null);
      setSuggestBody("");
    }
  };

  const decide = async (decision: "approve" | "changes") => {
    if (decision === "changes" && !note.trim()) { setErr("Tell the creator what to change, even in a few words."); return; }
    if (await post("decision", { action: "decision", decision, note: note.trim() })) setSent(decision);
  };

  const approvedN = lines.filter((l) => l.status === "approved").length;

  if (sent) {
    return (
      <div className="gx"><main className="gx-wrap">
        <div className="gx-top"><Mark small /></div>
        <section className="gx-card gx-result" role="status">
          <h1 style={{ fontSize: "var(--z-type-xl)" }}>Sent to {data.creator}</h1>
          <p>{sent === "approve" ? "You told them it looks good." : "You told them it needs changes."} They will see it in their project{note.trim() ? ", with your note" : ""}.</p>
          <p className="fine">This cannot be taken back from here. If you change your mind, use the same link again to send a new answer, until it expires on {day(data.expiresAt)}.</p>
          <button className="btn btn-quiet btn-sm" type="button" onClick={() => { setSent(null); setNote(""); }}>Send another answer</button>
        </section>
      </main></div>
    );
  }

  return (
    <div className="gx"><main className="gx-wrap">
      <div className="gx-top"><Mark small /><small>Review link</small></div>

      <header className="gx-head">
        <span className="gx-kicker">{data.label || "Review"}</span>
        <h1>{data.creator} asked you to review <em>{data.project.title}</em></h1>
        <p>Watch it, then say what you think. This link works until {day(data.expiresAt)}. You do not need an account.</p>
      </header>

      {src ? (
        <div className={"gx-player" + (audio ? " is-audio" : "")}>
          {audio ? (
            <audio ref={mediaEl} src={src} controls preload="metadata" onTimeUpdate={(e) => setNow(e.currentTarget.currentTime * 1000)} />
          ) : (
            <video ref={mediaEl} src={src} poster={poster} controls playsInline preload="metadata" onTimeUpdate={(e) => setNow(e.currentTarget.currentTime * 1000)} />
          )}
        </div>
      ) : (
        <p className="gx-nomedia">There is no preview to watch yet. You can still leave a comment or answer below.</p>
      )}

      <section className="gx-card gx-flat">
        <label className="field">
          <span>Your name</span>
          <input value={name} onChange={(e) => rememberName(e.target.value)} maxLength={60} autoComplete="name" placeholder="So the creator knows who you are" aria-invalid={needName} />
          <small>Shown next to everything you send. Kept only in this tab.</small>
        </label>
        {err && <p ref={errRef} className="gx-err" role="alert">{err}</p>}
      </section>

      {data.track && (
        <section className="gx-card" aria-labelledby="gx-lines">
          <h2 id="gx-lines">{data.track.name} captions</h2>
          <p className="fine">
            {data.track.kind === "translation" ? "Each line shows what was said, with the translation under it. " : ""}
            {approvedN} of {lines.length} lines approved. Tap a line to hear it.
          </p>
          {lines.length === 0 ? (
            <p className="gx-nomedia">This track has no lines yet.</p>
          ) : (
            <div className="gx-lines" ref={listEl}>
              {lines.map((l) => (
                <div key={l.id} data-line={l.id} className={"gx-line" + (l.id === active ? " now" : "") + (l.status === "approved" ? " ok" : "")}>
                  <button type="button" className="gx-seek" onClick={() => seek(l.startMs)} aria-label={`Play line ${l.idx + 1} from ${clock(l.startMs)}`}>
                    <span className="mono">{clock(l.startMs)}</span>
                    {l.source && <span className="gx-src">{l.source}</span>}
                    <span className="gx-tr">{l.text}</span>
                  </button>
                  {l.flag && <span className="gx-flag">Check: {l.flag}</span>}
                  <div className="gx-row">
                    <button type="button" className={"btn btn-sm " + (l.status === "approved" ? "btn-quiet" : "btn-gold")} disabled={busy === `ap-${l.id}`} onClick={() => toggleLine(l)}>
                      {l.status === "approved" ? "Unapprove" : "Approve line"}
                    </button>
                    <button type="button" className="btn btn-sm btn-quiet" aria-expanded={suggest === l.id} onClick={() => { setSuggest(suggest === l.id ? null : l.id); setSuggestBody(""); }}>
                      Suggest a change
                    </button>
                  </div>
                  {suggest === l.id && (
                    <div className="gx-stack">
                      <label className="field">
                        <span>What should this line say?</span>
                        <textarea value={suggestBody} onChange={(e) => setSuggestBody(e.target.value)} maxLength={2000} autoFocus />
                      </label>
                      <button type="button" className="btn btn-sm" disabled={!suggestBody.trim() || busy === `sg-${l.id}`} onClick={() => sendSuggestion(l)}>
                        {busy === `sg-${l.id}` ? "Sending…" : "Send suggestion"}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="gx-card" aria-labelledby="gx-cm">
        <h2 id="gx-cm">Leave a comment</h2>
        <label className="field">
          <span>Your comment <i>(pinned to {clock(now)})</i></span>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} placeholder="What did you notice at this moment?" />
        </label>
        <button type="button" className="btn" disabled={!body.trim() || busy === "comment"} onClick={sendComment}>
          {busy === "comment" ? "Sending…" : `Send comment at ${clock(now)}`}
        </button>
        {comments.length > 0 && (
          <div className="gx-comments" aria-label="Comments so far">
            {comments.map((c) => (
              <div key={c.id} className="gx-comment">
                <b>{who(c.author)}</b>
                <p>{c.body}</p>
                <span className="mono">{c.at_ms != null ? `${clock(c.at_ms)} · ` : ""}{when(c.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="gx-card" aria-labelledby="gx-dec">
        <h2 id="gx-dec">Your answer</h2>
        <label className="field">
          <span>A note for {data.creator} <i>(needed if it needs changes)</i></span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
        </label>
        <div className="gx-actions two">
          <button type="button" className="btn btn-gold" disabled={busy === "decision"} onClick={() => decide("approve")}>Looks good</button>
          <button type="button" className="btn btn-quiet" disabled={busy === "decision"} onClick={() => decide("changes")}>Needs changes</button>
        </div>
        <p className="fine">Your answer goes straight to {data.creator}. It does not publish anything.</p>
      </section>
    </main></div>
  );
}
