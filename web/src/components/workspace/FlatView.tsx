"use client";
// The Flat Studio route: the panels, the timeline and the agent panel on one project store.
// "Trim with AI…" only prefills the agent composer; it never sends on its own.
import { useCallback } from "react";
import { FlatStudio } from "@/components/flat/FlatStudio";
import { Timeline } from "@/components/timeline/Timeline";
import { AgentPanel } from "@/components/agent/AgentPanel";
import { askAgent } from "@/lib/agent-bus";
import { formatTime } from "@/lib/timecode";
import { useAssistantEnabled, useProjectStore } from "./ProjectProvider";

export function FlatView() {
  const store = useProjectStore();
  const assistant = useAssistantEnabled();
  const onAskAI = useCallback((ids: string[]) => {
    const clips = store.getState().state.clips.filter((c) => ids.includes(c.id));
    if (clips.length === 0) return;
    // Small local models propose more reliably when the scene is named with its range (Lane C walkthrough).
    const named = clips.map((c) => `"${c.title}" (${formatTime(c.startMs)}–${formatTime(c.endMs)})`).join(", ");
    askAgent(clips.length === 1 ? `Tighten the opening of the scene ${named}.` : `Tighten the openings of these scenes: ${named}.`);
  }, [store]);
  return <FlatStudio timeline={<Timeline onAskAI={assistant ? onAskAI : undefined} />} agent={<AgentPanel />} />;
}
