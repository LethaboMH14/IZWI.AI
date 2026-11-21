// Clip suggestions without a model. Every reason shown to the creator is a fact measured from the transcript:
// pauses, sentence edges, question-and-answer pairs, a line repeated elsewhere, length and pace.
import type { Seg } from "./captions";

export type ClipIdea = { startMs: number; endMs: number; title: string; reason: string; score: number };
type Sentence = { startMs: number; endMs: number; text: string; words: number; question: boolean };

export function sentences(segs: Seg[]): Sentence[] {
  const out: Sentence[] = [];
  let buf: { w: string; s: number; e: number }[] = [];
  const flush = () => {
    if (!buf.length) return;
    const text = buf.map((w) => w.w).join(" ").trim();
    out.push({ startMs: buf[0].s, endMs: buf[buf.length - 1].e, text, words: buf.length, question: /\?["']?$/.test(text) });
    buf = [];
  };
  for (const seg of segs) {
    const words = seg.words.length ? seg.words : [{ w: seg.text, s: seg.startMs, e: seg.endMs }];
    for (const w of words) {
      buf.push(w);
      if (/[.!?]["']?$/.test(w.w)) flush();
    }
  }
  flush();
  return out;
}

const key = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s']/gu, "").split(/\s+/).filter(Boolean);

function repeatedLine(all: Sentence[], i: number, j: number): string | null {
  const inside = new Set<string>();
  for (let k = i; k <= j; k++) {
    const w = key(all[k].text);
    for (let n = 0; n + 4 <= w.length; n++) inside.add(w.slice(n, n + 4).join(" "));
  }
  for (let k = 0; k < all.length; k++) {
    if (k >= i && k <= j) continue;
    const w = key(all[k].text);
    for (let n = 0; n + 4 <= w.length; n++) {
      const g = w.slice(n, n + 4).join(" ");
      if (inside.has(g)) return g;
    }
  }
  return null;
}

const secs = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

function trimTitle(t: string) {
  const clean = t.replace(/\s+/g, " ").trim();
  if (clean.length <= 60) return clean.replace(/[.,;:]$/, "");
  return clean.slice(0, 60).replace(/\s+\S*$/, "") + "…";
}

export function suggestClips(segs: Seg[], o: { count: number; minMs: number; maxMs: number; targetMs: number }): ClipIdea[] {
  const s = sentences(segs);
  const cands: ClipIdea[] = [];
  for (let i = 0; i < s.length; i++) {
    for (let j = i; j < s.length; j++) {
      const dur = s[j].endMs - s[i].startMs;
      if (dur > o.maxMs) break;
      if (dur < o.minMs) continue;
      const before = i > 0 ? s[i].startMs - s[i - 1].endMs : s[i].startMs;
      const after = j < s.length - 1 ? s[j + 1].startMs - s[j].endMs : 1500;
      let qa = false;
      for (let k = i; k < j; k++) if (s[k].question && !s[k + 1].question) qa = true;
      const words = s.slice(i, j + 1).reduce((a, x) => a + x.words, 0);
      const pace = words / (dur / 1000);
      const echo = repeatedLine(s, i, j);
      let score = 2 * Math.min(before, 1500) / 1500 + 2 * Math.min(after, 1500) / 1500;
      score += qa ? 1.5 : 0;
      score += echo ? 1.2 : 0;
      score += pace >= 1.8 && pace <= 3.4 ? 0.5 : 0;
      score += Math.max(0, 1 - Math.abs(dur - o.targetMs) / o.targetMs);
      if (s[i].question && i === j) score -= 1; // a lone question is not a clip

      const reasons: string[] = [];
      reasons.push(before >= 400 ? `Starts after a ${secs(before)} pause` : "Starts on a new sentence");
      reasons.push(after >= 400 ? `ends on a full sentence before a ${secs(after)} pause` : "ends on a full sentence");
      if (qa) reasons.push("holds a question and its answer");
      if (echo) reasons.push(`the words “${echo}” come back elsewhere in the recording`);
      reasons.push(`${Math.round(dur / 1000)} s at ${pace.toFixed(1)} words a second`);

      const titleFrom = echo ? s.slice(i, j + 1).find((x) => key(x.text).join(" ").includes(echo)) : qa ? s.slice(i, j + 1).find((x, k) => k > 0 && s[i + k - 1].question) : s[i];
      cands.push({ startMs: s[i].startMs, endMs: s[j].endMs, title: trimTitle((titleFrom ?? s[i]).text), reason: reasons.join(", ") + ".", score: Math.round(score * 100) / 100 });
    }
  }
  cands.sort((a, b) => b.score - a.score || a.startMs - b.startMs);
  const picked: ClipIdea[] = [];
  for (const c of cands) {
    if (picked.length >= o.count) break;
    if (picked.some((p) => c.startMs < p.endMs + 1000 && c.endMs > p.startMs - 1000)) continue;
    picked.push(c);
  }
  return picked.sort((a, b) => a.startMs - b.startMs);
}

export const clipDefaults: Record<string, { minMs: number; maxMs: number; targetMs: number }> = {
  podcast: { minMs: 12000, maxMs: 75000, targetMs: 35000 },
  video: { minMs: 8000, maxMs: 60000, targetMs: 25000 },
  lesson: { minMs: 20000, maxMs: 120000, targetMs: 60000 },
  music: { minMs: 10000, maxMs: 45000, targetMs: 25000 },
  film: { minMs: 10000, maxMs: 90000, targetMs: 40000 },
  animation: { minMs: 8000, maxMs: 60000, targetMs: 20000 },
  client: { minMs: 8000, maxMs: 60000, targetMs: 25000 },
};
