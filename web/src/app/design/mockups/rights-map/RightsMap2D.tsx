// The 2D Rights map (the default): who is in the episode → which clips they appear in → where each clip goes.
// One picture answers "why is this clip held?". Colours: held = clay, draft = gold, ready = moss.
import { CLIPS, EPISODE, STATUS_COLOR, STATUS_WORD, clipStatus, clock, samplePeaks, type Output, type Person } from "../sample";

const W = 1000, H = 520;
const STRIP = { x: 20, y: 18, w: 960, h: 64 };
const BARS = 200;
const peaks = samplePeaks(BARS);
const r2 = (n: number) => Math.round(n * 100) / 100; // identical on server and client
const tx = (ms: number) => r2(STRIP.x + (ms / EPISODE.durationMs) * STRIP.w);

const PX = 20, PW = 230, CX = 365, CW = 270, OX = 750, OW = 230;
const ROW = [168, 280, 392];
const personY = (i: number) => ROW[i] + 4;

const curve = (x1: number, y1: number, x2: number, y2: number) => {
  const m = (x1 + x2) / 2;
  return `M${x1},${y1} C${m},${y1} ${m},${y2} ${x2},${y2}`;
};

export function RightsMap2D({ people, outputs, focus, onFocus }: { people: Person[]; outputs: Record<string, Output>; focus: string | null; onFocus: (id: string) => void }) {
  const outRows: { o: Output; clip: string; y: number }[] = [];
  CLIPS.forEach((c, ci) => c.outputs.forEach((o, k) => outRows.push({ o: outputs[o.id] ?? o, clip: c.id, y: ROW[ci] + k * 48 })));
  const status = (cid: string) => {
    const c = CLIPS.find((x) => x.id === cid)!;
    return clipStatus({ ...c, outputs: c.outputs.map((o) => outputs[o.id] ?? o) }, people);
  };

  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} className="rm-svg" role="img" aria-label="Rights map: people, clips and outputs for this episode">
        {/* the episode */}
        <rect x={STRIP.x} y={STRIP.y} width={STRIP.w} height={STRIP.h} rx="14" fill="#fff" stroke="#ddd8cc" />
        {CLIPS.map((c, i) => {
          const s = status(c.id);
          return (
            <g key={c.id}>
              <rect x={tx(c.startMs)} y={STRIP.y + 4} width={Math.max(10, tx(c.endMs) - tx(c.startMs))} height={STRIP.h - 8} rx="6" fill={STATUS_COLOR[s]} opacity="0.16" className="rm-t" />
              <circle cx={tx(c.startMs) + 5} cy={STRIP.y - 2} r="9" fill={STATUS_COLOR[s]} className="rm-t" />
              <text x={tx(c.startMs) + 5} y={STRIP.y + 1.5} textAnchor="middle" className="rm-badge">{i + 1}</text>
            </g>
          );
        })}
        {peaks.map((p, i) => {
          const ms = (i / BARS) * EPISODE.durationMs;
          const c = CLIPS.find((x) => ms >= x.startMs - 8000 && ms <= x.endMs + 8000);
          const x = r2(STRIP.x + 8 + (i / BARS) * (STRIP.w - 16));
          const h = r2(6 + p * (STRIP.h - 22));
          return <rect key={i} x={x} y={r2(STRIP.y + STRIP.h / 2 - h / 2)} width="2.4" height={h} rx="1.2" fill={c ? STATUS_COLOR[status(c.id)] : "#cfc6b4"} className="rm-t" />;
        })}
        {["00:00", "07:00", "14:00", "21:00", clock(EPISODE.durationMs)].map((t, i) => (
          <text key={t} x={STRIP.x + (i / 4) * STRIP.w} y={STRIP.y + STRIP.h + 16} textAnchor={i === 0 ? "start" : i === 4 ? "end" : "middle"} className="rm-time">{t}</text>
        ))}

        <text x={PX} y={140} className="rm-col">People in it</text>
        <text x={CX} y={140} className="rm-col">Clips</text>
        <text x={OX} y={140} className="rm-col">Where they go</text>

        {/* consent lines: person → clip */}
        {CLIPS.map((c, ci) => c.people.map((pid) => {
          const pi = people.findIndex((p) => p.id === pid);
          const p = people[pi];
          const waiting = p.consent === "waiting";
          return (
            <path key={c.id + pid} d={curve(PX + PW, personY(pi) + 36, CX, ROW[ci] + 40)} fill="none"
              stroke={waiting ? "#C4552D" : "#4F6B3A"} strokeWidth={waiting ? 2 : 1.6} strokeDasharray={waiting ? "6 6" : undefined}
              opacity={focus && focus !== c.id ? 0.18 : 0.85} className={"rm-t" + (waiting ? " rm-wait" : "")} />
          );
        }))}
        {/* clip → output */}
        {outRows.map(({ o, clip, y }) => {
          const ci = CLIPS.findIndex((c) => c.id === clip);
          return <path key={o.id} d={curve(CX + CW, ROW[ci] + 40, OX, y + 20)} fill="none" stroke={STATUS_COLOR[o.status]} strokeWidth="1.6" opacity={focus && focus !== clip ? 0.18 : 0.85} className="rm-t" />;
        })}

        {/* people */}
        {people.map((p, i) => {
          const ok = p.consent !== "waiting";
          return (
            <g key={p.id} transform={`translate(${PX},${personY(i)})`}>
              <rect width={PW} height="72" rx="16" fill="#fff" stroke={ok ? "#ddd8cc" : "#C4552D"} strokeWidth={ok ? 1 : 1.6} className="rm-t" />
              <circle cx="36" cy="36" r="20" fill={ok ? "#e2ebd8" : "#fbe3d8"} className="rm-t" />
              <text x="36" y="41" textAnchor="middle" className="rm-initials">{p.name.split(" ").map((w) => w[0]).join("").replace(".", "")}</text>
              <text x="68" y="31" className="rm-name">{p.name}</text>
              <text x="68" y="51" className="rm-sub">{p.role}</text>
              <circle cx={PW - 18} cy="36" r="6" fill={ok ? "#4F6B3A" : "#C4552D"} className="rm-t" />
            </g>
          );
        })}

        {/* clips */}
        {CLIPS.map((c, ci) => {
          const s = status(c.id);
          return (
            <g key={c.id} transform={`translate(${CX},${ROW[ci]})`} className="rm-node" tabIndex={0} role="button" aria-label={`Clip ${ci + 1}, ${c.title}, ${STATUS_WORD[s]}`}
              onClick={() => onFocus(c.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onFocus(c.id); }}>
              <rect width={CW} height="80" rx="16" fill="#fff" stroke={focus === c.id ? "#211e1a" : STATUS_COLOR[s]} strokeWidth={focus === c.id ? 2 : 1.4} className="rm-t" />
              <rect x="0" y="0" width="6" height="80" rx="3" fill={STATUS_COLOR[s]} className="rm-t" />
              <text x="22" y="28" className="rm-mono">{ci + 1} · {clock(c.startMs)}–{clock(c.endMs)}</text>
              <text x="22" y="52" className="rm-name">{c.title}</text>
              <rect x={CW - 72} y="14" width="58" height="22" rx="11" fill={STATUS_COLOR[s]} className="rm-t" />
              <text x={CW - 43} y="29" textAnchor="middle" className="rm-pill">{STATUS_WORD[s]}</text>
              <text x="22" y="70" className="rm-sub">{c.people.length} {c.people.length === 1 ? "person" : "people"} · {c.outputs.length} output{c.outputs.length === 1 ? "" : "s"}</text>
            </g>
          );
        })}

        {/* outputs */}
        {outRows.map(({ o, clip, y }) => (
          <g key={o.id} transform={`translate(${OX},${y})`} opacity={focus && focus !== clip ? 0.4 : 1}>
            <rect width={OW} height="40" rx="12" fill="#fff" stroke="#ddd8cc" />
            <circle cx="18" cy="20" r="5" fill={STATUS_COLOR[o.status]} className="rm-t" />
            <text x="32" y="18" className="rm-out">{o.label}</text>
            <text x="32" y="32" className="rm-sub">{o.note}</text>
          </g>
        ))}
      </svg>

      {/* phone: the same map as a list */}
      <ol className="rm-list">
        {CLIPS.map((c, ci) => {
          const s = status(c.id);
          return (
            <li key={c.id} style={{ ["--sc" as string]: STATUS_COLOR[s] }}>
              <div className="rm-li-head">
                <span className="mono">{ci + 1} · {clock(c.startMs)}–{clock(c.endMs)}</span>
                <b className="rm-li-pill">{STATUS_WORD[s]}</b>
              </div>
              <h3>{c.title}</h3>
              <div className="rm-li-people">
                {c.people.map((pid) => {
                  const p = people.find((x) => x.id === pid)!;
                  return <span key={pid} className={p.consent === "waiting" ? "wait" : "ok"}>{p.name} · {p.consent === "waiting" ? "waiting" : p.consent === "declared" ? "declared" : "said yes"}</span>;
                })}
              </div>
              <ul>
                {c.outputs.map((o0) => { const o = outputs[o0.id] ?? o0; return <li key={o.id} style={{ ["--oc" as string]: STATUS_COLOR[o.status] }}><i />{o.label}<small>{o.note}</small></li>; })}
              </ul>
            </li>
          );
        })}
      </ol>
    </>
  );
}
