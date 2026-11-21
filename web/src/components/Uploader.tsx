"use client";
// Resumable upload (tus). Shows only what tus reports: bytes confirmed by the server. Nothing is estimated ahead of time.
// A reload loses the File object (browsers cannot keep it), so after a reload the person picks the same file again and
// findPreviousUploads() continues from the last confirmed byte.
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import * as tus from "tus-js-client";
import { ArrowClockwise, CheckCircle, FileVideo, Pause, Play, UploadSimple, WifiSlash } from "@phosphor-icons/react";
import { bytes } from "@/lib/format";
import "@/app/entry.css";

type Phase = "idle" | "uploading" | "paused" | "waiting" | "done" | "error";
type Fail = { message: string; signedOut?: boolean; retry: boolean };

const MB = 1024 * 1024;
const AUDIO_VIDEO_EXT = /\.(mp4|mov|m4v|webm|mkv|avi|mp3|m4a|aac|wav|ogg|opus|flac|3gp)$/i;

const mbs = (n: number) => (n / MB).toFixed(n >= 100 * MB ? 0 : 1);

function remaining(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) return "";
  if (sec < 5) return "a few seconds left";
  if (sec < 60) return `${Math.round(sec / 5) * 5} s left`;
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} min left`;
  return `${Math.floor(m / 60)} h ${m % 60} min left`;
}

function explain(err: Error | tus.DetailedError): Fail {
  const d = err as tus.DetailedError;
  const status = d.originalResponse?.getStatus() ?? 0;
  const body = (d.originalResponse?.getBody() ?? "").trim().slice(0, 160);
  if (status === 401) return { message: "You are signed out. Sign in again, then choose the same file. It continues from where it stopped.", signedOut: true, retry: false };
  if (status === 415) return { message: "That is not a video or audio file. Try MP4, MOV, MP3 or WAV.", retry: false };
  if (status === 413) return { message: "That file is larger than this workspace allows. Try a shorter recording or a lower-resolution export.", retry: false };
  if (status === 404) return { message: body || "This story was not found in your workspace. Refresh the page and try again.", retry: false };
  if (status === 403) return { message: "Your role cannot upload to this workspace.", retry: false };
  if (status === 0) return { message: "The connection dropped and did not come back. Your progress is kept: press Try again when you have signal.", retry: true };
  return { message: body || `The upload stopped (error ${status}). Your progress is kept: try again.`, retry: true };
}

export function NextSteps() {
  return (
    <ol className="up-next" aria-label="What happens after the upload">
      <li><i>1</i><span>We make a light preview, so the studio opens fast on a phone.</span></li>
      <li><i>2</i><span>We listen and write a transcript with word timing.</span></li>
      <li><i>3</i><span>We suggest clips. You keep, trim or drop each one.</span></li>
    </ol>
  );
}

// `file` starts that file at once (used when the person already dropped it); `showNext` hides the "what happens next" list.
export function Uploader({ projectId, onDone, hint, file: initialFile, showNext = true }: { projectId: string; onDone?: (assetName: string) => void; hint?: string; file?: File; showNext?: boolean }) {
  const [phase, setPhase] = useState<Phase>(initialFile ? "uploading" : "idle");
  const [file, setFile] = useState<File | null>(initialFile ?? null);
  const [sent, setSent] = useState(0);
  const [total, setTotal] = useState(initialFile?.size ?? 0);
  const [speed, setSpeed] = useState(0);
  const [resumedAt, setResumedAt] = useState<number | null>(null);
  const [fail, setFail] = useState<Fail | null>(null);
  const [over, setOver] = useState(false);
  const online = useSyncExternalStore(
    (cb) => { window.addEventListener("online", cb); window.addEventListener("offline", cb); return () => { window.removeEventListener("online", cb); window.removeEventListener("offline", cb); }; },
    () => navigator.onLine,
    () => true,
  );

  const up = useRef<tus.Upload | null>(null);
  const samples = useRef<{ t: number; b: number }[]>([]);
  const resumedFlag = useRef(false);
  const userPaused = useRef(false);
  const phaseRef = useRef<Phase>(initialFile ? "uploading" : "idle");
  const doneCalled = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const onDoneRef = useRef(onDone);
  useEffect(() => { onDoneRef.current = onDone; }, [onDone]);
  const go = useCallback((p: Phase) => { phaseRef.current = p; setPhase(p); }, []);

  const begin = useCallback(async (f: File) => {
    if (!(f.type.startsWith("video/") || f.type.startsWith("audio/") || AUDIO_VIDEO_EXT.test(f.name))) {
      setFile(f);
      setFail({ message: `${f.name} is not a video or audio file. Try MP4, MOV, MP3 or WAV.`, retry: false });
      go("error");
      return;
    }
    setFile(f); setSent(0); setTotal(f.size); setSpeed(0); setFail(null); setResumedAt(null);
    samples.current = []; resumedFlag.current = false; userPaused.current = false; doneCalled.current = false;
    const offline = typeof navigator !== "undefined" && !navigator.onLine;
    const u = new tus.Upload(f, {
      endpoint: "/api/upload",
      chunkSize: 8 * MB,
      retryDelays: [0, 3000, 10000, 30000],
      metadata: { projectId, filename: f.name, filetype: f.type || "application/octet-stream" },
      // The default fingerprint is the file; add the story so the same file in two stories never shares an upload.
      fingerprint: async (file, options) => `${await tus.defaultOptions.fingerprint(file, options)}::${projectId}`,
      removeFingerprintOnSuccess: true,
      onProgress: (b, t) => {
        if (resumedFlag.current) { resumedFlag.current = false; if (b > 0) setResumedAt(b); }
        const now = Date.now();
        const s = samples.current;
        s.push({ t: now, b });
        while (s.length > 2 && now - s[0].t > 5000) s.shift();
        if (s.length >= 2 && now > s[0].t) setSpeed(((b - s[0].b) / (now - s[0].t)) * 1000);
        setSent(b); setTotal(t);
      },
      onSuccess: () => {
        setSent(f.size); setSpeed(0);
        go("done");
        if (!doneCalled.current) { doneCalled.current = true; onDoneRef.current?.(f.name); }
      },
      onError: (err) => {
        if (typeof navigator !== "undefined" && !navigator.onLine) { go("waiting"); return; }
        setFail(explain(err));
        setSpeed(0);
        go("error");
      },
    });
    up.current = u;
    try {
      const prev = await u.findPreviousUploads();
      if (prev.length) { u.resumeFromPreviousUpload(prev[0]); resumedFlag.current = true; }
    } catch { /* storage unavailable: start from zero */ }
    if (up.current !== u) return; // replaced or reset while we were looking up earlier uploads
    if (offline) { go("waiting"); return; }
    go("uploading");
    u.start();
  }, [projectId, go]);

  useEffect(() => {
    let live = true;
    if (initialFile) queueMicrotask(() => { if (live) void begin(initialFile); });
    return () => { live = false; up.current?.abort(); up.current = null; };
  }, [initialFile, begin]);

  // Signal comes and goes: stop cleanly, say so, and carry on by itself when it returns (unless the person paused).
  useEffect(() => {
    const off = () => {
      if (phaseRef.current === "uploading") { up.current?.abort(); samples.current = []; setSpeed(0); go("waiting"); }
    };
    const on = () => {
      if (phaseRef.current === "waiting" && !userPaused.current && up.current) { go("uploading"); up.current.start(); }
    };
    window.addEventListener("offline", off);
    window.addEventListener("online", on);
    return () => { window.removeEventListener("offline", off); window.removeEventListener("online", on); };
  }, [go]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (phaseRef.current === "uploading") e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => { window.removeEventListener("beforeunload", warn); up.current?.abort(); };
  }, []);

  const pause = () => { userPaused.current = true; up.current?.abort(); samples.current = []; setSpeed(0); go("paused"); };
  const resume = () => {
    userPaused.current = false;
    if (!navigator.onLine) { go("waiting"); return; }
    go("uploading"); samples.current = []; up.current?.start();
  };
  const retry = () => { if (file) void begin(file); };
  const reset = () => { up.current?.abort(); up.current = null; setFile(null); setFail(null); setSent(0); go("idle"); };

  const pct = total > 0 ? Math.min(100, Math.floor((sent / total) * 100)) : 0;
  const left = speed > 0 ? (total - sent) / speed : NaN;
  const active = phase === "uploading" || phase === "paused" || phase === "waiting";

  return (
    <div className={"uploader u-" + phase} aria-live="polite">
      {(phase === "idle" || (phase === "error" && !file)) && (
        <div
          className={"drop up-drop" + (over ? " over" : "")}
          role="button"
          tabIndex={0}
          aria-label="Choose a video or audio file to upload"
          onClick={() => input.current?.click()}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.current?.click(); } }}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) void begin(f); }}
        >
          <UploadSimple />
          <b>Drop a video or audio file</b>
          <span className="btn" aria-hidden="true">Choose a file</span>
          <small>{hint ?? "MP4, MOV, MP3 or WAV. If the signal drops, the upload resumes. After a reload, choose the same file and it continues."}</small>
        </div>
      )}
      <input ref={input} type="file" accept="video/*,audio/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void begin(f); }} />

      {file && phase !== "idle" && (
        <div className="up-card">
          <div className="up-head">
            {phase === "done" ? <CheckCircle weight="fill" className="ok" /> : phase === "waiting" ? <WifiSlash /> : <FileVideo weight="fill" />}
            <div>
              <b className="up-name">{file.name}</b>
              <span className="mono">{bytes(file.size)}</span>
            </div>
          </div>

          {phase !== "error" && (
            <>
              <div className="up-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Upload progress">
                <i style={{ width: `${pct}%` }} />
              </div>
              <div className="up-meta">
                <span className="mono">{mbs(sent)} of {mbs(total)} MB · {pct}%</span>
                {phase === "uploading" && speed > 0 && <span className="mono">{(speed / MB).toFixed(1)} MB/s{Number.isFinite(left) ? ` · ${remaining(left)}` : ""}</span>}
              </div>
            </>
          )}

          {resumedAt !== null && phase !== "done" && <p className="up-note">Resuming from {mbs(resumedAt)} MB. Nothing before that is sent again.</p>}
          {phase === "waiting" && <p className="up-note warn"><WifiSlash /> Waiting for signal. {online ? "Trying again shortly." : "It continues by itself when you are back online."}</p>}
          {phase === "paused" && <p className="up-note">Paused at {mbs(sent)} MB. Resume whenever you are ready.</p>}
          {phase === "done" && <p className="up-note ok">Uploaded. We are reading the file now.</p>}
          {phase === "error" && fail && (
            <p className="up-note err" role="alert">
              {fail.message}{" "}
              {fail.signedOut && <Link className="link" href={`/sign-in?next=${encodeURIComponent(typeof window === "undefined" ? "/app" : window.location.pathname)}`}>Sign in</Link>}
            </p>
          )}

          <div className="up-actions">
            {phase === "uploading" && <button type="button" className="btn btn-quiet" onClick={pause}><Pause weight="fill" /> Pause</button>}
            {(phase === "paused") && <button type="button" className="btn" onClick={resume}><Play weight="fill" /> Resume</button>}
            {phase === "error" && fail?.retry && <button type="button" className="btn" onClick={retry}><ArrowClockwise weight="bold" /> Try again</button>}
            {(active || phase === "error") && <button type="button" className="link" onClick={reset}>Choose another file</button>}
          </div>
        </div>
      )}

      {showNext && <NextSteps />}
    </div>
  );
}
