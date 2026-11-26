"use client";
// Transcript, Captions and Notes in one ivory panel. The phone puts the same three views in its own tabs.
import { Tabs } from "@/components/z";
import { CaptionsView } from "./CaptionsView";
import { NotesView, useOpenNotes } from "./NotesView";
import { TranscriptView } from "./TranscriptView";

export function TranscriptPanel() {
  const notes = useOpenNotes();
  return (
    <div className="fs-text-in">
      <Tabs
        label="Text" defaultValue="transcript"
        items={[
          { value: "transcript", label: "Transcript", panel: <TranscriptView /> },
          { value: "captions", label: "Captions", panel: <CaptionsView /> },
          { value: "notes", label: notes > 0 ? `Notes ${notes}` : "Notes", panel: <NotesView /> },
        ]}
      />
    </div>
  );
}
