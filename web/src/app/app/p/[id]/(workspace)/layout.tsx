// Every new studio view of one project shares this layout: the server reads the project once (same guards as
// before: awaited params, pageCtx, 404), then one client store keeps it fresh for all views (PLAN.md, Wave 0).
import { notFound } from "next/navigation";
import { pageCtx } from "@/server/guard";
import { projectState } from "@/server/state";
import { HttpError } from "@/server/http";
import { ProjectProvider } from "@/components/workspace/ProjectProvider";
import { ProjectFrame } from "@/components/workspace/ProjectFrame";
import { assistantEnabled } from "@/server/flags";

export const dynamic = "force-dynamic";

export default async function ProjectLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await pageCtx();
  let initial;
  try {
    initial = await projectState(ctx, id);
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) notFound();
    throw e;
  }
  return (
    <ProjectProvider key={id} id={id} initial={initial} assistant={assistantEnabled()}>
      <ProjectFrame>{children}</ProjectFrame>
    </ProjectProvider>
  );
}
