import { describe, expect, it } from "vitest";
import { parseMarkdown, type Block, type Inline } from "../src/components/studio/assistant-render";

const inlines = (bs: Block[]): Inline[] => bs.flatMap((b) => (b.t === "p" ? b.lines.flat() : b.items.flat()));
const allText = (bs: Block[]) => inlines(bs).map((i) => i.v).join("");

describe("parseMarkdown: inert text", () => {
  it("keeps a script tag as literal text", () => {
    const bs = parseMarkdown("<script>alert(1)</script>");
    expect(inlines(bs).every((i) => i.t === "text")).toBe(true);
    expect(allText(bs)).toBe("<script>alert(1)</script>");
  });
  it("keeps an img tag and other raw HTML as literal text", () => {
    const src = '<img src=x onerror=alert(1)> <b>hi</b> <a href="javascript:alert(1)">x</a>';
    const bs = parseMarkdown(src);
    expect(inlines(bs).every((i) => i.t === "text")).toBe(true);
    expect(allText(bs)).toBe(src);
  });
  it("drops the live target of a javascript: link and shows it as text", () => {
    const bs = parseMarkdown("[click](javascript:alert(1))");
    expect(allText(bs)).toBe("click (javascript:alert(1))");
    expect(inlines(bs).every((i) => i.t === "text")).toBe(true);
  });
  it("leaves a markdown image as literal text", () => {
    const bs = parseMarkdown("![logo](https://example.com/a.png)");
    expect(allText(bs)).toBe("![logo](https://example.com/a.png)");
    expect(inlines(bs).every((i) => i.t === "text")).toBe(true);
  });
  it("only ever produces the allowed node types", () => {
    const bs = parseMarkdown("# h\n**a** *b* `c` <x>\n- one\n1. two\n[l](u)");
    for (const b of bs) expect(["p", "ul", "ol"]).toContain(b.t);
    for (const i of inlines(bs)) expect(["text", "b", "i", "code"]).toContain(i.t);
  });
});

describe("parseMarkdown: the subset", () => {
  it("renders bold, italics and inline code", () => {
    const bs = parseMarkdown("a **bold** and *soft* and `code` end");
    expect(inlines(bs)).toEqual([
      { t: "text", v: "a " }, { t: "b", v: "bold" }, { t: "text", v: " and " }, { t: "i", v: "soft" },
      { t: "text", v: " and " }, { t: "code", v: "code" }, { t: "text", v: " end" },
    ]);
  });
  it("does not interpret markup inside inline code", () => {
    expect(inlines(parseMarkdown("`**no**`"))).toEqual([{ t: "code", v: "**no**" }]);
  });
  it("groups consecutive list lines and splits paragraphs on blank lines", () => {
    const bs = parseMarkdown("First.\n\nSecond.\n- a\n- b\n\n1. x\n2. y");
    expect(bs.map((b) => b.t)).toEqual(["p", "p", "ul", "ol"]);
    expect((bs[2] as { items: unknown[] }).items).toHaveLength(2);
    expect((bs[3] as { items: unknown[] }).items).toHaveLength(2);
  });
});
