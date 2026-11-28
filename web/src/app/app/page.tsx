// Stories: every project in this workspace with honest counts, read from the workspace's own records.
import { NewStory } from "@/components/NewStory";
import { StoriesBoard, type StoryCard } from "@/components/stories/StoriesBoard";
import { KIND_LABEL } from "@/lib/kinds";
import { one } from "@/server/db";
import { pageCtx } from "@/server/guard";
import { projectList } from "@/server/state";
import { languagesEnabled } from "@/server/flags";
import { readCreatorLanguages } from "@/server/languages";
import { greetingFor } from "@/lib/greetings";
import { starterTemplatesEnabled } from "@/server/flags";
import { StarterTemplateLibrary } from "@/components/studio/StarterTemplateLibrary";
import { homeTipsEnabled } from "@/server/flags";
import { readCreatorNiche } from "@/server/niche";
import { HomeInspiration } from "@/components/home/HomeInspiration";
import { seasonalLooksEnabled } from "@/server/flags";
import { seasonalLooksOptedIn } from "@/server/seasonal";
import { seasonalSuggestion } from "@/lib/seasonal-calendar";
import { SeasonalSuggestion } from "@/components/home/SeasonalSuggestion";
import "../entry.css";
import "../stories.css";

export const dynamic = "force-dynamic";

export default async function Home() {
  const ctx = await pageCtx();
  const rows = await projectList(ctx);
  const ws = await one<{ name: string }>(`SELECT name FROM organization WHERE id = ?`, ctx.workspaceId);
  const greeting = languagesEnabled() ? greetingFor(await readCreatorLanguages(ctx.userId)) : null;
  const creatorNiche = homeTipsEnabled() ? await readCreatorNiche(ctx.userId) : null;
  const seasonalIdea = seasonalLooksEnabled() && await seasonalLooksOptedIn(ctx.userId) ? seasonalSuggestion() : null;
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
      <StoriesBoard cards={cards} workspace={ws?.name ?? "Workspace"} greeting={greeting ? `${greeting.text}, ${ctx.userName}` : null} newStory={<NewStory empty={cards.length === 0} />} />
      {starterTemplatesEnabled() && <StarterTemplateLibrary instance="home" compact />}
      {creatorNiche && <HomeInspiration initialNiche={creatorNiche} />}
      {seasonalIdea && <SeasonalSuggestion idea={seasonalIdea} />}
    </div>
  );
}
