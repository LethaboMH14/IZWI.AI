"use client";
import { useState } from "react";
import { ArrowUUpLeft, Copy, DotsThree, FilmSlate, MagnifyingGlassMinus, MagnifyingGlassPlus, Scissors, Trash } from "@phosphor-icons/react";
import {
  Button, ContextMenu, DropdownMenu, EmptyState, IconButton, Kbd, Slider, StatusPill, Tabs, Timecode,
  type MenuItem, type Status,
} from "./index";

const STATUSES: Status[] = ["ready", "queued", "running", "failed", "held", "draft", "approved", "requested", "granted", "declined", "revoked", "proposal", "unknown"];

const ITEMS: MenuItem[] = [
  { heading: "Scene" },
  { id: "split", label: "Split at playhead", icon: Scissors, shortcut: "S", onSelect: () => {} },
  { id: "dup", label: "Duplicate scene", icon: Copy, shortcut: "Ctrl+D", onSelect: () => {} },
  { id: "render", label: "Render", icon: FilmSlate, items: [
    { id: "rv", label: "Render vertical", onSelect: () => {} },
    { id: "rs", label: "Render square", onSelect: () => {} },
    { id: "rh", label: "Render horizontal", disabled: true, disabledReason: "Source is vertical only" },
  ] },
  { id: "undo", label: "Undo last edit", icon: ArrowUUpLeft, disabled: true, disabledReason: "Nothing to undo", shortcut: "Ctrl+Z" },
  { separator: true },
  { id: "del", label: "Delete scene", icon: Trash, danger: true, onSelect: () => {} },
];

function Panel({ tone }: { tone: "ivory" | "shell" }) {
  const shell = tone === "shell";
  const [zoom, setZoom] = useState(40);
  const [loading, setLoading] = useState(false);
  const kbdTone = shell ? "shell" : undefined;
  return (
    <section className={`z-gal-panel z-gal-${tone}`} aria-label={shell ? "Charcoal panel" : "Ivory panel"}>
      <h3 className="z-gal-h">{shell ? "Charcoal panel" : "Ivory panel"}</h3>

      <div className="z-gal-sec"><h4>Buttons, medium</h4><div className="z-gal-row">
        <Button variant="primary" tone={tone}>Apply edit</Button>
        <Button variant="secondary" tone={tone}>Dismiss</Button>
        <Button variant="ghost" tone={tone}>Add scene</Button>
        <Button variant="danger" tone={tone}>Delete scene</Button>
        <Button variant="primary" tone={tone} loading={loading} onClick={() => { setLoading(true); setTimeout(() => setLoading(false), 1500); }}>Render vertical</Button>
        <Button variant="secondary" tone={tone} disabled disabledReason="Consent is not granted yet">Render vertical</Button>
        <Button variant="secondary" tone={tone} disabled>Export</Button>
      </div></div>

      <div className="z-gal-sec"><h4>Buttons, small</h4><div className="z-gal-row">
        <Button size="sm" variant="primary" tone={tone}>Request consent</Button>
        <Button size="sm" variant="secondary" tone={tone}>Dismiss</Button>
        <Button size="sm" variant="ghost" tone={tone}>Add scene</Button>
        <Button size="sm" variant="danger" tone={tone}>Revoke</Button>
        <Button size="sm" variant="primary" tone={tone} loading>Apply edit</Button>
        <Button size="sm" variant="secondary" tone={tone} disabled disabledReason="Select a scene first">Split</Button>
      </div></div>

      <div className="z-gal-sec"><h4>Icon buttons and menus</h4><div className="z-gal-row">
        <IconButton label="Zoom out" shortcut="-" icon={<MagnifyingGlassMinus size={16} />} tone={tone} onClick={() => setZoom((z) => Math.max(0, z - 10))} />
        <IconButton label="Zoom in" shortcut="+" icon={<MagnifyingGlassPlus size={16} />} tone={tone} onClick={() => setZoom((z) => Math.min(100, z + 10))} />
        <IconButton label="Delete scene" variant="danger" icon={<Trash size={16} />} tone={tone} />
        <IconButton label="Split" icon={<Scissors size={16} />} tone={tone} disabled disabledReason="Select a scene first" />
        <IconButton size="sm" label="Duplicate scene" icon={<Copy size={14} />} tone={tone} />
        <DropdownMenu items={ITEMS} trigger={<IconButton label="More actions" icon={<DotsThree size={18} weight="bold" />} tone={tone} variant="secondary" />} />
        <ContextMenu items={ITEMS}><div className="z-gal-box">Right-click this scene for the same menu</div></ContextMenu>
      </div></div>

      <div className="z-gal-sec"><h4>Tabs</h4>
        <Tabs label={shell ? "Project panel sections" : "Inspector sections"} tone={tone} items={shell
          ? [{ value: "t", label: "Transcript", panel: "9/14 reviewed" }, { value: "s", label: "Scenes", panel: "6 scenes" }, { value: "o", label: "Outputs", disabled: true }]
          : [{ value: "t", label: "Transcript", panel: "9/14 reviewed" }, { value: "s", label: "Scenes", panel: "6 scenes" }, { value: "p", label: "People", panel: "1 requested" }]} />
      </div>

      <div className="z-gal-sec"><h4>Slider</h4>
        <Slider label="Timeline zoom" value={zoom} onValueChange={setZoom} format={(v) => `${v} percent`} />
        <Slider label="Timeline zoom, disabled" defaultValue={20} disabled />
      </div>

      <div className="z-gal-sec"><h4>Status pills</h4><div className="z-gal-row">
        {STATUSES.map((s) => <StatusPill key={s} status={s} percent={s === "running" ? 42 : undefined} />)}
        <StatusPill status="held" label="1 held" />
      </div></div>

      <div className="z-gal-sec"><h4>Timecode and keys</h4><div className="z-gal-row">
        <Timecode ms={14000} /><Timecode ms={79000} /><Timecode ms={3723000} /><Timecode ms={14250} tenths />
        <Timecode ms={36000} duration /><Timecode ms={79000} duration /><Timecode ms={-1} />
        <Kbd tone={kbdTone}>Space</Kbd><Kbd tone={kbdTone}>I</Kbd><Kbd tone={kbdTone}>Ctrl</Kbd>
      </div></div>

      <div className="z-gal-sec"><h4>Empty state</h4>
        <EmptyState icon={<FilmSlate size={28} />} title="No scenes yet" line="Scenes you cut from the transcript appear here"
          action={<Button size="sm" variant="primary" tone={tone}>Add scene</Button>} />
      </div>
    </section>
  );
}

export function Gallery() {
  return (
    <div className="z-gallery">
      <Panel tone="ivory" />
      <Panel tone="shell" />
    </div>
  );
}
