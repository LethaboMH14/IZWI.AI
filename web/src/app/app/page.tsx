// Stories: every project in this workspace with honest counts, read from the workspace's own records.
import { NewStory } from "@/components/NewStory";
import { StoriesBoard, type StoryCard } from "@/components/stories/StoriesBoard";
import { KIND_LABEL } from "@/lib/kinds";
import { one } from "@/server/db";
import { pageCtx } from "@/server/guard";
import { projectList } from "@/server/state";
import "../entry.css";
import "../stories.css";

export const dynamic = "force-dynamic";

export default async function Home() {
  const ctx = await pageCtx();
  const rows = projectList(ctx);
  const ws = one<{ name: string }>(`SELECT name FROM organization WHERE id = ?`, ctx.workspaceId);
  const cards: StoryCard[] = rows.map((p) => ({
    id: p.id,
    title: p.title,
    kind: KIND_LABEL[p.kind] ?? p.kind,
    updatedAt: p.updatedAt,
    posterId: p.posterId,
    durationMs: p.durationMs,
    filename: p.filename,
    peaks: p.peaks,
    counts: p.counts,
  }));
  return (
    <div className="st-page">
      <StoriesBoard cards={cards} workspace={ws?.name ?? "Workspace"} newStory={<NewStory empty={cards.length === 0} />} />
    </div>
  );
}
