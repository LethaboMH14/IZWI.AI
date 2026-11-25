// Caption timing and formats. Pure functions, unit-tested in tests/captions.test.ts.
export type Word = { w: string; s: number; e: number; p?: number; g?: boolean };
export type Seg = { startMs: number; endMs: number; text: string; words: Word[] };
export type CapLine = { startMs: number; endMs: number; text: string; words: Word[] };
export type GlossaryEntry = { term: string; heard?: string[] };

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}']+/gu, "");

function fallbackWords(s: Seg): Word[] {
  const parts = s.text.split(/\s+/).filter(Boolean);
  const step = (s.endMs - s.startMs) / Math.max(1, parts.length);
  return parts.map((w, i) => ({ w, s: Math.round(s.startMs + i * step), e: Math.round(s.startMs + (i + 1) * step) }));
}

// Replace misheard phrases with the workspace's spelling, keeping timing. Marks glossary words with g: true.
export function applyGlossary(segs: Seg[], glossary: GlossaryEntry[]): { segs: Seg[]; fixes: number } {
  let fixes = 0;
  const rules = glossary.flatMap((g) => [g.term, ...(g.heard ?? [])].map((h) => ({ from: h.split(/\s+/).map(norm).filter(Boolean), to: g.term.split(/\s+/), isTerm: h === g.term })));
  const out = segs.map((seg) => {
    const words = seg.words.length ? seg.words.map((w) => ({ ...w })) : fallbackWords(seg);
    for (const r of rules) {
      if (!r.from.length) continue;
      for (let i = 0; i + r.from.length <= words.length; i++) {
        if (!r.from.every((f, k) => norm(words[i + k].w) === f)) continue;
        const span = words.slice(i, i + r.from.length);
        const tail = /[.,!?;:]+$/.exec(span[span.length - 1].w)?.[0] ?? "";
        const start = span[0].s, end = span[span.length - 1].e, step = (end - start) / r.to.length;
        const repl = r.to.map((t, k) => ({ w: t + (k === r.to.length - 1 ? tail : ""), s: Math.round(start + k * step), e: Math.round(start + (k + 1) * step), g: true }));
        words.splice(i, r.from.length, ...repl);
        if (!r.isTerm) fixes++;
        i += repl.length - 1;
      }
    }
    return { ...seg, words, text: words.map((w) => w.w).join(" ") };
  });
  return { segs: out, fixes };
}

// Where to break a caption into two rows: among breaks that keep both rows within maxChars, the one closest
// to the middle, preferring a break after a comma. Falls back to the middle-most break if none fits.
// South African language names that speech models split or misspell ("ISI Zulu", "Se Sotho").
// Whisper is often confident about these, so word confidence alone does not catch them.
const SA_SPLIT = /\b(isi|si|se|tshi|xi)\s+(zulu|xhosa|ndebele|swati|sotho|tswana|pedi|venda|tsonga)\b/i;
export function lineFlag(text: string, words: { p?: number }[]): string | null {
  if (SA_SPLIT.test(text.replace(/\n/g, " "))) return "Check spelling: a South African language name looks split.";
  if (words.some((w) => (w.p ?? 1) < 0.4)) return "Low confidence: listen and check.";
  return null;
}

export function breakIndex(words: { w: string }[], maxChars: number): number {
  const text = words.map((w) => w.w).join(" ");
  if (text.length <= maxChars || words.length < 2) return -1;
  let best = -1, bestCost = Infinity, pos = 0;
  for (let i = 1; i < words.length; i++) {
    pos += words[i - 1].w.length + (i > 1 ? 1 : 0);
    const left = pos, right = text.length - pos - 1;
    const over = Math.max(0, left - maxChars) + Math.max(0, right - maxChars);
    const cost = over * 1000 + Math.abs(left - right) - (/[,;:]$/.test(words[i - 1].w) ? 6 : 0);
    if (cost < bestCost) { best = i; bestCost = cost; }
  }
  return best;
}

// True when the words fit in one row, or in two rows that both stay within maxChars.
export function fitsRows(words: { w: string }[], maxChars: number): boolean {
  const text = words.map((w) => w.w).join(" ");
  if (text.length <= maxChars) return true;
  const b = breakIndex(words, maxChars);
  if (b < 0) return false;
  const left = words.slice(0, b).map((w) => w.w).join(" ").length;
  return left <= maxChars && text.length - left - 1 <= maxChars;
}

export function lineText(words: { w: string }[], maxChars = 42) {
  const b = breakIndex(words, maxChars);
  const t = (ws: { w: string }[]) => ws.map((w) => w.w).join(" ");
  return b < 0 ? t(words) : `${t(words.slice(0, b))}\n${t(words.slice(b))}`;
}

const endsSentence = (w: string) => /[.!?]["')]?$/.test(w);
const endsClause = (w: string) => /[,;:]["')]?$/.test(w);
const chars = (ws: Word[]) => ws.reduce((n, w, i) => n + w.w.length + (i ? 1 : 0), 0);

// Subtitle-style line building, sentence first:
// 1. Cut the word stream into sentences. A pause starts a new unit only if it is long or follows a sentence or clause end.
// 2. A sentence too long for one caption is split into balanced pieces, preferring breaks after commas.
// 3. A very short piece joins its neighbour when they are close in time and still fit.
export function buildLines(segs: Seg[], o = { maxChars: 42, maxRows: 2, maxMs: 6000, minMs: 900, gapMs: 700, longGapMs: 1500, minLineChars: 16 }): CapLine[] {
  const words = segs.flatMap((s) => (s.words.length ? s.words : fallbackWords(s)));
  const fits = (ws: Word[]) => fitsRows(ws, o.maxChars) && chars(ws) <= o.maxChars * o.maxRows && ws[ws.length - 1].e - ws[0].s <= o.maxMs;

  const units: Word[][] = [];
  let u: Word[] = [];
  for (const w of words) {
    if (u.length) {
      const prev = u[u.length - 1];
      const gap = w.s - prev.e;
      if (gap > o.longGapMs || (gap > o.gapMs && (endsSentence(prev.w) || endsClause(prev.w)))) {
        units.push(u);
        u = [];
      }
    }
    u.push(w);
    if (endsSentence(w.w)) {
      units.push(u);
      u = [];
    }
  }
  if (u.length) units.push(u);

  const split = (ws: Word[]): Word[][] => {
    if (fits(ws)) return [ws];
    const n = Math.max(2, Math.ceil(chars(ws) / (o.maxChars * o.maxRows * 0.85)), Math.ceil((ws[ws.length - 1].e - ws[0].s) / o.maxMs));
    const target = chars(ws) / n;
    const out: Word[][] = [];
    let start = 0;
    while (start < ws.length) {
      const rest = ws.slice(start);
      if (fits(rest)) {
        out.push(rest);
        break;
      }
      let best = start, bestCost = Infinity;
      for (let k = start; k < ws.length - 1; k++) {
        const piece = ws.slice(start, k + 1);
        if (!fits(piece)) break;
        const cost = Math.abs(chars(piece) - target) - (endsClause(ws[k].w) ? target * 0.3 : 0);
        if (cost < bestCost) {
          best = k;
          bestCost = cost;
        }
      }
      out.push(ws.slice(start, best + 1));
      start = best + 1;
    }
    return out;
  };

  const pieces = units.flatMap(split);
  const merged: Word[][] = [];
  for (const p of pieces) {
    const last = merged[merged.length - 1];
    if (last && chars(last) < o.minLineChars && p[0].s - last[last.length - 1].e <= 400 && fits(last.concat(p))) merged[merged.length - 1] = last.concat(p);
    else merged.push(p);
  }

  const lines: CapLine[] = merged.map((ws) => ({ startMs: ws[0].s, endMs: Math.max(ws[ws.length - 1].e, ws[0].s + o.minMs), text: lineText(ws, o.maxChars), words: ws }));
  for (let i = 0; i < lines.length - 1; i++) if (lines[i].endMs > lines[i + 1].startMs) lines[i].endMs = lines[i + 1].startMs;
  return lines.filter((l) => l.endMs > l.startMs);
}

const pad = (n: number, w = 2) => String(n).padStart(w, "0");
export function stamp(ms: number, sep = ",") {
  const t = Math.max(0, Math.round(ms));
  return `${pad(Math.floor(t / 3600000))}:${pad(Math.floor(t / 60000) % 60)}:${pad(Math.floor(t / 1000) % 60)}${sep}${pad(t % 1000, 3)}`;
}

export function toSRT(lines: { startMs: number; endMs: number; text: string }[]) {
  return lines.map((l, i) => `${i + 1}\n${stamp(l.startMs)} --> ${stamp(l.endMs)}\n${l.text}\n`).join("\n");
}

export function toVTT(lines: { startMs: number; endMs: number; text: string }[]) {
  return "WEBVTT\n\n" + lines.map((l) => `${stamp(l.startMs, ".")} --> ${stamp(l.endMs, ".")}\n${l.text}\n`).join("\n");
}

export const cps = (l: { startMs: number; endMs: number; text: string }) =>
  l.text.replace(/\s+/g, " ").trim().length / Math.max(0.001, (l.endMs - l.startMs) / 1000);

// Cut a clip's captions out of the full track, with times relative to the clip start.
export function sliceLines<T extends { startMs: number; endMs: number; text: string; words?: Word[] | null }>(lines: T[], startMs: number, endMs: number): CapLine[] {
  return lines
    .filter((l) => l.endMs > startMs && l.startMs < endMs)
    .map((l) => ({
      startMs: Math.max(0, l.startMs - startMs),
      endMs: Math.min(endMs, l.endMs) - startMs,
      text: l.text,
      words: (l.words ?? []).filter((w) => w.e > startMs && w.s < endMs).map((w) => ({ ...w, s: Math.max(0, w.s - startMs), e: Math.min(endMs, w.e) - startMs })),
    }))
    .filter((l) => l.endMs > l.startMs);
}

const assTime = (ms: number) => {
  const cs = Math.max(0, Math.round(ms / 10));
  return `${Math.floor(cs / 360000)}:${pad(Math.floor(cs / 6000) % 60)}:${pad(Math.floor(cs / 100) % 60)}.${pad(cs % 100)}`;
};
const assEscape = (s: string) => s.replace(/\\/g, "\\\\").replace(/[{}]/g, "");

// Styled captions for burning in. Karaoke mode fills each word in gold as it is spoken (needs word timing).
export function toASS(lines: CapLine[], o: { width: number; height: number; font: string; karaoke: boolean }) {
  const size = Math.round(Math.min(o.width, o.height) * 0.062);
  const marginV = Math.round(o.height * (o.height > o.width ? 0.14 : 0.08));
  const head = [
    "[Script Info]", "ScriptType: v4.00+", `PlayResX: ${o.width}`, `PlayResY: ${o.height}`, "WrapStyle: 2", "ScaledBorderAndShadow: yes", "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    // Spoken words turn gold (#E9A21B), unspoken stay white, outlined in ink (#211E1A). ASS colours are &HAABBGGRR.
    `Style: Caption,${o.font},${size},&H001BA2E9,&H00FFFFFF,&H001A1E21,&H64000000,0,0,0,0,100,100,0,0,1,${Math.max(3, Math.round(size / 11))},2,2,${Math.round(o.width * 0.08)},${Math.round(o.width * 0.08)},${marginV},1`,
    "", "[Events]", "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];
  const events = lines.map((l) => {
    let text: string;
    if (o.karaoke && l.words.length) {
      const b = breakIndex(l.words, 42);
      const parts: string[] = [];
      let t = l.startMs;
      l.words.forEach((w, i) => {
        if (w.s > t) parts.push(`{\\k${Math.round((w.s - t) / 10)}}`);
        const next = i < l.words.length - 1 ? Math.max(w.e, l.words[i + 1].s) : Math.max(w.e, l.endMs);
        parts.push(`${i === b ? "\\N" : i ? " " : ""}{\\k${Math.max(1, Math.round((next - Math.max(w.s, t)) / 10))}}${assEscape(w.w)}`);
        t = next;
      });
      text = parts.join("");
    } else text = assEscape(l.text).replace(/\n/g, "\\N");
    return `Dialogue: 0,${assTime(l.startMs)},${assTime(l.endMs)},Caption,,0,0,0,,${o.karaoke ? text : `{\\1c&HFFFFFF&}${text}`}`;
  });
  return [...head, ...events, ""].join("\n");
}
