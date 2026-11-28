import Link from "next/link";
import { notFound } from "next/navigation";
import { ProviderRouting } from "@/components/engine/ProviderRouting";
import { Keys } from "@/components/engine/ProviderManager";
import { connectionsEnabled } from "@/server/flags";
import "../../settings.css";

export default function SettingsPage() {
  if (!connectionsEnabled()) notFound();
  return <div className="st-page">
    <header><h1>Settings</h1><p className="lede">Connect the tools you want to use with IZWI AI.</p></header>
    <nav className="st-tabs" aria-label="Settings"><a href="#connections" aria-current="page">Connections</a></nav>
    <div id="connections"><Keys guided /><ProviderRouting />
      <section className="st-sec"><h2>Why the assistant may refuse a paid model</h2><p>Paid models need a reviewed model price, the operator&apos;s USD to Rand rate (<code>IZWI_USD_ZAR</code>) and a daily spend limit above zero (<code>IZWI_ASSISTANT_DAILY_CENTS</code>). If a price is missing, or either setting is missing, ask the workspace owner to configure the budget on the server and restart IZWI. Free-tier status is an owner&apos;s assertion; IZWI cannot check the provider&apos;s remaining allowance.</p></section>
      <p className="st-note">Advanced device, worker and passkey settings: <Link href="/app/engine">Run on</Link>.</p>
    </div>
  </div>;
}
