import Link from "next/link";
import { notFound } from "next/navigation";
import { Keys } from "@/app/app/engine/page";
import { ProviderRouting } from "@/components/engine/ProviderRouting";
import { connectionsEnabled } from "@/server/flags";
import "../../settings.css";

const options: { name: string; providers: string; purpose: string; leaves: string; cost: string; href?: string; cta?: string; links?: { label: string; href: string }[] }[] = [
  {
    name: "Free, runs on this computer",
    providers: "Ollama and whisper.cpp",
    purpose: "Ollama runs local language models. whisper.cpp transcribes audio through the local worker.",
    leaves: "Private for local Ollama. Audio stays on the computer for whisper.cpp. Your configured Ollama endpoint may forward requests elsewhere.",
    cost: "R0 provider fee; electricity and hardware are yours.",
    links: [{ label: "Download Ollama", href: "https://ollama.com/download" }, { label: "whisper.cpp", href: "https://github.com/ggml-org/whisper.cpp" }],
  },
  {
    name: "Free tier online",
    providers: "Groq and Gemini",
    purpose: "Online language models for planning, translation and the studio assistant.",
    leaves: "May log: text sent to these providers leaves this computer and may be retained under their terms.",
    cost: "Provider free tiers may have limits or change. Check the provider account before use.",
    links: [{ label: "Groq", href: "https://console.groq.com/keys" }, { label: "Gemini", href: "https://aistudio.google.com/app/apikey" }],
  },
  {
    name: "Paid online",
    providers: "Meta Model API, OpenRouter and AI/ML API",
    purpose: "Hosted language models billed by the provider you choose.",
    leaves: "Standard for Meta; May log for OpenRouter and AI/ML API. Text leaves this computer.",
    cost: "Varies by model and usage. IZWI shows estimates only when pricing and the Rand rate are available.",
    links: [{ label: "Meta Model API", href: "https://dev.meta.ai/" }, { label: "OpenRouter", href: "https://openrouter.ai/keys" }, { label: "AI/ML API", href: "https://aimlapi.com/app/keys" }],
  },
];

export default function SettingsPage() {
  if (!connectionsEnabled()) notFound();
  return (
    <div className="st-page">
      <header>
        <h1>Settings</h1>
        <p className="lede">Choose how IZWI works for you. Connections uses the same tested provider setup as Run on.</p>
      </header>
      <nav className="st-tabs" aria-label="Settings">
        <span aria-disabled="true">Preferences · planned</span>
        <span aria-disabled="true">Languages · planned</span>
        <a href="#connections" aria-current="page">Connections</a>
        <span aria-disabled="true">Account · planned</span>
      </nav>
      <section id="connections" className="st-sec" aria-labelledby="connections-title">
        <header><div><h2 id="connections-title">Connect your AI</h2><p>Start with local and free options. A provider connection test checks access; it does not confirm that a free allowance remains.</p></div></header>
        <div className="st-grid">
          {options.map((option) => (
            <article className="st-card" key={option.name}>
              <h3>{option.name}</h3>
              <p><strong>{option.providers}</strong></p>
              <p>{option.purpose}</p>
              <p><strong>What leaves this computer</strong><br />{option.leaves}</p>
              <p><strong>Cost</strong><br />{option.cost}</p>
              <div className="st-actions">{option.href && <a className="btn btn-quiet" href={option.href} target="_blank" rel="noreferrer">{option.cta}</a>}{option.links?.map((link) => <a className="btn btn-quiet" href={link.href} target="_blank" rel="noreferrer" key={link.label}>Get a {link.label} key</a>)}</div>
            </article>
          ))}
        </div>
        <p className="st-note">Ollama and whisper.cpp use the MIT licence. Hosted APIs are services, not open-source software. Install Ollama and start the local worker before connecting local models. For a connected provider, use <strong>Load models</strong> to see model-specific Rand estimates when the provider supplies pricing and the operator has configured the USD to Rand rate; otherwise IZWI marks the cost unknown.</p>
        <p className="st-note">To connect: choose a card below, paste your key, then IZWI tests it. The key is encrypted on this server. Only owners and admins can add or remove keys.</p>
        <Keys />
        <ProviderRouting />
        <div className="st-note"><strong>Why the assistant may refuse a paid model</strong><br />Paid models need a reviewed model price, the operator&apos;s USD to Rand rate (<code>IZWI_USD_ZAR</code>) and a daily spend limit above zero (<code>IZWI_ASSISTANT_DAILY_CENTS</code>). If any is missing, ask the workspace owner to set the missing budget details on the server and restart it. An owner can mark a provider as free tier only when that account really has a free allowance.</div>
        <p className="st-note">Advanced setup: <Link href="/app/engine">Run on</Link> includes device checks, worker status and passkeys.</p>
      </section>
    </div>
  );
}
