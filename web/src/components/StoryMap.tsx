"use client";

import { useState } from "react";
import { clips as demoClips, leaves as demoLeaves, langName as demoLang, project, statusLabel } from "@/lib/demo";
import type { TabId } from "./studio/types";
import { StoryGraph, type LiveMap } from "./studio/StoryGraph";

// "Turn one story into many", drawn literally: one source, its clips, and every output.
// Each leaf states where it honestly stands. Hover or focus a leaf to trace it back.
// Without `live` it draws the sample story for the landing page. With `live` it draws a real project.
export type { LiveMap } from "./studio/StoryGraph";

type Status = "done" | "draft" | "blocked" | "planned" | "off";
type Model = {
  title: string; sub: string; aria: string;
  clips: { id: string; label: string; sub: string; suggested: boolean }[];
  leaves: { id: string; clip: string | null; label: string; sub: string; status: Status }[];
};

const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

function demoModel(): Model {
  return {
    title: project.title, sub: `${project.duration} source`,
    aria: `${project.title} splits into ${demoClips.length} clips and ${demoLeaves.length} outputs`,
    clips: demoClips.map((c, i) => ({ id: c.id, label: `Clip ${i + 1}`, sub: `${c.in} to ${c.out}`, suggested: false })),
    leaves: demoLeaves.map((l) => ({ id: l.id, clip: l.clip, label: `${demoLang[l.lang]} · ${l.format}`, sub: `${statusLabel[l.status]} · ${l.dest}`, status: l.status as Status })),
  };
}

const W = 1000;
const src = { x: 70 };
const curve = (x1: number, y1: number, x2: number, y2: number) => {
  const m = (x1 + x2) / 2;
  return `M${x1},${y1} C${m},${y1} ${m},${y2} ${x2},${y2}`;
};

export function StoryMap({ compact = false, live, onOpen }: { compact?: boolean; live?: LiveMap; onOpen?: (to: TabId) => void }) {
  if (live) return <StoryGraph live={live} onOpen={onOpen} />;
  return <SampleMap compact={compact} />;
}

function SampleMap({ compact }: { compact: boolean }) {
  const [hot, setHot] = useState<string | null>(null);
  const m = demoModel();
    const H = 440;
  const srcY = H / 2;
  const clipY = (i: number) => (90 + i * 130);
  const leafY = (i: number) => (40 + i * 60);
  const hotLeaf = m.leaves.find((l) => l.id === hot);
  const clipIdx = (id: string | null) => m.clips.findIndex((c) => c.id === id);
  return (
    <div className={"storymap" + (compact ? " compact" : "")}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={m.aria}>
        {m.clips.map((c, i) => (
          <path key={c.id} className={"sm-trunk" + (hotLeaf && hotLeaf.clip !== c.id ? " dim" : "")} d={curve(src.x + 60, srcY, 330, clipY(i))} />
        ))}
        {m.leaves.map((l, i) => {
          const ci = clipIdx(l.clip);
          const from = ci >= 0 ? { x: 470, y: clipY(ci) } : { x: src.x + 60, y: srcY };
          return <path key={l.id} className={`sm-branch s-${l.status}` + (hot && hot !== l.id ? " dim" : "") + (hot === l.id ? " hot" : "")} d={curve(from.x, from.y, 640, leafY(i))} />;
        })}
        <g className="sm-src">
          <rect x={src.x - 58} y={srcY - 46} width="118" height="92" rx="18" />
          <text x={src.x} y={srcY - 8} textAnchor="middle" className="sm-t1">{cut(m.title, 11)}<title>{m.title}</title></text>
          <text x={src.x} y={srcY + 14} textAnchor="middle" className="sm-t2">{m.sub}</text>
        </g>
        {m.clips.map((c, i) => (
          <g key={c.id} className={"sm-clip" + (c.suggested ? " sug" : "") + (hotLeaf && hotLeaf.clip !== c.id ? " dim" : "")}>
            <rect x="330" y={clipY(i) - 24} width="140" height="48" rx="24" />
            <text x="400" y={clipY(i) - 2} textAnchor="middle" className="sm-t3">{c.label}</text>
            <text x="400" y={clipY(i) + 13} textAnchor="middle" className="sm-t2">{c.sub}</text>
          </g>
        ))}
        {m.leaves.map((l, i) => (
          <g key={l.id} className={`sm-leaf s-${l.status}` + (hot && hot !== l.id ? " dim" : "")} tabIndex={0}
            onMouseEnter={() => setHot(l.id)} onMouseLeave={() => setHot(null)} onFocus={() => setHot(l.id)} onBlur={() => setHot(null)}>
            <rect x="630" y={leafY(i) - 24} width="360" height="48" rx="12" className="sm-hit" />
            <circle cx="648" cy={leafY(i)} r="7" />
            <text x="668" y={leafY(i) - 3} className="sm-t3">{l.label}</text>
            <text x="668" y={leafY(i) + 13} className="sm-t2">{l.sub}</text>
          </g>
        ))}
      </svg>
      <ul className="sm-list">
        {m.leaves.map((l) => (
          <li key={l.id} className={`s-${l.status}`}>
            <i /> <b>{clipIdx(l.clip) >= 0 ? `${m.clips[clipIdx(l.clip)].label} · ` : ""}{l.label}</b>
            <span>{l.sub}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
