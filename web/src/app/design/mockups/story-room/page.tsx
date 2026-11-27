"use client";
// MOCKUP: landing Story Room (3D on desktop, 2D on phones). Sample data. See docs/plans (v3 §4).
// ?mode=2d forces the flat room so the fallback can be reviewed on a laptop too.
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowRight, ArrowLeft, Cube, Square } from "@phosphor-icons/react";
import { Mark } from "@/components/Mark";
import { PILLARS, EPISODE, clock } from "../sample";
import { StoryRoom2D } from "./StoryRoom2D";
import "../mockups.css";

const StoryRoomScene = dynamic(() => import("./StoryRoomScene").then((m) => m.StoryRoomScene), { ssr: false });

type Why = "phone" | "forced" | "nogl" | "motion" | "data" | null;

export default function StoryRoomMockup() {
  const [i, setI] = useState(0);
  const [three, setThree] = useState(false);
  const [why, setWhy] = useState<Why>(null);

  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    const reason: Why = q.get("mode") === "2d" ? "forced"
      : window.innerWidth < 760 ? "phone"
      : window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "motion"
      : conn?.saveData ? "data"
      : null;
    // decided after mount (the server always renders the flat room); deferred one frame
    const raf = requestAnimationFrame(() => { setWhy(reason); setThree(reason === null); });
    return () => cancelAnimationFrame(raf);
  }, []);

  const p = PILLARS[i];
  const go = (d: number) => setI((x) => (x + d + PILLARS.length) % PILLARS.length);
  const note: Record<Exclude<Why, null>, string> = {
    phone: "You're on a phone, so the room is flat. It uses a few KB, not megabytes.",
    forced: "Flat room, as shown on phones and with data saver.",
    nogl: "This browser can't draw 3D, so the room is flat.",
    motion: "Reduced motion is on, so the room is flat and still.",
    data: "Data saver is on, so the room is flat.",
  };

  return (
    <main className={"sr" + (three ? " is-3d" : " is-2d")} onKeyDown={(e) => { if (e.key === "ArrowRight") go(1); if (e.key === "ArrowLeft") go(-1); }}>
      <header className="nav">
        <Mark />
        <nav aria-label="Main">
          <a href="#">Who it is for</a>
          <a href="#">How it connects</a>
          <a href="#">Pricing</a>
          <a href="#">Trust</a>
        </nav>
        <div className="nav-cta">
          <Link href="#" className="link">Sign in</Link>
          <Link href="#" className="btn">Try IZWI AI <ArrowRight weight="bold" /></Link>
        </div>
      </header>

      {three ? <StoryRoomScene selected={i} onSelect={setI} onFail={() => { setThree(false); setWhy("nogl"); }} shift={1.5} /> : null}

      <section className="sr-copy">
        <p className="sr-eyebrow">Built for South African creators</p>
        <h1>Turn one story into <em>many.</em></h1>
        <p className="sr-lede">Walk around the room. The voice in the middle is one episode. Each station is something IZWI does with it.</p>
        <div className="sr-cta">
          <Link href="#" className="btn btn-lg">Try IZWI AI <ArrowRight weight="bold" /></Link>
          <span className="sr-ep mono">{EPISODE.show} · {EPISODE.title} · {clock(EPISODE.durationMs)}</span>
        </div>
      </section>

      {!three && <StoryRoom2D selected={i} onSelect={setI} />}

      <aside className="sr-card" aria-live="polite" style={{ ["--pc" as string]: p.color }}>
        <div className="sr-card-top">
          <span className="sr-num mono">{String(i + 1).padStart(2, "0")} / 05</span>
          <span className={"sr-chip" + (p.planned ? " planned" : "")}>{p.chip}</span>
        </div>
        <h2>{p.name}</h2>
        <p className="sr-line">{p.line}</p>
        <p className="sr-body">{p.body}</p>
        <div className="sr-card-foot">
          <button type="button" className="sr-step" onClick={() => go(-1)} aria-label="Previous station"><ArrowLeft weight="bold" /></button>
          <button type="button" className="sr-step" onClick={() => go(1)} aria-label="Next station"><ArrowRight weight="bold" /></button>
          <Link href="#" className="link">{p.planned ? "See what's planned" : `Open ${p.name}`} <ArrowRight /></Link>
        </div>
      </aside>

      <div className="sr-dock">
        <ol className="sr-dots" aria-label="Stations">
          {PILLARS.map((x, k) => (
            <li key={x.id}><button type="button" aria-label={x.name} aria-current={k === i} className={k === i ? "on" : ""} onClick={() => setI(k)} style={{ ["--pc" as string]: x.color }} /></li>
          ))}
        </ol>
        <p className="sr-hint mono">{three ? "Drag to turn · scroll · tap a station · ← →" : why ? note[why] : "Tap a station · ← →"}</p>
        {three
          ? <Link href="?mode=2d" className="sr-mode" onClick={(e) => { e.preventDefault(); setThree(false); setWhy("forced"); }}><Square /> Flat room</Link>
          : why !== "phone" && why !== "nogl" ? <Link href="?" className="sr-mode" onClick={(e) => { e.preventDefault(); setThree(true); setWhy(null); }}><Cube /> Turn on 3D</Link>
          : null}
      </div>

      <span className="prototag"><i /> mockup · sample data · not the final build</span>
    </main>
  );
}
