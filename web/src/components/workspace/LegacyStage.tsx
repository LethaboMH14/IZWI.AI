"use client";
// Wave 0 bridge: runs today's working tab components inside the new frame, on the new store, so the whole demo
// journey works end to end before each stage is rebuilt in the new design (PLAN.md, Wave 0 item 7).
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import type { TabId } from "@/components/studio/types";
import { CanvasTab } from "@/components/studio/CanvasTab";
import { CreateTab } from "@/components/studio/CreateTab";
import { LocaliseTab } from "@/components/studio/LocaliseTab";
import { ProtectTab } from "@/components/studio/ProtectTab";
import { PublishTab } from "@/components/studio/PublishTab";
import { EarnTab } from "@/components/studio/EarnTab";
import { AssistantPanel } from "@/components/studio/AssistantPanel";
import { useAssistantEnabled, useProject, useProjectStore } from "./ProjectProvider";
import "@/app/studio.css";

const ROUTE: Record<TabId, string> = { canvas: "/spatial", create: "", localise: "/localise", protect: "/protect", publish: "/publish", earn: "/earn" };
const BODY = { canvas: CanvasTab, create: CreateTab, localise: LocaliseTab, protect: ProtectTab, publish: PublishTab, earn: EarnTab } as const;

export function LegacyStage({ tab }: { tab: TabId }) {
  const router = useRouter();
  const assistant = useAssistantEnabled();
  const store = useProjectStore();
  const id = useProject((s) => s.id);
  const state = useProject((s) => s.state);
  const refresh = useCallback(() => store.getState().refresh(), [store]);
  const go = useCallback((t: TabId) => router.push(`/app/p/${id}${ROUTE[t]}`), [router, id]);
  const Body = BODY[tab];
  return (
    <div className="legacy-stage">
      <Body state={state} refresh={refresh} go={go} />
      <AssistantPanel enabled={assistant} projectId={id} tab={tab} refresh={refresh} />
    </div>
  );
}
