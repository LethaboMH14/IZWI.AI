// A tiny markdown subset for assistant replies: paragraphs, bold, italics, lists and inline code.
// It returns a plain tree, never HTML, so React escapes every character. Anything outside the subset
// (raw HTML, images, link targets) stays as literal text and is never made live.

export type Inline = { t: "text" | "b" | "i" | "code"; v: string };
export type Block =
  | { t: "p"; lines: Inline[][] }
  | { t: "ul" | "ol"; items: Inline[][] };

// Links lose their target: "[label](url)" becomes "label (url)". Images are left exactly as typed.
const LINK = /(!?)\[([^\]\n]*)\]\(([^)\s]*)\)/g;
const flattenLinks = (s: string) => s.replace(LINK, (m, bang: string, label: string, url: string) => (bang ? m : `${label} (${url})`));

const SPAN = /`([^`\n]+)`|\*\*([^*\n]+)\*\*|\*([^*\n]+)\*|(?<![A-Za-z0-9])_([^_\n]+)_(?![A-Za-z0-9])/g;

export function parseInline(src: string): Inline[] {
  const s = flattenLinks(src);
  const out: Inline[] = [];
  let at = 0;
  for (const m of s.matchAll(SPAN)) {
    const i = m.index ?? 0;
    if (i > at) out.push({ t: "text", v: s.slice(at, i) });
    if (m[1] !== undefined) out.push({ t: "code", v: m[1] });
    else if (m[2] !== undefined) out.push({ t: "b", v: m[2] });
    else out.push({ t: "i", v: m[3] ?? m[4] });
    at = i + m[0].length;
  }
  if (at < s.length) out.push({ t: "text", v: s.slice(at) });
  return out;
}

const UL = /^\s{0,3}[-*+]\s+(.*)$/;
const OL = /^\s{0,3}\d{1,3}[.)]\s+(.*)$/;

export function parseMarkdown(text: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ t: "p", lines: para.map(parseInline) });
    para = [];
  };
  for (const line of text.replace(/\r\n?/g, "\n").split("\n")) {
    const ul = UL.exec(line);
    const ol = ul ? null : OL.exec(line);
    const hit = ul ?? ol;
    if (hit) {
      flush();
      const t = ul ? "ul" : "ol";
      const last = blocks[blocks.length - 1];
      if (last && last.t === t) last.items.push(parseInline(hit[1]));
      else blocks.push({ t, items: [parseInline(hit[1])] });
    } else if (line.trim() === "") flush();
    else {
      const last = blocks[blocks.length - 1];
      if (para.length === 0 && last && (last.t === "ul" || last.t === "ol") && /^\s+\S/.test(line)) last.items[last.items.length - 1].push({ t: "text", v: " " }, ...parseInline(line.trim()));
      else para.push(line);
    }
  }
  flush();
  return blocks;
}

// The warning chips on an assistant reply: the creator's only view of what the server held back from the model.
export function metaChips(data: { redacted?: number; excludedLines?: number }) {
  const n = data.redacted ?? 0, held = data.excludedLines ?? 0;
  const chips: { text: string; title?: string }[] = [];
  if (n > 0) chips.push({ text: n === 1 ? "1 item redacted" : `${n} items redacted` });
  if (held > 0) chips.push({
    text: held === 1 ? "1 transcript line held back: possible instruction" : `${held} transcript lines held back: possible instructions`,
    title: "The injection check scored these lines as instructions, so the assistant never saw them. The check is trained on English only and can miss other languages.",
  });
  return chips;
}
