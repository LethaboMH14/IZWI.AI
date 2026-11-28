// /trust: what IZWI protects today, what is partial and what is planned, each with the file that proves it.
// Public and plain on purpose: one server component, existing tokens, no new dependencies. The live rows (CSP mode,
// kill switches, ledger head) are read on every request, so the page cannot claim a control the server isn't running.
import type { Metadata } from "next";
import Link from "next/link";
import { Mark } from "@/components/Mark";
import { cspEnforced } from "@/server/headers";
import { assistantEnabled } from "@/server/flags";
import { ledgerHead } from "@/server/ledger";
import "./trust.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Trust · IZWI AI", description: "The security and consent controls in IZWI, with the evidence for each." };

type Status = "implemented" | "partial" | "planned";
type Row = { control: string; what: string; status: Status; note?: string; evidence: string[] };

const LABEL: Record<Status, string> = { implemented: "Implemented", partial: "Partial", planned: "Planned" };

function rows(): Row[] {
  const csp = cspEnforced();
  const injection = process.env.IZWI_FLAG_INJECTION === "1";
  const assistant = assistantEnabled();
  return [
    {
      control: "Consent before render",
      what: "A clip with a person in it renders only after that person's current consent covers the use. A missing yes blocks the output it affects.",
      status: "implemented",
      note: "The consent page is English only today. isiZulu and Setswana versions still need to be written and checked by speakers before they are shown.",
      evidence: ["web/src/server/pipeline.ts", "web/tests/access-consent.test.ts", "web/tests/provenance.test.ts", "docs/CONSENT-STRINGS.md"],
    },
    {
      control: "Consent ledger",
      what: "Every consent answer is appended to a hash-chained ledger, and each entry is signed with Ed25519. A script checks every link and signature against the trusted key.",
      status: "implemented",
      evidence: ["web/src/server/ledger.ts", "web/scripts/verify-ledger.ts", "web/tests/security-db.test.ts"],
    },
    {
      control: "Render provenance",
      what: "Each render gets a signed sidecar binding the MP4's hash to its consent and declaration snapshot. This is IZWI signed provenance (not C2PA).",
      status: "implemented",
      note: "C2PA Content Credentials are planned; the spike failed for lack of a Windows build.",
      evidence: ["web/src/server/provenance.ts", "web/scripts/verify-provenance.ts", "docs/security/PROVENANCE.md"],
    },
    {
      control: "Assistant proposes, people approve",
      what: "The studio assistant can only create proposals. Nothing changes until the creator approves a card, and only that card's own steps run.",
      status: "implemented",
      evidence: ["web/src/server/planner.ts", "web/src/server/assistant.ts", "web/tests/assistant-security.test.ts"],
    },
    {
      control: "Audit trail",
      what: "Provider changes, approvals, assistant proposals, edits, deletes and consent answers are written to a per-workspace audit log the owner can read.",
      status: "implemented",
      evidence: ["web/src/server/audit.ts", "web/src/app/api/workspace/audit/route.ts"],
    },
    {
      control: "Assistant kill switch",
      what: `Server-side switch, read on every request. Off hides the panel and makes the chat and voice routes answer 404. Right now: ${assistant ? "on" : "off"}.`,
      status: "implemented",
      evidence: ["web/src/server/flags.ts", "web/tests/assistant-security.test.ts"],
    },
    {
      control: "Redaction before a provider that may log",
      what: "For a provider marked “may log”, SA ID numbers, email addresses, phone numbers and the project's people's names are replaced before anything is sent. The reply says how many.",
      status: "implemented",
      evidence: ["web/src/server/assistant.ts", "web/tests/assistant-security.test.ts"],
    },
    {
      control: "Per-request canary",
      what: "Each assistant request carries a fresh secret. If it, or the provider key, shows up in the model's text or tool calls, the reply is stopped and nothing is stored.",
      status: "implemented",
      evidence: ["web/src/app/api/projects/[id]/assistant/route.ts", "web/tests/assistant-security.test.ts"],
    },
    {
      control: "Transcript injection check",
      what: `Transcript lines scored as instructions are held back from the assistant, and the reply shows how many. Right now: ${injection ? "on" : "off"}.`,
      status: "partial",
      note: "Best-effort only. The classifier is trained on English and can miss isiZulu, Setswana or code-switched lines. Transcript text is always passed as untrusted data either way.",
      evidence: ["web/src/server/injection.ts", "docs/security/INJECTION-CLASSIFIER.md", "web/tests/injection.test.ts"],
    },
    {
      control: "Outbound request guard (SSRF)",
      what: "Provider calls are checked after DNS, at connect time. Cloud metadata and link-local addresses are always refused, private ranges on a hosted install, and redirects are never followed.",
      status: "implemented",
      evidence: ["web/src/server/ssrf.ts", "web/tests/ssrf.test.ts"],
    },
    {
      control: "Provider keys sealed",
      what: "Keys are encrypted with AES-256-GCM before they reach the database and never sent back to the browser.",
      status: "implemented",
      evidence: ["web/src/server/crypto.ts", "web/tests/assistant-security.test.ts"],
    },
    {
      control: "Cross-site request check",
      what: "Every write must carry a matching Origin, or Sec-Fetch-Site: same-origin. A request with neither is refused.",
      status: "implemented",
      evidence: ["web/src/server/http.ts", "web/tests/http-guards.test.ts"],
    },
    {
      control: "Rate limits",
      what: "Per user and workspace for the assistant, voice, uploads, provider tests and planning; per link for public consent pages.",
      status: "implemented",
      evidence: ["web/src/server/ratelimit.ts", "web/tests/security-db.test.ts"],
    },
    {
      control: "Content Security Policy",
      what: `A fresh nonce on every page, no inline scripts, no framing. Right now: ${csp ? "enforced" : "Report-Only, so browsers report violations but do not block them"}.`,
      status: csp ? "implemented" : "partial",
      evidence: ["web/src/server/headers.ts", "web/src/proxy.ts"],
    },
    {
      control: "Workspace isolation",
      what: "Every query is scoped to the signed-in workspace; another workspace's ids answer 404 and cost nothing.",
      status: "partial",
      note: "Tested at the database and assistant-route level, not yet for every HTTP route.",
      evidence: ["web/tests/security-db.test.ts", "web/tests/assistant-security.test.ts"],
    },
    {
      control: "Dependency and secret scans",
      what: "Each pull request runs npm audit, a gitleaks credential scan and a Semgrep scan of the TypeScript source.",
      status: "implemented",
      evidence: [".github/workflows/lane-a.yml"],
    },
    {
      control: "Software bill of materials",
      what: "A published SBOM for each release.",
      status: "planned",
      evidence: [],
    },
  ];
}

const short = (hash: string) => `${hash.slice(0, 12)}…${hash.slice(-6)}`;

export default async function TrustPage() {
  const list = rows();
  const head = await ledgerHead();
  const counts = { implemented: 0, partial: 0, planned: 0 } as Record<Status, number>;
  for (const r of list) counts[r.status]++;
  return (
    <main className="trust">
      <header className="trust-top">
        <Link href="/" aria-label="IZWI home"><Mark /></Link>
      </header>
      <section className="trust-intro">
        <h1>What IZWI protects, and how you can check</h1>
        <p>Each control below says whether it is implemented, partial or planned, and names the file in our repository that proves it. Lines marked “right now” are read from the running server when this page loads.</p>
        <p className="trust-tally mono">{counts.implemented} implemented · {counts.partial} partial · {counts.planned} planned</p>
      </section>

      <section className="trust-ledger" aria-labelledby="ledger-h">
        <h2 id="ledger-h">Consent ledger, right now</h2>
        <dl className="mono">
          <div><dt>Entries</dt><dd>{head.entries}</dd></div>
          <div><dt>Head hash</dt><dd title={head.hash}>{head.entries ? short(head.hash) : "none yet"}</dd></div>
          <div><dt>Last entry</dt><dd>{head.at ? new Date(head.at).toISOString().replace("T", " ").slice(0, 16) + " UTC" : "none yet"}</dd></div>
        </dl>
        <p>To check the chain and every signature: <code>npx tsx scripts/verify-ledger.ts</code>. To check one render: <code>npx tsx scripts/verify-provenance.ts &lt;render.mp4&gt;</code>. Both run from <code>web/</code>.</p>
      </section>

      <section aria-labelledby="controls-h">
        <h2 id="controls-h">Controls</h2>
        <ul className="trust-list">
          {list.map((r) => (
            <li key={r.control} className="trust-row">
              <div className="trust-row-head">
                <h3>{r.control}</h3>
                <span className={`trust-status trust-${r.status}`}>{LABEL[r.status]}</span>
              </div>
              <p>{r.what}</p>
              {r.note && <p className="trust-note">{r.note}</p>}
              {r.evidence.length > 0 && (
                <p className="trust-evidence mono">{r.evidence.map((e) => <code key={e}>{e}</code>)}</p>
              )}
            </li>
          ))}
        </ul>
      </section>

      <footer className="trust-foot">
        <p>Found a problem? Tell Team Sonar. This page lists controls, not guarantees: nothing here is a certification or a third-party audit.</p>
      </footer>
    </main>
  );
}
