"use client";
import { useRef, useState } from "react";
import { ApiError, api } from "@/lib/api";
import { clock, media } from "@/lib/format";
import { Mark } from "@/components/Mark";
import "@/app/guest.css";
import { rand } from "@/lib/format";
import "./listing.css";

export type ListingView = {
  title: string; terms: string; askingPriceCents: number | null; by: string;
  render: { id: string; duration_ms: number | null; width: number | null; height: number | null } | null;
  languages: string[]; posterId: string | null; durationMs: number | null;
};

export function ListingClient({ slug, data }: { slug: string; data: ListingView }) {
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [mediaError, setMediaError] = useState(false);
  const [f, setF] = useState({ name: "", contact: "", organisation: "", use: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const hp = (new FormData(e.currentTarget).get("website") as string | null) ?? "";
    if (f.use.trim().length < 10) { setErr("Tell the creator a little more about how you would use it (at least 10 characters)."); return; }
    if (f.contact.trim().length < 5) { setErr("Add an email address or phone number the creator can reply to."); return; }
    setBusy(true);
    setErr(null);
    try {
      await api(`/api/public/listing/${slug}`, { method: "POST", body: { name: f.name, contact: f.contact, organisation: f.organisation, use: f.use, website: hp } });
      setDone(true);
    } catch (x) {
      const a = x as ApiError;
      setErr(a.status === 429 ? "Too many requests from this connection. Wait a few minutes and try again." : a.message || "That did not go through. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="gx"><main className="gx-wrap">
      <div className="gx-top"><Mark small /><small>Licence a clip</small></div>

      <header className="gx-head">
        <span className="gx-kicker">by {data.by}</span>
        <h1>{data.title}</h1>
      </header>

      {data.render && !mediaError ? (
        <div className="listing-player">
          <div className="listing-frame" style={{ aspectRatio: data.render.width && data.render.height ? `${data.render.width} / ${data.render.height}` : "16 / 9" }}>
          <video ref={video} src={media(data.render.id, `?l=${slug}#t=0.1`)} poster={data.posterId ? media(data.posterId, `?l=${slug}`) : undefined} controls playsInline preload="metadata" onPlay={() => setPlaying(true)} onError={() => setMediaError(true)} />
          {!playing && <button type="button" className="listing-play" aria-label="Play clip" onClick={() => { void video.current?.play().catch(() => setMediaError(true)); }}>&#9654; <span>Play clip</span></button>}
          </div>
        </div>
      ) : <p className="gx-nomedia" role="status">The preview cannot be loaded right now. You can still send an enquiry below.</p>}

      <section className="gx-card listing-details" aria-labelledby="listing-details-title">
        <h2 id="listing-details-title">Clip details</h2>
        <dl>
          <div><dt>Duration</dt><dd>{data.durationMs != null ? clock(data.durationMs) : "Not available"}</dd></div>
          <div><dt>Caption languages</dt><dd>{data.languages.length ? data.languages.join(", ") : "Not specified"}</dd></div>
          <div><dt>Asking price</dt><dd>{data.askingPriceCents == null ? "By enquiry" : rand(data.askingPriceCents)}</dd></div>
          <div><dt>Permitted use and term</dt><dd>{data.terms.trim() || "Not specified. Ask the creator for details."}</dd></div>
        </dl>
      </section>

      <section className="gx-card" aria-labelledby="gx-ask">
        <h2 id="gx-ask">Ask to license this clip</h2>
        {done ? (
          <div className="gx-ok" role="status">
            <b>Your request was sent to {data.by}.</b> They will reply to you directly, using the contact you gave. No payment has been taken.
          </div>
        ) : (
          <form onSubmit={submit} className="gx-stack" noValidate>

            <label className="field"><span>Your name</span><input value={f.name} onChange={set("name")} required maxLength={80} autoComplete="name" /></label>
            <label className="field"><span>Email or phone</span><input value={f.contact} onChange={set("contact")} required maxLength={120} autoComplete="email" inputMode="email" /><small>Where the creator should reply.</small></label>
            <label className="field"><span>Organisation <i>(optional)</i></span><input value={f.organisation} onChange={set("organisation")} maxLength={120} autoComplete="organization" /></label>
            <label className="field"><span>How would you use it?</span><textarea value={f.use} onChange={set("use")} required minLength={10} maxLength={1500} placeholder="Where it will appear, for how long, and in which countries." /></label>
            <div className="hp" aria-hidden="true">
              <label>Leave this empty<input name="website" tabIndex={-1} autoComplete="off" defaultValue="" /></label>
            </div>
            {err && <p className="gx-err" role="alert">{err}</p>}
            <div className="listing-submit"><button type="submit" className="btn btn-gold" disabled={busy || !f.name.trim()}>{busy ? "Sending..." : "Send licence enquiry"}</button><p className="fine">No payment happens here. {data.by} replies to you directly.</p></div>
          </form>
        )}
      </section>
    </main></div>
  );
}
