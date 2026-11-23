"use client";
// MOCKUP: studio Rights map. 2D is the default; ?view=3d shows the optional 3D sketch. Sample data.
// "Simulate Sipho's yes" plays the demo moment: a held clip turns moss and its renders start.
import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowLeft, QrCode, WhatsappLogo, ShieldCheck, Play, ArrowCounterClockwise } from "@phosphor-icons/react";
import { Mark } from "@/components/Mark";
import { CLIPS, EPISODE, PEOPLE, STATUS_COLOR, type Output, type Person } from "../sample";
import { RightsMap2D } from "./RightsMap2D";
import "../mockups.css";

const RightsMap3DScene = dynamic(() => import("./RightsMap3DScene").then((m) => m.RightsMap3DScene), { ssr: false, loading: () => <div className="rm3 rm3-loading">Loading the 3D sketch…</div> });

// A QR-looking pattern for the mockup only. The real one comes from uqr and encodes the consent link.
function FakeQr() {
  const n = 25;
  const on = (x: number, y: number) => {
    const finder = (fx: number, fy: number) => x >= fx && x < fx + 7 && y >= fy && y < fy + 7 && (x === fx || x === fx + 6 || y === fy || y === fy + 6 || (x >= fx + 2 && x <= fx + 4 && y >= fy + 2 && y <= fy + 4));
    if (finder(0, 0) || finder(n - 7, 0) || finder(0, n - 7)) return true;
    if ((x < 8 && y < 8) || (x > n - 9 && y < 8) || (x < 8 && y > n - 9)) return false;
    const h = Math.abs(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453);
    return h - Math.floor(h) > 0.52;
  };
  const cells = [];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (on(x, y)) cells.push(<rect key={`${x}-${y}`} x={x} y={y} width="1.02" height="1.02" />);
  return <svg viewBox={`-2 -2 ${n + 4} ${n + 4}`} className="rm-qr" role="img" aria-label="QR code for Sipho's consent link (sample)"><rect x="-2" y="-2" width={n + 4} height={n + 4} fill="#fff" />{cells}</svg>;
}

export default function RightsMapMockup() {
  const [view, setView] = useState<"2d" | "3d">("2d");
  const [people, setPeople] = useState<Person[]>(PEOPLE);
  const [outputs, setOutputs] = useState<Record<string, Output>>({});
  const [focus, setFocus] = useState<string | null>("c2");
  const [phase, setPhase] = useState<"waiting" | "rendering" | "done">("waiting");

  const consent = (instant = false) => {
    setPeople((ps) => ps.map((p) => (p.id === "sipho" ? { ...p, consent: "yes" } : p)));
    setOutputs({ o3: { id: "o3", label: "9:16 · English", status: "draft", note: "Rendering…" }, o4: { id: "o4", label: "9:16 · isiZulu", status: "draft", note: "Rendering…" } });
    setPhase("rendering");
    window.setTimeout(() => {
      setOutputs({ o3: { id: "o3", label: "9:16 · English", status: "ready", note: "Ready · Content Credentials" }, o4: { id: "o4", label: "9:16 · isiZulu", status: "draft", note: "Captions draft · 9 of 14 lines" } });
      setPhase("done");
    }, instant ? 0 : 2600);
  };
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const raf = requestAnimationFrame(() => {
      if (q.get("view") === "3d" && window.innerWidth >= 760) setView("3d");
      if (q.get("state") === "after") consent(true);
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  const reset = () => { setPeople(PEOPLE); setOutputs({}); setPhase("waiting"); };

  const held = useMemo(() => CLIPS.filter((c) => c.people.some((p) => people.find((x) => x.id === p)?.consent === "waiting")).length, [people]);
  const sipho = people.find((p) => p.id === "sipho")!;

  return (
    <main className="rm">
      <header className="rm-top">
        <Mark small />
        <Link href="#" className="rm-back"><ArrowLeft /> Your stories</Link>
        <div className="rm-title">
          <span className="mono">{EPISODE.show} · {EPISODE.title}</span>
          <h1>Rights map</h1>
        </div>
        <div className="seg rm-seg" role="group" aria-label="View">
          <button type="button" className={view === "2d" ? "on" : ""} aria-pressed={view === "2d"} onClick={() => setView("2d")}>2D map</button>
          <button type="button" className={view === "3d" ? "on" : ""} aria-pressed={view === "3d"} onClick={() => setView("3d")}>3D sketch</button>
        </div>
      </header>

      <div className="rm-legend">
        {(["held", "draft", "ready"] as const).map((s) => (
          <span key={s}><i style={{ background: STATUS_COLOR[s] }} />{s === "held" ? "Held: someone in it hasn't said yes" : s === "draft" ? "Draft or rendering" : "Ready to publish"}</span>
        ))}
        <span className="rm-count mono">{held === 0 ? "Nothing held" : `${held} clip held`}</span>
      </div>

      <div className="rm-body">
        <section className="rm-canvas" aria-label="Map">
          {view === "2d"
            ? <RightsMap2D people={people} outputs={outputs} focus={focus} onFocus={(id) => setFocus((f) => (f === id ? null : id))} />
            : <RightsMap3DScene people={people} outputs={outputs} onFail={() => setView("2d")} />}
        </section>

        <aside className={"rm-panel " + phase}>
          {phase === "waiting" ? (
            <>
              <p className="rm-kicker" style={{ color: STATUS_COLOR.held }}>Clip 2 is held</p>
              <h2>Waiting on {sipho.name}</h2>
              <p>They appear from 12:04 to 12:51. Until they say yes, its two renders stay held. Nothing else is blocked.</p>
              <div className="rm-qrbox">
                <FakeQr />
                <div>
                  <b>Scan to consent</b>
                  <span>Opens on their own phone. No account needed. isiZulu, Sesotho, Afrikaans or English.</span>
                </div>
              </div>
              <div className="rm-actions">
                <button type="button" className="btn btn-quiet"><QrCode /> Show QR full screen</button>
                <button type="button" className="btn btn-quiet"><WhatsappLogo /> Send link</button>
              </div>
              <button type="button" className="rm-sim" onClick={() => consent()}><Play weight="fill" /> Simulate {sipho.name.split(" ")[0]}&apos;s yes (mockup)</button>
            </>
          ) : (
            <>
              <p className="rm-kicker" style={{ color: STATUS_COLOR.ready }}><ShieldCheck weight="fill" /> {sipho.name} said yes</p>
              <h2>{phase === "rendering" ? "Clip 2 is rendering" : "Clip 2 is cleared"}</h2>
              <p>{phase === "rendering" ? "The held renders started as soon as the answer arrived." : "The English render is ready and carries Content Credentials that point to this consent record."}</p>
              <dl className="rm-ledger">
                <div><dt>Answer</dt><dd>Yes, for clips and captions, 12 months</dd></div>
                <div><dt>Received</dt><dd>14:32 · on their phone</dd></div>
                <div><dt>Ledger entry</dt><dd className="mono">#7 · 4be1…c09a</dd></div>
              </dl>
              <button type="button" className="rm-sim" onClick={reset}><ArrowCounterClockwise /> Reset the mockup</button>
            </>
          )}
          <p className="rm-foot mono">Sample data. Names, times and hashes are made up.</p>
        </aside>
      </div>

      <span className="prototag"><i /> mockup · sample data · not the final build</span>
    </main>
  );
}
