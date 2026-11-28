import { route } from "@/server/http";
import { requireCtx } from "@/server/guard";
import { starterTemplatesEnabled } from "@/server/flags";
import { STARTER_TEMPLATES } from "@/lib/starter-templates";

export const runtime = "nodejs";
export const GET = route(async () => {
  if (!starterTemplatesEnabled()) return { enabled: false };
  await requireCtx();
  return { enabled: true, templates: STARTER_TEMPLATES };
});
