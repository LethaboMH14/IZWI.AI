// The project studio. The server reads the project once so the first paint is real; the shell keeps it fresh.
import { notFound } from "next/navigation";
import { pageCtx } from "@/server/guard";
import { projectState } from "@/server/state";
import { HttpError } from "@/server/http";
import { StudioShell } from "@/components/studio/StudioShell";

export const dynamic = "force-dynamic";

export default async function StudioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await pageCtx();
  let initial;
  try {
    initial = projectState(ctx, id);
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) notFound();
    throw e;
  }
  return <StudioShell id={id} initial={initial} />;
}
