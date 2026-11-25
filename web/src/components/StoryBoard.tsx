"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { storyScenes } from "@/lib/story-scenes";

export function StoryBoard({ projectId, script, refresh }: { projectId: string; script: string; refresh: () => Promise<void> }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [base, setBase] = useState(script);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const text = draft ?? script;
  const scenes = storyScenes(text);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setMessage("");
    setSaving(true);
    try {
      await api(`/api/projects/${projectId}`, { method: "PATCH", body: { script: text, previousScript: base } });
      await refresh();
      setDraft(null);
      setMessage("Storyboard saved to this project.");
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Could not save the storyboard.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="storyboard" id="storyboard" tabIndex={-1}>
      <form className="sb-script" onSubmit={(event) => void submit(event)}>
        <h2>Storyboard</h2>
        <label className="field"><span>Project script</span>
          <textarea rows={7} maxLength={12000} value={text} onChange={(event) => {
            if (draft === null) setBase(script);
            setDraft(event.target.value);
          }} />
        </label>
        <p className="sb-sum"><b>{scenes.length}</b> scenes · <b>{scenes.reduce((total, scene) => total + scene.seconds, 0)}</b> estimated seconds</p>
        <div className="st-row">
          <button className="btn" disabled={saving || text.trim() === script}>{saving ? "Saving…" : "Save storyboard"}</button>
          {draft !== null && <button type="button" className="btn btn-quiet" disabled={saving} onClick={() => { setDraft(null); setError(""); }}>Use saved script</button>}
        </div>
        {message && <p role="status">{message}</p>}
        {error && <p role="alert">{error}</p>}
      </form>
      <ol className="sb-scenes">
        {scenes.map((scene, index) => (
          <li key={index}>
            <h3>Scene {index + 1}</h3><p>{scene.text}</p><span className="mono">{scene.seconds}s</span>
          </li>
        ))}
        {scenes.length === 0 && <li className="fine">Write a sentence or a line for each scene.</li>}
      </ol>
    </section>
  );
}
