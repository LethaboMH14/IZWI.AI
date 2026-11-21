"use client";

import { useMemo, useState } from "react";
import { geoNaturalEarth1, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import type { Topology } from "topojson-specification";
import land110 from "world-atlas/land-110m.json";
import { Check, Plus } from "@phosphor-icons/react";
import { hearLabel, home, markets } from "@/lib/platform";

const W = 1000, H = 500;

// One voice, every market: strands run from Johannesburg to each market a story could reach.
// Each language shows which open model lists it. That is availability, not tested quality.
export function MarketMap() {
  const [sel, setSel] = useState("za");
  const [added, setAdded] = useState<string[]>(["za", "ea", "fr", "pt"]);
  const { d, pts, origin } = useMemo(() => {
    const topo = land110 as unknown as Topology;
    const land = feature(topo, topo.objects.land);
    // Frame the inhabited band the markets sit in, so the map fills the panel instead of showing empty ocean and ice.
    const frame = { type: "MultiPoint" as const, coordinates: [[-112, -42], [-112, 60], [92, -42], [92, 60]] };
    const proj = geoNaturalEarth1().fitExtent([[0, 0], [W, H]], frame);
    return {
      d: geoPath(proj)(land) ?? "",
      origin: proj([home.lon, home.lat]) as [number, number],
      pts: markets.map((m) => ({ ...m, xy: proj([m.lon, m.lat]) as [number, number] })),
    };
  }, []);
  const m = markets.find((x) => x.id === sel)!;
  const total = markets.filter((x) => added.includes(x.id)).flatMap((x) => x.langs).length;
  const toggle = (id: string) => setAdded((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]));

  return (
    <section className="marketmap">
      <div className="mm-map">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="World map with strands from Johannesburg to nine markets">
          <path className="mm-land" d={d} />
          {pts.filter((p) => p.id !== "za").map((p, i) => {
            const [x1, y1] = origin, [x2, y2] = p.xy;
            const lift = Math.hypot(x2 - x1, y2 - y1) * 0.32;
            const on = added.includes(p.id);
            return <path key={p.id} pathLength={1} style={{ ["--i" as string]: i }} className={"mm-arc" + (on ? " on" : "") + (sel === p.id ? " sel" : "")} d={`M${x1},${y1} Q${(x1 + x2) / 2},${(y1 + y2) / 2 - lift} ${x2},${y2}`} />;
          })}
          {pts.map((p) => (
            <g key={p.id} className={"mm-pt" + (added.includes(p.id) ? " on" : "") + (sel === p.id ? " sel" : "")} transform={`translate(${p.xy[0]},${p.xy[1]})`}
              tabIndex={0} role="button" aria-label={`${p.name}, ${p.langs.length} languages`} onClick={() => setSel(p.id)} onKeyDown={(e) => e.key === "Enter" && setSel(p.id)}>
              <circle r="16" className="mm-halo" />
              <circle r="6.5" />
              <text y="-13" textAnchor="middle">{p.city}</text>
            </g>
          ))}
        </svg>
        <p className="mm-count"><b>{added.length}</b> {added.length === 1 ? "market" : "markets"} · <b>{total}</b> languages on this story</p>
      </div>
      <aside className="mm-side" key={m.id}>
        <h2>{m.name}</h2>
        <button className={"btn " + (added.includes(m.id) ? "btn-quiet" : "")} onClick={() => toggle(m.id)}>
          {added.includes(m.id) ? <><Check weight="bold" /> On this story</> : <><Plus weight="bold" /> Add this market</>}
        </button>
        <table>
          <thead><tr><th>Language</th><th>Hear it</th><th>Translate</th><th>Voice</th></tr></thead>
          <tbody>
            {m.langs.map((l) => (
              <tr key={l.code}>
                <th scope="row">{l.name}</th>
                <td className={l.hear === "none" ? "no" : "yes"}>{hearLabel[l.hear]}</td>
                <td className={l.translate ? "yes" : "no"}>{l.translate ? "MADLAD-400" : "None confirmed"}</td>
                <td className="no">None confirmed</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="fine">“Hear” and “Translate” name an openly licensed model whose card lists the language. None has been tested by IZWI yet, and every translation stays a draft until a speaker approves it. Lelapa AI, Meta NLLB and Meta MMS also cover these languages but their open releases are for non-commercial use.</p>
      </aside>
    </section>
  );
}
