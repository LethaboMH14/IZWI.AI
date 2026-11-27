import { body, route } from "@/server/http";
import { requireCtx } from "@/server/guard";
import { createProject, ProjectIn } from "@/server/actions";
import { projectList } from "@/server/state";

export const runtime = "nodejs";

export const GET = route(async () => await projectList(await requireCtx()));
export const POST = route(async (req) => await createProject(await requireCtx(), await body(req, ProjectIn)));
