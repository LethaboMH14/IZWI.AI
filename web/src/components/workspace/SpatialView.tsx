"use client";
// Spatial Canvas: the project graph over the night backdrop, with the compact timeline and the agent card.
import { SpatialCanvas } from "@/components/spatial/SpatialCanvas";
import { Backdrop } from "@/components/scene3d/Backdrop";
import { Timeline } from "@/components/timeline/Timeline";
import { AgentPanel } from "@/components/agent/AgentPanel";

export function SpatialView({ restoreEnabled }: { restoreEnabled: boolean }) {
  return <SpatialCanvas restoreEnabled={restoreEnabled} backdrop={<Backdrop />} timeline={<Timeline compact />} agentCard={<AgentPanel variant="card" />} />;
}
