// Everything under /app needs a signed-in member of a workspace. pageCtx redirects to sign-in or onboarding otherwise.
import { AppShell } from "@/components/AppShell";
import { pageCtx } from "@/server/guard";
import { one } from "@/server/db";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await pageCtx();
  const ws = await one<{ name: string }>(`SELECT name FROM organization WHERE id = ?`, ctx.workspaceId);
  return (
    <AppShell workspace={ws?.name ?? "Workspace"} user={{ name: ctx.userName, email: ctx.email }}>
      {children}
    </AppShell>
  );
}
