"use client";
// New story from the home screen: say what it is, drop the file, and it goes straight to upload.
// The story is created when a file is chosen (title defaults to the file name), so there are no empty stories.
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Plus, UploadSimple } from "@phosphor-icons/react";
import { Uploader, NextSteps } from "@/components/Uploader";
import { api, ApiError, newKey } from "@/lib/api";
import { makers } from "@/lib/platform";
import "@/app/entry.css";

const OK = /\.(mp4|mov|m4v|webm|mkv|avi|mp3|m4a|aac|wav|ogg|opus|flac|3gp)$/i;
const stem = (n: string) => n.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").trim().slice(0, 120) || "Untitled story";

export function NewStory({ empty = false }: { empty?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(empty);
  const [kind, setKind] = useState("podcast");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [projectId, setProjectId] = useState("");
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const guard = useRef(false);
  const key = useRef(newKey());
  const maker = makers.find((m) => m.id === kind) ?? makers[0];

  async function take(f?: File) {
    if (!f || guard.current || projectId) return;
    if (!(f.type.startsWith("video/") || f.type.startsWith("audio/") || OK.test(f.name))) {
      setError(`${f.name} is not a video or audio file. Try MP4, MOV, MP3 or WAV.`);
      return;
    }
    guard.current = true;
    setBusy(true);
    setError("");
    setFile(f);
    try {
      const r = await api<{ id: string }>("/api/projects", { method: "POST", key: key.current, body: { title: title.trim() || stem(f.name), kind, spokenLanguage: "auto" } });
      setProjectId(r.id);
    } catch (e) {
      setFile(null);
      key.current = newKey();
      setError(e instanceof ApiError ? e.message : "Could not start the story. Try again.");
    } finally {
      guard.current = false;
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className="newstory" onClick={() => setOpen(true)}>
        <b><Plus weight="bold" /> Start a new story</b>
        <span>From your phone or laptop. If the signal drops, the upload picks up again.</span>
        <span className="btn btn-sm newstory-cta" aria-hidden="true">Choose video or audio</span>
      </button>
    );
  }

  return (
    <section className={"newst" + (empty ? " is-empty" : "")} aria-label="New story">
      {empty && (
        <header className="newst-h">
          <h2>Bring your first <em>story.</em></h2>
          <p className="lede">One recording is enough to begin. It stays private to your workspace.</p>
        </header>
      )}
      {!empty && <h2 className="newst-t">What are you making next?</h2>}

      {!projectId ? (
        <>
          <div className="chips" role="radiogroup" aria-label="Kind of story">
            {makers.map((m) => <button key={m.id} type="button" role="radio" aria-checked={kind === m.id} className={kind === m.id ? "on" : ""} onClick={() => setKind(m.id)}>{m.name}</button>)}
          </div>
          <p className="newst-brings"><span className="mono">You bring</span> {maker.brings} <ArrowRight /> <span className="mono">IZWI can help with</span> {maker.gets.slice(0, 3).join(", ").toLowerCase()}.</p>
          <label className="field newst-title">
            <span>Title <small>(optional: we use the file name)</small></span>
            <input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="Episode 4: The taxi rank" />
          </label>
          <div
            className={"drop up-drop" + (over ? " over" : "") + (empty ? " big" : "")}
            aria-busy={busy}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); void take(e.dataTransfer.files[0]); }}
          >
            <UploadSimple />
            <button type="button" className="btn" disabled={busy} onClick={() => input.current?.click()}>{busy ? "Starting your story..." : "Choose video or audio"}</button>
            <span>or drag and drop</span>
            <small>MP4, MOV, MP3 or WAV. If the signal drops, the upload resumes.</small>
          </div>
          <input ref={input} type="file" accept="video/*,audio/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; void take(f); }} />
          {error && <p className="form-err" role="alert">{error}</p>}
          <NextSteps />
          {!empty && <button type="button" className="link" onClick={() => { setOpen(false); setError(""); }}>Not now</button>}
        </>
      ) : (
        file && <Uploader projectId={projectId} file={file} showNext onDone={() => router.push(`/app/p/${projectId}`)} />
      )}
    </section>
  );
}
