// Teach the workspace a spelling. With `heard`, the same mishearing is fixed in draft transcripts right away
// and in every future transcript.
import { body, route } from "@/server/http";
import { requireCtx } from "@/server/guard";
import { GlossaryIn, learnGlossary } from "@/server/actions";

export const runtime = "nodejs";

export const POST = route(async (req) => learnGlossary(await requireCtx(), await body(req, GlossaryIn)));
