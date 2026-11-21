import Link from "next/link";
import { Mark } from "@/components/Mark";

const screens = [
  { href: "/", name: "Landing", job: "Landing" },
  { href: "/sign-in", name: "Sign in", job: "Sign in or create an account (email + password, passkey)" },
  { href: "/welcome", name: "Onboarding", job: "Onboarding that creates your workspace and first story" },
  { href: "/app", name: "Your stories", job: "Your stories" },
  { href: "/app/p/<id>", name: "Studio", job: "Studio: Canvas, Create, Localise, Protect, Publish, Earn" },
  { href: "/app/engine", name: "Run on", job: "Run on: worker status, your own AI keys, passkeys" },
  { href: "/app/extensions", name: "Extensions", job: "Extensions with live status" },
  { href: "/app/team", name: "Team", job: "Team and invites" },
  { href: "/r/<token>", name: "Review link", job: "Review link for guests" },
  { href: "/c/<token>", name: "Consent link", job: "Consent link for guests" },
  { href: "/l/<slug>", name: "Licence listing", job: "Public licence listing" },
];

const forgot = [
  ["The upload that dies at 80%", "Resumable chunks, megabytes shown before start, a clear “waiting for Wi-Fi” state.", "Onboarding step 4"],
  ["People who are not users", "Guests, reviewers and editors act through a link. They never need an account.", "Review link"],
  ["Draft that looks finished", "A machine translation is visibly a draft until every line has a human yes.", "Localise"],
  ["Ready versus posted", "Prepared, connected, scheduled and published are four different states.", "Publish"],
  ["Cost before the job", "What a render uses is shown before it runs. A retry never bills twice.", "Publish export bar"],
  ["Consent that is withdrawn", "A record can be revoked later, and that must pull back the outputs it covered.", "Protect, not built yet"],
  ["Names and slang", "A workspace glossary of words that must never be translated.", "Localise side panel"],
  ["The empty workspace", "A new account has no projects. The first screen must still feel alive.", "Home, new story row"],
  ["Wrong file, big file, no credit", "Each failure names what happened and the next step.", "Onboarding file check"],
  ["Deleting your work", "Where media lives, how long, and how to remove it.", "Not designed yet"],
];

const upgrades = [
  ["Word-level language tags", "Captions mark which language each word was spoken in, so mixed speech survives. No mainstream clipping tool shows this.", "Designed"],
  ["The story map as home", "One picture of everything an episode became and what blocks each piece. It replaces the dashboard.", "Designed"],
  ["Consent as a gate", "A guest's missing yes holds only the clips they appear in, and the map shows why.", "Designed"],
  ["Review by link on WhatsApp", "Approval happens where South African creators already approve things.", "Designed"],
  ["Reasons, not virality scores", "Each suggested cut states why it was chosen. Scores that cannot be verified are left out.", "Designed"],
  ["Native reviewer network", "Paid first-language reviewers per language. It is also the first real Earn path, for reviewers.", "Proposed"],
  ["Content credentials on export", "Attach an open C2PA manifest to each export so the record sheet travels with the file.", "Proposed, needs a spike"],
  ["Voice-note first", "Start a story from a WhatsApp voice note on the phone, edit on the laptop later.", "Proposed"],
  ["WhatsApp Status pack", "Thirty-second cuts in small files, sized for the channel most audiences already open daily.", "Proposed"],
];

const tokens = [
  ["Ivory", "#faf8f4"], ["Paper", "#ffffff"], ["Sand", "#f0ece4"], ["Ink", "#211e1a"], ["Amber", "#b77913"], ["Gold", "#e9a21b"], ["Tint", "#ffe0a0"], ["Clay", "#c4552d"], ["Moss", "#4f6b3a"],
];

export default function Board() {
  return (
    <main className="board">
      <header><Mark /><p>Design board. The screens below are the real app; open the studio from Your stories.</p></header>

      <section>
        <h1>The screens, in the order a creator meets them.</h1>
        <ol className="flow">
          {screens.map((s, i) => {
            const inner = (<><span className="mono">{String(i + 1).padStart(2, "0")}</span><b>{s.name}</b><p>{s.job}</p></>);
            return (
              <li key={s.href}>
                {s.href.includes("<") ? <div>{inner}</div> : <Link href={s.href}>{inner}</Link>}
              </li>
            );
          })}
        </ol>
      </section>

      <section className="split">
        <div>
          <h2>What products like this usually forget.</h2>
          <p className="lede">Each one has a place in the design, or is marked as still open.</p>
        </div>
        <table>
          <tbody>{forgot.map(([a, b, c]) => <tr key={a}><th scope="row">{a}</th><td>{b}</td><td className="mono">{c}</td></tr>)}</tbody>
        </table>
      </section>

      <section className="split">
        <div>
          <h2>Where this goes further than the handoff.</h2>
          <p className="lede">Proposals for Team Sonar to accept or reject. None of them is a decision yet.</p>
        </div>
        <table>
          <tbody>{upgrades.map(([a, b, c]) => <tr key={a}><th scope="row">{a}</th><td>{b}</td><td className="mono">{c}</td></tr>)}</tbody>
        </table>
      </section>

      <section className="system">
        <h2>The system.</h2>
        <div className="specimen">
          <p className="sp-display">Turn one story into <em>many.</em></p>
          <dl>
            <dt>Display</dt><dd>Fraunces 600, soft. Chosen by the team on 20 Nov 2026: warm, storytelling, least like software.</dd>
            <dt>Voice</dt><dd>Fraunces italic. Used where a person is speaking or a word is in another language.</dd>
            <dt>Text</dt><dd>Switzer 400 to 600.</dd>
            <dt>Time</dt><dd className="mono">Martian Mono 00:18 to 00:46</dd>
          </dl>
        </div>
        <ul className="swatches">{tokens.map(([n, h]) => <li key={n}><i style={{ background: h }} /><b>{n}</b><span className="mono">{h}</span></li>)}</ul>
        <ul className="statekey">
          <li className="s-done"><span className="pill">Reviewed</span> A person confirmed it.</li>
          <li className="s-draft"><span className="pill">Draft</span> Made by a model or not checked.</li>
          <li className="s-blocked"><span className="pill">Waiting on someone</span> Held until a named person acts.</li>
          <li className="s-off"><span className="pill">Not connected</span> Needs an account link.</li>
          <li className="s-planned"><span className="pill">Planned</span> Not built.</li>
        </ul>
        <p className="fine">The presentation template keeps Plus Jakarta Sans. Burned-in captions use Archivo Black for legibility on phones.</p>
      </section>
    </main>
  );
}
