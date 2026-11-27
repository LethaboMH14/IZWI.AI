"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useStore } from "zustand";
import type { StoreApi } from "zustand/vanilla";
import type { ProjectState } from "@/server/state";
import { createPlayheadStore, createProjectStore, type PlayheadState, type ProjectStoreState } from "@/lib/project-store";

type Stores = { project: StoreApi<ProjectStoreState>; playhead: StoreApi<PlayheadState> };
const ProjectContext = createContext<Stores | null>(null);

export function ProjectProvider({ id, initial, children }: { id: string; initial: ProjectState; children: ReactNode }) {
  const [stores] = useState<Stores>(() => ({ project: createProjectStore(id, initial), playhead: createPlayheadStore() }));
  useEffect(() => {
    stores.project.getState().startPolling();
    return () => stores.project.getState().stopPolling();
  }, [stores]);
  return <ProjectContext.Provider value={stores}>{children}</ProjectContext.Provider>;
}

function useStores() {
  const stores = useContext(ProjectContext);
  if (!stores) throw new Error("Project hooks must be used inside <ProjectProvider>.");
  return stores;
}

export function useProject<T>(selector: (state: ProjectStoreState) => T): T {
  return useStore(useStores().project, selector);
}
export function useProjectStore(): StoreApi<ProjectStoreState> { return useStores().project; }
export function usePlayhead<T>(selector: (state: PlayheadState) => T): T {
  return useStore(useStores().playhead, selector);
}
export function usePlayheadStore(): StoreApi<PlayheadState> { return useStores().playhead; }
