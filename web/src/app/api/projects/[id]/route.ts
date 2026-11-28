import { body, route } from "@/server/http";
import { requireCtx } from "@/server/guard";
import { deleteProject, ProjectPatch, updateProject } from "@/server/actions";
import { projectState } from "@/server/state";

export const runtime = "nodejs";
type P = { id: string };

export const GET = route<P>(async (req, { id }) => await projectState(await requireCtx(), id, { lite: new URL(req.url).searchParams.get("lite") === "1" }));
export const PATCH = route<P>(async (req, { id }) => updateProject(await requireCtx(), id, await body(req, ProjectPatch)));
export const DELETE = route<P>(async (_req, { id }) => await deleteProject(await requireCtx(), id));
