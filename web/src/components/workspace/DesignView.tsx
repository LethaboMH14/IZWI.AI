"use client";
import { useProject, useProjectStore } from "./ProjectProvider";
import { DesignTab } from "@/components/studio/DesignTab";

export function DesignView() {
  const state = useProject((value) => value.state);
  const store = useProjectStore();
  return <DesignTab state={state} refresh={() => store.getState().refresh()} go={() => undefined} />;
}
