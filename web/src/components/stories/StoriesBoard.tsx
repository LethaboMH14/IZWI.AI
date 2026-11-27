"use client";
// The story library: one card per project with its real poster, recording envelope and counts, a detail panel
// for the selected story, and the same actions on right-click and on the ⋯ button (DESIGN-SYSTEM.md §7).
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { DotsThree, FilmSlate, Globe, Plus } from "@phosphor-icons/react";
import { Button, ContextMenu, DropdownMenu, StatusPill, type MenuItem } from "@/components/z";
import { formatDuration } from "@/lib/timecode";
import { ago, media } from "@/lib/format";

export type StoryCard = {
  id: string;
  title: string;
  kind: string;
  updatedAt: number;
  posterId: string | null;
  durationMs: number | null;
  filename: string | null;
  peaks: number[];
  counts: { clips: number; kept: number; outputs: number; ready: number; tracks: number; people: number; waiting: number; running: number; failed: number };
};

type Filter = "all" | "working" | "ready" | "held";
const FILTERS: { id: Filter; label: string; test: (c: StoryCard) => boolean }[] = [
  { id: "all", label: "All", test: () => true },
  { id: "working", label: "In progress", test: (c) => c.counts.running > 0 || (c.counts.clips > 0 && c.counts.ready === 0) },
  { id: "ready", label: "Ready", test: (c) => c.counts.ready > 0 },
  { id: "held", label: "Held", test: (c) => c.counts.waiting > 0 || c.counts.failed > 0 },
];

function pills(c: StoryCard) {
  const out: { status: "running" | "failed" | "held" | "ready" | "draft" | "unknown"; label: string }[] = [];
  if (!c.filename) out.push({ status: "unknown", label: "No recording" });
  if (c.counts.running) out.push({ status: "running", label: `${c.counts.running} working` });
  if (c.counts.failed) out.push({ status: "failed", label: `${c.counts.failed} failed` });
  if (c.counts.waiting) out.push({ status: "held", label: `${c.counts.waiting} held` });
  if (c.counts.ready) out.push({ status: "ready", label: `${c.counts.ready} ready` });
  if (c.counts.clips && !c.counts.ready) out.push({ status: "draft", label: `${c.counts.kept}/${c.counts.clips} kept` });
  return out;
}

function Envelope({ peaks }: { peaks: number[] }) {
  if (!peaks.length) return null;
  return (
    <span className="st-env" role="img" aria-label="Recording envelope">
      {peaks.map((p, i) => <i key={i} style={{ height: `${Math.max(8, Math.round(p * 100))}%` }} />)}
    </span>
  );
}

export function StoriesBoard({ cards, workspace, newStory }: { cards: StoryCard[]; workspace: string; newStory: React.ReactNode }) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<string | null>(cards[0]?.id ?? null);
  const [adding, setAdding] = useState(cards.length === 0);
  const shown = useMemo(() => cards.filter(FILTERS.find((f) => f.id === filter)!.test), [cards, filter]);
  const sel = cards.find((c) => c.id === selected) ?? null;

  const items = (c: StoryCard): MenuItem[] => [
    { heading: c.title },
    { id: "flat", label: "Open in Flat Studio", icon: FilmSlate, onSelect: () => router.push(`/app/p/${c.id}`) },
    { id: "spatial", label: "Open in Spatial Canvas", icon: Globe, onSelect: () => router.push(`/app/p/${c.id}/spatial`) },
    { separator: true },
    { id: "outputs", label: "Outputs", onSelect: () => router.push(`/app/p/${c.id}/publish`) },
    { id: "rights", label: "Rights map", onSelect: () => router.push(`/app/p/${c.id}/protect`) },
  ];

  return (
    <div className="st-layout">
      <section className="st-main" aria-labelledby="st-title">
        <div className="st-head">
          <div>
            <h1 id="st-title">Stories</h1>
            <p className="st-meta">{workspace} · {cards.length} {cards.length === 1 ? "story" : "stories"}</p>
          </div>
          <Button variant="primary" onClick={() => setAdding((v) => !v)} aria-expanded={adding}><Plus size={16} aria-hidden="true" />New story</Button>
        </div>
        {adding && <div className="st-new">{newStory}</div>}
        {cards.length > 0 && (
          <div className="st-filters" role="tablist" aria-label="Filter stories">
            {FILTERS.map((f) => {
              const n = cards.filter(f.test).length;
              return (
                <button key={f.id} role="tab" aria-selected={filter === f.id} className="st-filter" onClick={() => setFilter(f.id)}>
                  {f.label} <span className="st-count">{n}</span>
                </button>
              );
            })}
          </div>
        )}
        {cards.length > 0 && shown.length === 0 && <p className="st-none">No stories match this filter.</p>}
        <ul className="st-grid" aria-label="Stories">
          {shown.map((c) => (
            <li key={c.id}>
              <ContextMenu items={items(c)}>
                <article
                  className={`st-card${selected === c.id ? " is-on" : ""}`}
                  aria-current={selected === c.id ? "true" : undefined}
                  onClick={() => setSelected(c.id)}
                  onDoubleClick={() => router.push(`/app/p/${c.id}`)}
                >
                  <button className="st-cover" onClick={() => setSelected(c.id)} aria-label={`Select ${c.title}`}>
                    {c.posterId
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={media(c.posterId)} alt="" loading="lazy" />
                      : <span className="st-cover-empty" aria-hidden="true">{c.kind.slice(0, 1)}</span>}
                    {c.durationMs ? <time className="st-dur">{formatDuration(c.durationMs)}</time> : null}
                  </button>
                  <Envelope peaks={c.peaks} />
                  <div className="st-body">
                    <h2><a href={`/app/p/${c.id}`} onClick={(e) => { e.preventDefault(); router.push(`/app/p/${c.id}`); }}>{c.title}</a></h2>
                    <p className="st-meta">{c.kind} · edited {ago(c.updatedAt)}</p>
                    <div className="st-pills">{pills(c).map((p) => <StatusPill key={p.label} status={p.status} label={p.label} />)}</div>
                  </div>
                  <div className="st-more" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu items={items(c)} trigger={<button className="st-more-btn" aria-label={`Actions for ${c.title}`}><DotsThree size={18} weight="bold" /></button>} />
                  </div>
                </article>
              </ContextMenu>
            </li>
          ))}
        </ul>
      </section>

      {sel && (
        <aside className="st-detail" aria-label={`Selected story: ${sel.title}`}>
          <div className="st-detail-cover">
            {sel.posterId
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={media(sel.posterId)} alt="" />
              : <span className="st-cover-empty" aria-hidden="true">{sel.kind.slice(0, 1)}</span>}
          </div>
          <h2>{sel.title}</h2>
          <dl className="st-facts">
            <dt>Type</dt><dd>{sel.kind}</dd>
            <dt>Recording</dt><dd>{sel.filename ?? "None yet"}</dd>
            <dt>Length</dt><dd className="mono-t">{sel.durationMs ? formatDuration(sel.durationMs) : "–"}</dd>
            <dt>Scenes</dt><dd>{sel.counts.clips ? `${sel.counts.kept} kept of ${sel.counts.clips}` : "None yet"}</dd>
            <dt>Languages</dt><dd>{sel.counts.tracks || "–"}</dd>
            <dt>People</dt><dd>{sel.counts.people || "–"}</dd>
            <dt>Outputs</dt><dd>{sel.counts.outputs ? `${sel.counts.ready} ready of ${sel.counts.outputs}` : "None yet"}</dd>
            <dt>Edited</dt><dd>{ago(sel.updatedAt)}</dd>
          </dl>
          <div className="st-actions">
            <Button variant="primary" onClick={() => router.push(`/app/p/${sel.id}`)}><FilmSlate size={16} aria-hidden="true" />Open in Flat Studio</Button>
            <Button variant="secondary" onClick={() => router.push(`/app/p/${sel.id}/spatial`)}><Globe size={16} aria-hidden="true" />Open in Spatial Canvas</Button>
          </div>
        </aside>
      )}
    </div>
  );
}
