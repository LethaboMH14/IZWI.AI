"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { ArrowRight, Coins, Globe, InstagramLogo, LockSimple, LockSimpleOpen, Scissors, TiktokLogo, YoutubeLogo } from "@phosphor-icons/react";
import { JOB_LABEL, clock, media, rand } from "@/lib/format";
import { langName } from "@/lib/languages";
import type { ProjectState, TabId } from "./types";

const Scene = dynamic(() => import("@/app/design/mockups/story-room/StoryRoomScene").then((module) => module.StoryRoomScene), { ssr: false });
export const STATIONS = [
  { id: "create", label: "Create" }, { id: "localise", label: "Localise" }, { id: "protect", label: "Protect" },
  { id: "publish", label: "Publish" }, { id: "earn", label: "Earn" },
] as const;

type Stage = typeof STATIONS[number]["id"];
type Stages = Record<Stage, { status: string; hint: string }>;

export function ProjectLobby({ state, stages, go }: { state: ProjectState; stages: Stages; go: (tab: TabId) => void }) {
  const [flat, setFlat] = useState(true);
  const [hover, setHover] = useState<number | null>(null);
  const [entering, setEntering] = useState<TabId | null>(null);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 900px) and (prefers-reduced-motion: no-preference)");
    const update = () => setFlat(!media.matches || !!(navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!entering) return;
    const timer = window.setTimeout(() => go(entering), 260);
    return () => window.clearTimeout(timer);
  }, [entering, go]);

  const open = (tab: TabId) => {
    if (flat) go(tab);
    else setEntering(tab);
  };
  const jobs = state.jobs.filter((job) => job.status === "running" || job.status === "queued");
  const languages = [...new Set([
    ...state.tracks.filter((track) => track.kind !== "source").map((track) => track.language),
    ...jobs.flatMap((job) => job.type === "translate" && typeof job.input.language === "string" ? [job.input.language] : []),
  ])].map(langName);
  const held = state.clips.filter((clip) => clip.status !== "dropped" && !clip.gate.ok).length;
  const cleared = state.clips.filter((clip) => clip.status !== "dropped" && clip.gate.ok).length;
  const enquiries = state.listings.reduce((sum, listing) => sum + listing.enquiries.length, 0);
  const askingPrices = state.listings.flatMap((listing) =>
    listing.enabled && listing.askingPriceCents != null ? [listing.askingPriceCents] : []);
  const topPrice = askingPrices.length ? Math.max(...askingPrices) : 0;
  const priceLabel = askingPrices.length ? `${rand(Math.min(...askingPrices))}${new Set(askingPrices).size > 1 ? ` – ${rand(topPrice)}` : ""} asking price` : "Pricing by enquiry";
  const posted = [...new Set(state.outputs.flatMap((output) => output.posted?.platform ? [output.posted.platform] : []))];
  const suggested = state.clips.find((clip) => clip.status === "suggested");
  const proposed = state.plans.find((plan) => plan.status === "proposed");
  const next = !state.source || !state.lines.length || suggested || stages.create.status !== "done" ? "create"
    : held ? "protect" : stages.localise.status === "draft" ? "localise" : stages.publish.status !== "done" ? "publish" : "earn";
  const nextAction = !state.source ? state.project.script ? "Review storyboard" : "Start your storyboard" : !state.lines.length ? "Open the transcript editor" : suggested ? "Review suggested cuts"
    : next === "create" ? "Keep a clip" : next === "protect" ? "Open rights and consent" : next === "localise" ? "Review language drafts"
      : next === "publish" ? "Review export options" : "Open licensing enquiries";
  const Lock = cleared && !held ? LockSimpleOpen : LockSimple;
  const glyphs = [
    <Scissors key="cut" />, <Globe key="globe" />, <Lock key="lock" />,
    <span key="phone" className="room-phone"><TiktokLogo /><InstagramLogo /><YoutubeLogo /></span>,
    <Coins key="coins" style={{ scale: 1 + Math.min(0.6, topPrice ? Math.log10(1 + topPrice / 100) * 0.16 : 0) }} />,
  ];
  const hints = [
    suggested ? suggested.title : state.project.script && !state.source ? "Storyboard saved" : stages.create.hint,
    languages.length ? languages.join(" · ") : stages.localise.hint,
    held || cleared ? `${held} held · ${cleared} clear` : stages.protect.hint,
    posted.length ? `Recorded posts · ${posted.join(", ")}` : stages.publish.hint,
    `${enquiries} licence ${enquiries === 1 ? "enquiry" : "enquiries"} · ${priceLabel}`,
  ];

  return (
    <section className={`project-lobby${entering ? " entering" : ""}`} aria-label="Story Room">
      <div className="room-intro">
        <p className="mono">Story Room</p>
        <h1>{state.project.title}</h1>
        {state.source && <p className="room-source">{state.source.filename} · {clock(state.source.durationMs)}</p>}
        {state.poster && <div className="room-poster">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={media(state.poster.id)} alt="" />
        </div>}
        <div className="room-next">
          <span>Next in {STATIONS.find((station) => station.id === next)?.label}</span>
          <button type="button" className="link" onClick={() => open(next)}>{nextAction} <ArrowRight /></button>
          {suggested && <p>{suggested.reason}</p>}
        </div>
        <button type="button" className="btn btn-lg" onClick={() => open("canvas")}>Enter studio <ArrowRight weight="bold" /></button>
      </div>
      <div className="room-world">
        {!flat && <Scene selected={hover ?? STATIONS.findIndex((station) => station.id === next)}
          onSelect={setHover} onFail={() => setFlat(true)} showLabels={false} waveform={state.peaks} />}
        <div className={`room-core${flat ? " flat" : ""}`}>
          <div className="room-ring" aria-hidden="true" />
          <div className="room-pulse">
            <b>{jobs.length ? `${jobs.length} ${jobs.length === 1 ? "job" : "jobs"} underway` : "Project activity"}</b>
            {jobs.length > 0 ? <ul>{jobs.slice(0, 3).map((job) => <li key={job.id}>{JOB_LABEL[job.type] ?? job.type} · {job.stage ?? job.status}</li>)}</ul>
              : <p>{proposed ? "An agent plan is ready to review in the editor." : suggested ? "A suggested cut is waiting for review." : "No jobs running"}</p>}
          </div>
        </div>
        <ol className="room-stations">
          {STATIONS.map((station, index) => (
            <li key={station.id}>
              <button type="button" className={`room-station s-${stages[station.id].status}${entering === station.id ? " entering" : ""}`}
                onPointerEnter={() => setHover(index)} onPointerLeave={() => setHover(null)}
                onFocus={() => setHover(index)} onBlur={() => setHover(null)} onClick={() => open(station.id)}>
                <span className="room-icon" aria-hidden="true">{glyphs[index]}</span>
                <b>{station.label}</b>
                <small>{hints[index]}</small>
              </button>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
