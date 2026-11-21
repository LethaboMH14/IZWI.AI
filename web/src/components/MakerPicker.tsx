"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight } from "@phosphor-icons/react";
import { makers } from "@/lib/platform";

// "What are you making?" The answer changes what a story turns into. Podcast is one of seven, not the product.
export function MakerPicker({ cta = "/welcome" }: { cta?: string }) {
  const [id, setId] = useState("podcast");
  const m = makers.find((x) => x.id === id)!;
  return (
    <div className="makers">
      <div className="mk-tabs" role="tablist" aria-label="What are you making?">
        {makers.map((x) => <button key={x.id} role="tab" aria-selected={id === x.id} className={id === x.id ? "on" : ""} onClick={() => setId(x.id)}>{x.name}</button>)}
      </div>
      <div className="mk-body" key={id}>
        <p className="mk-pain">{m.pain}</p>
        <div className="mk-flow">
          <span className="mk-in">{m.brings}</span>
          <svg viewBox="0 0 120 120" preserveAspectRatio="none" aria-hidden="true">
            {m.gets.map((_, i) => <path key={i} style={{ ["--i" as string]: i }} pathLength={1} d={`M0,60 C60,60 60,${15 + (i * 90) / Math.max(1, m.gets.length - 1)} 120,${15 + (i * 90) / Math.max(1, m.gets.length - 1)}`} />)}
          </svg>
          <ul>{m.gets.map((g, i) => <li key={g} style={{ ["--i" as string]: i }}>{g}</li>)}</ul>
        </div>
        <Link href={cta} className="link">Start a {m.name.toLowerCase()} story <ArrowRight /></Link>
      </div>
    </div>
  );
}
