// Home: your stories, with honest counts. Everything here is read from this workspace's own records.
import Link from "next/link";
import { NewStory } from "@/components/NewStory";
import { clock, ago, media } from "@/lib/format";
import { KIND_LABEL } from "@/lib/kinds";
import { one } from "@/server/db";
import { pageCtx } from "@/server/guard";
import { projectList } from "@/server/state";
import "../entry.css";

export const dynamic = "force-dynamic";

type Row = ReturnType<typeof projectList>[number];

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function summary(rows: Row[]) {
  const sum = (f: (r: Row) => number) => rows.reduce((t, r) => t + f(r), 0);
  const waiting = sum((r) => r.counts.waiting), ready = sum((r) => r.counts.ready), running = sum((r) => r.counts.running), failed = sum((r) => r.counts.failed);
  const parts = [plural(rows.length, "story", "stories")];
  if (waiting) parts.push(`${plural(waiting, "render")} held`);
  parts.push(`${plural(ready, "render")} ready`);
  if (running) parts.push(`${running} being worked on`);
  if (failed) parts.push(`${failed} needs a retry`);
  return parts.join(" · ");
}

function chips(p: Row) {
  const c = p.counts;
  const out: { cls: string; text: string }[] = [];
  if (!p.filename) out.push({ cls: "s-planned", text: "Waiting for a file" });
  if (c.running) out.push({ cls: "s-draft", text: `${c.running} working` });
  if (c.failed) out.push({ cls: "s-blocked", text: `${c.failed} failed` });
  if (c.clips) out.push({ cls: c.kept ? "s-done" : "s-draft", text: `${c.kept} of ${plural(c.clips, "clip")} kept` });
  if (c.people) out.push({ cls: "s-off", text: plural(c.people, "person", "people") });
  if (c.waiting) out.push({ cls: "s-blocked", text: `${c.waiting} held` });
  if (c.outputs) out.push({ cls: c.ready ? "s-done" : "s-off", text: `${c.ready} of ${plural(c.outputs, "render")} ready` });
  return out;
}

export default async function Home() {
  const ctx = await pageCtx();
  const rows = projectList(ctx);
  const ws = one<{ name: string }>(`SELECT name FROM organization WHERE id = ?`, ctx.workspaceId);
  const first = ctx.userName.trim().split(/\s+/)[0] || "there";

  if (rows.length === 0) {
    return (
      <div className="home home-empty">
        <header>
          <p className="mono">{ws?.name ?? "Your workspace"}</p>
          <h1>Sawubona, {first}.</h1>
          <p>Nothing here yet. Your first story takes one file.</p>
        </header>
        <NewStory empty />
      </div>
    );
  }

  return (
    <div className="home">
      <header>
        <p className="mono">{ws?.name ?? "Your workspace"}</p>
        <h1>Sawubona, {first}.</h1>
        <p>{summary(rows)}</p>
      </header>

      <ul className="stories" aria-label="Your stories">
        {rows.map((p) => {
          const stage = chips(p);
          return (
            <li key={p.id}>
              <Link href={`/app/p/${p.id}`} className="storyrow">
                {p.posterId ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={media(p.posterId)} alt="" loading="lazy" />
                ) : (
                  <div className="cover-empty" aria-hidden="true"><span>{KIND_LABEL[p.kind]?.slice(0, 1) ?? "S"}</span></div>
                )}
                <div className="sr-main">
                  <span className="mono">{KIND_LABEL[p.kind] ?? p.kind}{p.durationMs ? ` · ${clock(p.durationMs)}` : ""} · {ago(p.updatedAt)}</span>
                  <h2>{p.title}</h2>
                  <p className="sr-status">{stage.map((s) => s.text).join(" / ") || "Ready to start"}</p>
                  <span className="sr-open">Open story &rarr;</span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>

      <NewStory />
    </div>
  );
}
