"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useStore } from "zustand";
import type { StoreApi } from "zustand/vanilla";
import type { ProjectState } from "@/server/state";
import { createPlayheadStore, createProjectStore, type PlayheadState, type ProjectStoreState } from "@/lib/project-store";

type Stores = { project: StoreApi<ProjectStoreState>; playhead: StoreApi<PlayheadState> };
const ProjectContext = createContext<Stores | null>(null);
// The runtime kill switch, read by the server layout on each request (server/flags.ts).
const AssistantContext = createContext(false);

export function ProjectProvider({ id, initial, assistant = false, children }: { id: string; initial: ProjectState; assistant?: boolean; children: ReactNode }) {
  const [stores] = useState<Stores>(() => ({ project: createProjectStore(id, initial), playhead: createPlayheadStore() }));
  useEffect(() => {
    stores.project.getState().startPolling();
    return () => stores.project.getState().stopPolling();
  }, [stores]);
  return (
    <ProjectContext.Provider value={stores}>
      <AssistantContext.Provider value={assistant}>{children}</AssistantContext.Provider>
    </ProjectContext.Provider>
  );
}

function useStores() {
  const stores = useContext(ProjectContext);
  if (!stores) throw new Error("Project hooks must be used inside <ProjectProvider>.");
  return stores;
}

export function useAssistantEnabled() { return useContext(AssistantContext); }

export function useProject<T>(selector: (state: ProjectStoreState) => T): T {
  return useStore(useStores().project, selector);
}
export function useProjectStore(): StoreApi<ProjectStoreState> { return useStores().project; }
export function usePlayhead<T>(selector: (state: PlayheadState) => T): T {
  return useStore(useStores().playhead, selector);
}
export function usePlayheadStore(): StoreApi<PlayheadState> { return useStores().playhead; }
