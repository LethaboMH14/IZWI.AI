import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/server/auth";
import { body, fail, route } from "@/server/http";
import { getSession, requireCtx } from "@/server/guard";
import { newToken } from "@/server/crypto";
import { all, now, one, parse, run } from "@/server/db";
import { audit } from "@/server/audit";

export const runtime = "nodejs";

const Prefs = z.object({
  makes: z.array(z.string().max(40)).max(10).optional(),
  languages: z.array(z.string().max(5)).max(25).optional(),
  mixesLanguages: z.boolean().optional(),
  device: z.enum(["phone", "laptop", "both"]).optional(),
  dataSaver: z.boolean().optional(),
  accuracy: z.enum(["fast", "accurate"]).optional(),
});

export const GET = route(async () => {
  const ctx = await requireCtx();
  const p = one<Record<string, unknown>>(`SELECT * FROM workspace_pref WHERE workspace_id = ?`, ctx.workspaceId);
  const org = one<{ name: string }>(`SELECT name FROM organization WHERE id = ?`, ctx.workspaceId);
  const usage = all<{ unit: string; total: number }>(`SELECT unit, SUM(amount) total FROM usage_event WHERE workspace_id = ? AND created_at > ? GROUP BY unit`, ctx.workspaceId, now() - 30 * 86400_000);
  return {
    name: org?.name, role: ctx.role, user: { name: ctx.userName, email: ctx.email },
    prefs: p && { makes: parse(p.makes, []), languages: parse(p.languages, []), mixesLanguages: !!p.mixes_languages, device: p.device, dataSaver: !!p.data_saver, accuracy: p.accuracy },
    glossary: parse(p?.glossary, []), usage,
  };
});

export const PATCH = route(async (req) => {
  const ctx = await requireCtx();
  const x = await body(req, Prefs);
  const cur = one<Record<string, unknown>>(`SELECT * FROM workspace_pref WHERE workspace_id = ?`, ctx.workspaceId) ?? fail(404, "Not found.");
  run(
    `UPDATE workspace_pref SET makes = ?, languages = ?, mixes_languages = ?, device = ?, data_saver = ?, accuracy = ?, updated_at = ? WHERE workspace_id = ?`,
    JSON.stringify(x.makes ?? parse(cur.makes, [])), JSON.stringify(x.languages ?? parse(cur.languages, [])),
    x.mixesLanguages === undefined ? cur.mixes_languages : x.mixesLanguages ? 1 : 0, x.device ?? cur.device,
    x.dataSaver === undefined ? cur.data_saver : x.dataSaver ? 1 : 0, x.accuracy ?? cur.accuracy, now(), ctx.workspaceId,
  );
  return { ok: true };
});

// Onboarding: create the first workspace for this person, with their answers.
const NewWorkspace = Prefs.extend({ name: z.string().trim().min(2).max(60) });

export const POST = route(async (req) => {
  const s = await getSession();
  if (!s) fail(401, "Sign in to continue.");
  const x = await body(req, NewWorkspace);
  const slug = `${x.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "studio"}-${newToken().slice(0, 5).toLowerCase()}`;
  const h = await headers();
  const org = (await auth.api.createOrganization({ body: { name: x.name, slug }, headers: h })) as { id: string } | null;
  if (!org?.id) fail(500, "Could not create the workspace.");
  await auth.api.setActiveOrganization({ body: { organizationId: org.id }, headers: h });
  run(
    `INSERT INTO workspace_pref (workspace_id, makes, languages, mixes_languages, device, data_saver, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    org.id, JSON.stringify(x.makes ?? []), JSON.stringify(x.languages ?? ["en"]), x.mixesLanguages === false ? 0 : 1, x.device ?? "both", x.dataSaver === false ? 0 : 1, now(), now(),
  );
  audit({ workspaceId: org.id, userId: s.user.id, actor: "user", action: "workspace.created", target: org.id });
  return { id: org.id };
});
