// Members and invitations. No email provider is configured, so the invite link is returned to share directly.
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/server/auth";
import { body, fail, route } from "@/server/http";
import { requireCtx, requireRole } from "@/server/guard";
import { all } from "@/server/db";
import { PUBLIC_URL } from "@/server/env";

export const runtime = "nodejs";

export const GET = route(async () => {
  const ctx = await requireCtx();
  // The link is what lets someone join with the invited role, so only the people who may invite receive it.
  const mayInvite = ctx.role === "owner" || ctx.role === "admin";
  return {
    members: await all(`SELECT m.id, m.role, u.name, u.email FROM member m JOIN "user" u ON u.id = m."userId" WHERE m."organizationId" = ? ORDER BY m."createdAt"`, ctx.workspaceId),
    invites: (await all<{ id: string; email: string; role: string; status: string; expiresAt: string }>(`SELECT id, email, role, status, "expiresAt" FROM invitation WHERE "organizationId" = ? AND status = 'pending' ORDER BY "expiresAt" DESC`, ctx.workspaceId))
      .map((i) => (mayInvite ? { ...i, url: `${PUBLIC_URL}/invite/${i.id}` } : { email: i.email, role: i.role, status: i.status, expiresAt: i.expiresAt })),
    me: { role: ctx.role, userId: ctx.userId },
  };
});

const REFUSALS: Record<string, string> = {
  USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION: "That person is already in this workspace.",
  USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION: "There is already an invite waiting for that email. Share its link under Waiting to join.",
};

// The auth library's refusals are for the caller to put right, so say which one it was.
function refused(e: unknown): never {
  const x = e as { name?: string; statusCode?: number; body?: { code?: string; message?: string } } | null;
  if (x?.name === "APIError" && x.statusCode && x.statusCode < 500) fail(x.statusCode, REFUSALS[x.body?.code ?? ""] ?? x.body?.message ?? "Could not create the invitation.");
  throw e;
}

export const POST = route(async (req) => {
  const ctx = await requireCtx();
  requireRole(ctx, ["owner", "admin"]);
  const x = await body(req, z.object({ email: z.string().trim().email().max(120), role: z.enum(["member", "admin"]).default("member") }));
  const inv = (await auth.api.createInvitation({ body: { email: x.email, role: x.role, organizationId: ctx.workspaceId }, headers: await headers() }).catch(refused)) as { id: string } | null;
  if (!inv?.id) fail(500, "Could not create the invitation.");
  const url = `${PUBLIC_URL}/invite/${inv.id}`;
  return { url, message: `You're invited to my IZWI AI workspace. Sign up with ${x.email} and open: ${url}` };
});
