"use client";

import { useMemo, useState } from "react";
import { FilmSlate } from "@phosphor-icons/react";

const starter = "A girl in Soweto finds an old radio in her gogo's kitchen. When she turns the dial, voices from every corner of Africa answer. She records her own story and sends it back. By morning, the whole street is listening.";
const WPM = 150;

// Script in, timed scene list out. The split and the timing are real; frames need a video model on a GPU.
export function StoryBoard() {
  const [script, setScript] = useState(starter);
  const scenes = useMemo(() => script.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean).map((s) => ({ text: s, sec: Math.max(2, Math.round((s.split(/\s+/).length / WPM) * 60)) })), [script]);
  const total = scenes.reduce((a, s) => a + s.sec, 0);
  return (
    <section className="storyboard">
      <div className="sb-script">
        <h2>Start from a script, or just an idea.</h2>
        <label className="field"><span>Your story</span><textarea rows={7} value={script} onChange={(e) => setScript(e.target.value)} /></label>
        <p className="sb-sum"><b>{scenes.length}</b> scenes · <b>{total}</b> seconds at a speaking pace of {WPM} words a minute</p>
        <button className="btn btn-lg" disabled><FilmSlate /> Animate these scenes</button>
        <p className="fine">Scene splitting and timing work now. Moving frames are planned: they need Wan 2.1 or LTX-Video on a GPU service, which is not connected.</p>
      </div>
      <ol className="sb-scenes">
        {scenes.map((s, i) => (
          <li key={i} style={{ ["--i" as string]: i }}>
            <div className="sb-frame"><span className="mono">Scene {i + 1}</span><em>frame not generated</em></div>
            <p>{s.text}</p>
            <span className="mono">{s.sec}s</span>
          </li>
        ))}
        {scenes.length === 0 && <li className="fine">Write a sentence to see the first scene.</li>}
      </ol>
    </section>
  );
}
