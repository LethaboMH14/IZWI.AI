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
  return {
    members: await all(`SELECT m.id, m.role, u.name, u.email FROM member m JOIN "user" u ON u.id = m."userId" WHERE m."organizationId" = ? ORDER BY m."createdAt"`, ctx.workspaceId),
    invites: (await all<{ id: string; email: string; role: string; status: string; expiresAt: string }>(`SELECT id, email, role, status, "expiresAt" FROM invitation WHERE "organizationId" = ? AND status = 'pending' ORDER BY "expiresAt" DESC`, ctx.workspaceId))
      .map((i) => ({ ...i, url: `${PUBLIC_URL}/invite/${i.id}` })),
    me: { role: ctx.role, userId: ctx.userId },
  };
});

export const POST = route(async (req) => {
  const ctx = await requireCtx();
  requireRole(ctx, ["owner", "admin"]);
  const x = await body(req, z.object({ email: z.string().trim().email().max(120), role: z.enum(["member", "admin"]).default("member") }));
  const inv = (await auth.api.createInvitation({ body: { email: x.email, role: x.role, organizationId: ctx.workspaceId }, headers: await headers() })) as { id: string } | null;
  if (!inv?.id) fail(500, "Could not create the invitation.");
  const url = `${PUBLIC_URL}/invite/${inv.id}`;
  return { url, message: `You're invited to my IZWI AI workspace. Sign up with ${x.email} and open: ${url}` };
});
