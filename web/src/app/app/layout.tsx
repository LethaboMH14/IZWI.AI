// Everything under /app needs a signed-in member of a workspace. pageCtx redirects to sign-in or onboarding otherwise.
import { AppShell } from "@/components/AppShell";
import { pageCtx } from "@/server/guard";
import { one } from "@/server/db";
import { connectionsEnabled, languagesEnabled, preferencesEnabled } from "@/server/flags";
import { DEFAULT_PREFERENCES, readUserPreferences } from "@/server/preferences";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await pageCtx();
  const [ws, appearance] = await Promise.all([
    one<{ name: string }>(`SELECT name FROM organization WHERE id = ?`, ctx.workspaceId),
    preferencesEnabled() ? readUserPreferences(ctx.userId) : Promise.resolve({ ...DEFAULT_PREFERENCES }),
  ]);
  const settingsVisible = connectionsEnabled() || preferencesEnabled() || languagesEnabled();
  return (
    <AppShell workspace={ws?.name ?? "Workspace"} user={{ name: ctx.userName, email: ctx.email }} settingsVisible={settingsVisible} appearance={appearance}>
      {children}
    </AppShell>
  );
}
