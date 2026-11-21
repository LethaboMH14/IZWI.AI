"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "@phosphor-icons/react";
import { lines, langName, type Lang } from "@/lib/demo";

export type CapMode = "src" | "en" | "zu";
const LINE_MS = 3400;

// Plays the sample captions word by word over the still frame.
// "src" keeps code-switching as spoken and tints each word by language.
export function CaptionPlayer({ mode, image = "/img/naledi-tall.jpg", tall = true, onLine }: { mode: CapMode; image?: string; tall?: boolean; onLine?: (i: number) => void }) {
  const [playing, setPlaying] = useState(() => typeof window === "undefined" || !window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [ms, setMs] = useState(0);
  const last = useRef(0);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    last.current = performance.now();
    const tick = (now: number) => {
      const step = Math.max(0, Math.min(100, now - last.current));
      setMs((m) => (m + step) % (LINE_MS * lines.length));
      last.current = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const idx = Math.max(0, Math.min(lines.length - 1, Math.floor(ms / LINE_MS)));
  const line = lines[idx];
  const frac = (ms % LINE_MS) / LINE_MS;
  useEffect(() => { onLine?.(idx); }, [idx, onLine]);

  const words: { t: string; l: Lang }[] =
    mode === "src" ? line.words : (mode === "en" ? line.en : line.zu).split(" ").map((t) => ({ t, l: mode as Lang }));
  const lit = Math.ceil(Math.min(1, frac / 0.78) * words.length);

  return (
    <figure className={"capplayer" + (tall ? " tall" : "")}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={image} alt="Naledi, a fictional Johannesburg podcaster, speaking into a studio microphone" className={playing ? "kb" : ""} />
      <figcaption aria-live="off">
        <p key={line.id + mode}>
          {words.map((wd, i) => (
            <span key={i} className={`w l-${wd.l}` + (i < lit ? " lit" : "")}>{wd.t} </span>
          ))}
        </p>
      </figcaption>
      <div className="capbar">
        <button type="button" onClick={() => setPlaying((p) => !p)} aria-label={playing ? "Pause captions" : "Play captions"}>
          {playing ? <Pause weight="fill" /> : <Play weight="fill" />}
        </button>
        <span className="mono">{line.at} / 28:16</span>
        <span className="capmode">{mode === "src" ? "As spoken" : mode === "en" ? "English · reviewed" : `${langName.zu} · draft`}</span>
      </div>
      <i className="capprog" style={{ transform: `scaleX(${(ms / (LINE_MS * lines.length)).toFixed(4)})` }} />
    </figure>
  );
}
