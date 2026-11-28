// Who is asking, and may they touch this? Every lookup is scoped to the caller's active workspace.
// A resource in another workspace answers 404, so IDs cannot be probed.
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";
import { one } from "./db";
import { HttpError } from "./http";
import { appliedVersion, SCHEMA_VERSION } from "./migrations";

export type Ctx = { userId: string; userName: string; email: string; workspaceId: string; role: string };
export type ProjectRow = { id: string; workspace_id: string; title: string; kind: string; spoken_language: string; created_by: string; created_at: number; updated_at: number };

let schemaChecked = false;
async function assertSchema() {
  if (schemaChecked) return;
  if (await appliedVersion() < SCHEMA_VERSION) throw new HttpError(503, "The database needs migrating. Run npm run db:migrate.");
  schemaChecked = true;
}

export async function getSession() {
  await assertSchema();
  return auth.api.getSession({ headers: await headers() });
}

async function memberRole(workspaceId: string, userId: string) {
  return (await one<{ role: string }>(`SELECT role FROM member WHERE "organizationId" = ? AND "userId" = ?`, workspaceId, userId))?.role;
}

export async function requireCtx(): Promise<Ctx> {
  const s = await getSession();
  if (!s) throw new HttpError(401, "Sign in to continue.");
  const ws = (s.session as { activeOrganizationId?: string | null }).activeOrganizationId;
  if (!ws) throw new HttpError(409, "Create or choose a workspace first.");
  const role = await memberRole(ws, s.user.id);
  if (!role) throw new HttpError(403, "You are not a member of this workspace.");
  return { userId: s.user.id, userName: s.user.name, email: s.user.email, workspaceId: ws, role };
}

// For server-rendered pages: send people where they need to go instead of throwing.
export async function pageCtx(): Promise<Ctx> {
  const s = await getSession();
  if (!s) redirect("/sign-in");
  const ws = (s.session as { activeOrganizationId?: string | null }).activeOrganizationId;
  if (!ws) redirect("/welcome");
  const role = await memberRole(ws, s.user.id);
  if (!role) redirect("/welcome");
  return { userId: s.user.id, userName: s.user.name, email: s.user.email, workspaceId: ws, role };
}

export function requireRole(ctx: Ctx, roles: string[]) {
  if (!roles.includes(ctx.role)) throw new HttpError(403, "Your role in this workspace cannot do this.");
}

export async function projectOf(ctx: Ctx, projectId: string): Promise<ProjectRow> {
  const p = await one<ProjectRow>(`SELECT * FROM project WHERE id = ? AND workspace_id = ?`, projectId, ctx.workspaceId);
  if (!p) throw new HttpError(404, "Not found.");
  return p;
}
