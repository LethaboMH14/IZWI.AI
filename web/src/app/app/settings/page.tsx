import Link from "next/link";
import { notFound } from "next/navigation";
import { ProviderRouting } from "@/components/engine/ProviderRouting";
import { Keys } from "@/components/engine/ProviderManager";
import { connectionsEnabled, homeTipsEnabled, languagesEnabled, preferencesEnabled } from "@/server/flags";
import { pageCtx } from "@/server/guard";
import { readUserPreferences } from "@/server/preferences";
import { PreferencesPanel } from "@/components/settings/PreferencesPanel";
import { LanguagesPanel } from "@/components/settings/LanguagesPanel";
import { readCreatorLanguages } from "@/server/languages";
import { readCreatorNiche } from "@/server/niche";
import { CreatorNicheSettings } from "@/components/settings/CreatorNicheSettings";
import type { CreatorNiche } from "@/lib/niche-tips";
import "../../settings.css";

export const dynamic = "force-dynamic";

type Tab = "preferences" | "languages" | "creator" | "connections" | "account";
export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const [query, ctx] = await Promise.all([searchParams, pageCtx()]);
  const canPreferences = preferencesEnabled(), canConnections = connectionsEnabled(), canLanguages = languagesEnabled(), canHomeTips = homeTipsEnabled();
  if (!canPreferences && !canConnections && !canLanguages && !canHomeTips) notFound();
  const tabs: { id: Tab; label: string }[] = [
    ...(canPreferences ? [{ id: "preferences" as const, label: "Preferences" }] : []),
    ...(canLanguages ? [{ id: "languages" as const, label: "Languages" }] : []),
    ...(canHomeTips ? [{ id: "creator" as const, label: "Creator type" }] : []),
    ...(canConnections ? [{ id: "connections" as const, label: "Connections" }] : []),
    { id: "account", label: "Account" },
  ];
  const fallback = canPreferences ? "preferences" : canLanguages ? "languages" : canHomeTips ? "creator" : "connections";
  const tab: Tab = tabs.some((t) => t.id === query.tab) ? query.tab as Tab : fallback;
  const [appearance, userLanguages, userNiche] = await Promise.all([
    canPreferences ? readUserPreferences(ctx.userId) : Promise.resolve(null),
    canLanguages ? readCreatorLanguages(ctx.userId) : Promise.resolve(null),
    canHomeTips ? readCreatorNiche(ctx.userId) : Promise.resolve(null),
  ]);
  return <div className="st-page">
    <header><h1>Settings</h1><p className="lede">Your preferences and connections for IZWI AI.</p></header>
    <nav className="st-tabs" aria-label="Settings">{tabs.map((item) => <Link key={item.id} href={`/app/settings?tab=${item.id}`} aria-current={tab === item.id ? "page" : undefined}>{item.label}</Link>)}</nav>
    {tab === "preferences" && appearance && <PreferencesPanel initial={appearance} />}
    {tab === "languages" && userLanguages && <LanguagesPanel initial={userLanguages} />}
    {tab === "creator" && canHomeTips && userNiche && <CreatorNicheSettings initial={userNiche as CreatorNiche} />}
    {tab === "connections" && canConnections && <div id="connections"><Keys guided /><ProviderRouting />
      <section className="st-sec"><h2>Why the assistant may refuse a paid model</h2><p>Paid models need a reviewed model price, the operator&apos;s USD to Rand rate (<code>IZWI_USD_ZAR</code>) and a daily spend limit above zero (<code>IZWI_ASSISTANT_DAILY_CENTS</code>). If a price is missing, or either setting is missing, ask the workspace owner to configure the budget on the server and restart IZWI. Free-tier status is an owner&apos;s assertion; IZWI cannot check the provider&apos;s remaining allowance.</p></section>
      <p className="st-note">Advanced device, worker and passkey settings: <Link href="/app/engine">Run on</Link>.</p>
    </div>}
    {tab === "account" && <section className="st-sec" aria-labelledby="account-title"><header><div><h2 id="account-title">Account</h2><p>The signed-in account for this workspace.</p></div></header><dl className="st-grid"><div><dt>Name</dt><dd>{ctx.userName}</dd></div><div><dt>Email</dt><dd>{ctx.email}</dd></div><div><dt>Workspace role</dt><dd>{ctx.role}</dd></div></dl><p className="st-note">Manage team access under <Link href="/app/team">Team</Link>. Sign out from the account menu.</p></section>}
  </div>;
}
