// Contract shared by the studio shell and its tabs. The state is exactly what GET /api/projects/:id returns.
import type { ProjectState } from "@/server/state";

export type { ProjectState };
export type TabId = "room" | "canvas" | "create" | "localise" | "protect" | "publish" | "earn";
export type PanelTarget = { kind: "clip" | "person" | "output" | "track" | "scene"; id: string };
export type EditTarget = { label: string; tab: TabId; focusId?: string };
export type TabProps = {
  state: ProjectState;
  /** Re-read the project from the server, e.g. after an action. */
  refresh: () => Promise<void>;
  /** Switch tabs, e.g. a "waiting on consent" chip jumps to Protect. */
  go: (tab: TabId) => void;
  target?: string;
};
