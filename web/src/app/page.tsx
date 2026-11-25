"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, ArrowUpRight, CellSignalMedium, DownloadSimple, WhatsappLogo } from "@phosphor-icons/react";
import { Mark } from "@/components/Mark";
import { Strand } from "@/components/Strand";
import { CaptionPlayer, type CapMode } from "@/components/CaptionPlayer";
import { StoryMap } from "@/components/StoryMap";
import { MakerPicker } from "@/components/MakerPicker";
import { MarketMap } from "@/components/MarketMap";
import { plans, stages } from "@/lib/demo";

const fan = [
  { t: "9:16 clip", s: "English · reviewed", k: "done" },
  { t: "9:16 clip", s: "isiZulu · draft", k: "draft" },
  { t: "Square clip", s: "English · reviewed", k: "done" },
  { t: "Captions file", s: "SRT · English", k: "done" },
  { t: "Record sheet", s: "1 consent outstanding", k: "blocked" },
  { t: "Licence enquiry page", s: "Planned", k: "planned" },
];

const stageCopy: Record<string, { h: string; p: string }> = {
  Create: { h: "Cut by reading, not scrubbing.", p: "Upload once. IZWI suggests clips and says why it chose each cut. You move the edges." },
  Localise: { h: "Captions that keep how you talk.", p: "Code-switching stays. A draft in another language stays a draft until a person approves it." },
  Protect: { h: "A record of who said yes.", p: "Declarations, guest consent and collaborator terms sit with the episode. A missing yes blocks the export it affects." },
  Publish: { h: "Ready is not the same as posted.", p: "Export MP4 and SRT today. Connect a platform when you choose to. IZWI never shows “published” unless it was." },
  Earn: { h: "A door, not a promise.", p: "Licence enquiries and a storefront are planned. No income figures appear until real money has moved." },
};

export default function Landing() {
  const [mode, setMode] = useState<CapMode>("src");
  const [stage, setStage] = useState<string>("Create");
  return (
    <main className="landing">
      <header className="nav">
        <Mark />
        <nav aria-label="Main">
          <a href="#makers">Who it is for</a>
          <a href="#markets">Markets</a>
          <a href="#map">How it connects</a>
          <a href="#price">Pricing</a>
        </nav>
        <div className="nav-cta">
          <Link href="/sign-in" className="link">Sign in</Link>
          <Link href="/sign-in?new=1" className="btn">Try IZWI AI <ArrowRight weight="bold" /></Link>
        </div>
      </header>

      <section className="hero">
        <Strand split={0.56} />
        <div className="hero-copy">
          <p className="kicker">Built for South African creators</p>
          <h1>
            Turn one story <br />
            into <em>many.</em>
          </h1>
          <p className="lede">Bring a podcast, a film, a lesson or a song. Leave with clips, captions in the languages your audience speaks, and a record of who agreed to what.</p>
          <div className="hero-actions">
            <Link href="/sign-in?new=1" className="btn btn-lg">Try IZWI AI <ArrowRight weight="bold" /></Link>
            <Link href="/design/mockups/story-room" className="link">Explore the sample Story Room <ArrowUpRight /></Link>
          </div>
        </div>
        <div className="hero-frame">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/img/naledi-wide.jpg" alt="Naledi recording Jozi Stories in a warm studio" />
          <span className="frame-tag mono">Jozi Stories · Episode 04 · 28:16</span>
        </div>
        <ul className="fan" aria-label="What one episode becomes">
          {fan.map((f, i) => (
            <li key={i} className={`s-${f.k}`} style={{ ["--i" as string]: i }}>
              <i /> <b>{f.t}</b> <span>{f.s}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="makersec" id="makers">
        <h2>Whatever you <em>make.</em></h2>
        <MakerPicker cta="/sign-in?new=1" />
      </section>

      <section className="marketsec" id="markets">
        <div className="marketsec-head">
          <h2>One voice. Every language. <em>Every market.</em></h2>
          <p>Tap a market to see its languages and which open model can hear and translate each one today.</p>
        </div>
        <MarketMap />
      </section>

      <section className="speak" id="speak">
        <div className="speak-copy">
          <h2>
            Say <em className="l-zu">sawubona</em>, say <em className="l-mix">eish</em>, say it <em>your</em> way.
          </h2>
          <p>Most caption tools flatten mixed speech into one language. IZWI marks each word with the language it was spoken in, keeps names and slang, and asks a person before a translation is called finished.</p>
          <div className="seg" role="tablist" aria-label="Caption language">
            {([["src", "As spoken"], ["en", "English"], ["zu", "isiZulu draft"]] as [CapMode, string][]).map(([k, label]) => (
              <button key={k} role="tab" aria-selected={mode === k} className={mode === k ? "on" : ""} onClick={() => setMode(k)}>{label}</button>
            ))}
          </div>
          <ul className="legend">
            <li><i className="l-en" /> English</li>
            <li><i className="l-zu" /> isiZulu</li>
            <li><i className="l-mix" /> Slang and names, kept</li>
          </ul>
          <p className="fine">Sample lines written for this design. isiZulu is the first pair planned for evaluation. No language is claimed as supported yet.</p>
        </div>
        <CaptionPlayer mode={mode} />
      </section>

      <section className="mapsec" id="map">
        <div className="mapsec-head">
          <h2>One project. Five stages. <br />Nothing gets lost between apps.</h2>
          <div className="stagepick" role="tablist" aria-label="Stages">
            {stages.map((s) => (
              <button key={s} role="tab" aria-selected={stage === s} className={stage === s ? "on" : ""} onMouseEnter={() => setStage(s)} onFocus={() => setStage(s)} onClick={() => setStage(s)}>{s}</button>
            ))}
          </div>
        </div>
        <div className="mapsec-body">
          <div className="stagecopy" key={stage}>
            <h3>{stageCopy[stage].h}</h3>
            <p>{stageCopy[stage].p}</p>
            <Link href={`/design/mockups/story-room?station=${stage.toLowerCase()}`} className="link">See the {stage} station <ArrowUpRight /></Link>
          </div>
          <StoryMap />
        </div>
      </section>

      <section className="mzansi">
        <h2>Made for the phone in your hand and the data you paid for.</h2>
        <div className="mz-row">
          <div>
            <CellSignalMedium />
            <h3>Uploads that pick up where they stopped</h3>
            <p>Signal drops. Power goes. The upload resumes from the last chunk, and you see the megabytes before you start.</p>
          </div>
          <div>
            <WhatsappLogo />
            <h3>Approve from a link</h3>
            <p>Send a guest or a reviewer one link. They watch, approve or ask for a change on their phone. No account, no app.</p>
          </div>
          <div>
            <DownloadSimple />
            <h3>Small files first</h3>
            <p>You review a light preview, not the full render. The big file is made once, when you say export.</p>
          </div>
        </div>
        <p className="fine">Planned behaviour. In the Stats SA General Household Survey 2024, as cited in the Team Sonar deck, 96.1% of households had at least one mobile phone and 82.1% had internet access by any means. Check the source before reuse.</p>
      </section>

      <section className="price" id="price">
        <div className="price-head">
          <h2>Start at R0.</h2>
          <p>Proposed prices from the Team Sonar canvas. Allowances are set after cost tests, and you will always see what a job uses before it runs.</p>
        </div>
        <ol className="ratecard">
          {plans.map((p, i) => (
            <li key={p.name} className={i === 1 ? "pick" : ""}>
              <b>{p.name}</b>
              <span className="amt">{p.price}<small>{i ? " / month" : ""}</small></span>
              <p>{p.line}</p>
            </li>
          ))}
        </ol>
      </section>

      <footer className="closer">
        <h2>Your voice. Your work. <em>More possibilities.</em></h2>
        <Link href="/sign-in?new=1" className="btn btn-lg">Try IZWI AI <ArrowRight weight="bold" /></Link>
        <p className="fine">IZWI AI by Team Sonar. For independent creators and small studios. Concept preview, features introduced in stages.</p>
      </footer>
    </main>
  );
}
