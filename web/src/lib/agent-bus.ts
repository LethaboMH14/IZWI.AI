"use client";
// A tiny bus so other panels (the timeline's "Trim with AI…") can prefill and focus the agent composer.
// If no composer is mounted yet, the text waits and is delivered to the first one that subscribes. It never sends.
import { useEffect, useRef } from "react";

type Handler = (text: string) => void;
const handlers = new Set<Handler>();
let waiting: string | null = null;

export function askAgent(text: string): void {
  if (handlers.size === 0) { waiting = text; return; }
  for (const h of [...handlers]) h(text);
}

export function useAgentAsk(handler: Handler): void {
  const ref = useRef(handler);
  useEffect(() => { ref.current = handler; });
  useEffect(() => {
    const h: Handler = (t) => ref.current(t);
    handlers.add(h);
    if (waiting !== null) { const t = waiting; waiting = null; h(t); }
    return () => { handlers.delete(h); };
  }, []);
}
