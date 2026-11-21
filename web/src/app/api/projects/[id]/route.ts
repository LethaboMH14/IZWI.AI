import { body, route } from "@/server/http";
import { requireCtx } from "@/server/guard";
import { deleteProject, ProjectIn, updateProject } from "@/server/actions";
import { projectState } from "@/server/state";

export const runtime = "nodejs";
type P = { id: string };

export const GET = route<P>(async (_req, { id }) => projectState(await requireCtx(), id));
export const PATCH = route<P>(async (req, { id }) => updateProject(await requireCtx(), id, await body(req, ProjectIn.partial())));
export const DELETE = route<P>(async (_req, { id }) => deleteProject(await requireCtx(), id));
