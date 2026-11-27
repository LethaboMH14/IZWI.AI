"use client";
// The frame around every view of one project: the project switcher and view switch in the shell header, save
// state and Export beside the account menu, and the five-stage bar with counts from real rows.
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { CaretDown, Export } from "@phosphor-icons/react";
import { api } from "@/lib/api";
import { stageCounts, type StageId } from "@/lib/stage-counts";
import { DropdownMenu, type MenuItem } from "@/components/z";
import { HeaderActions, HeaderSlot } from "./ShellSlots";
import { useProject } from "./ProjectProvider";

const STAGE_PATH: Record<StageId, string> = { create: "", localise: "/localise", protect: "/protect", publish: "/publish", earn: "/earn" };
// Old studio links used hashes (#create, #publish, ...); they now land on the matching route.
const LEGACY_HASH: Record<string, string> = { canvas: "/spatial", create: "", localise: "/localise", protect: "/protect", publish: "/publish", earn: "/earn" };

type ListItem = { id: string; title: string };

function ProjectSwitcher({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const [list, setList] = useState<ListItem[] | null>(null);
  useEffect(() => {
    let live = true;
    api<ListItem[]>("/api/projects").then((rows) => { if (live) setList(rows); }).catch(() => { if (live) setList([]); });
    return () => { live = false; };
  }, []);
  const items: MenuItem[] = [
    { heading: "Stories" },
    ...(list ?? []).map((p): MenuItem => ({ id: p.id, label: p.title, disabled: p.id === id, onSelect: () => router.push(`/app/p/${p.id}`) })),
    ...(list === null ? [{ id: "loading", label: "Loading…", disabled: true } as MenuItem] : []),
    { separator: true },
    { id: "all", label: "All stories", onSelect: () => router.push("/app") },
  ];
  return (
    <DropdownMenu
      items={items}
      trigger={<button type="button" className="z-switcher" aria-label={`Story: ${title}. Switch story`}><span>{title}</span><CaretDown size={14} aria-hidden="true" /></button>}
    />
  );
}

function SaveState() {
  const save = useProject((s) => s.save);
  const readOnly = useProject((s) => s.readOnly);
  if (readOnly.value) return <span className="z-readonly" title="Edits are off in this tab so two tabs never overwrite each other">Read only · {readOnly.reason}</span>;
  if (save.pending > 0) return <span className="z-savestate is-busy" role="status"><i aria-hidden="true" />Saving…</span>;
  if (save.lastError) return <span className="z-savestate is-failed" role="status" title={save.lastError}><i aria-hidden="true" />Not saved</span>;
  return <span className="z-savestate" role="status"><i aria-hidden="true" />{save.lastSavedAt ? "Saved" : "Up to date"}</span>;
}

export function ProjectFrame({ children }: { children: React.ReactNode }) {
  const id = useProject((s) => s.id);
  const title = useProject((s) => s.state.project.title);
  const state = useProject((s) => s.state);
  const path = usePathname();
  const base = `/app/p/${id}`;
  const counts = useMemo(() => stageCounts(state), [state]);
  const spatial = path.startsWith(`${base}/spatial`);

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    // A plain replace: the client router skipped hash-only entry URLs in the production walkthrough.
    if (hash in LEGACY_HASH) window.location.replace(`${base}${LEGACY_HASH[hash]}`);
  }, [base]);

  const active = (stage: StageId) => (stage === "create" ? path === base || path === `${base}/spatial` : path.startsWith(`${base}${STAGE_PATH[stage]}`));

  return (
    <div className="z-project">
      <HeaderSlot>
        <ProjectSwitcher id={id} title={title} />
        <nav className="z-viewswitch" aria-label="View">
          <Link href={base} aria-current={!spatial && path === base ? "page" : undefined}>Flat<span className="z-phone-hide"> Studio</span></Link>
          <Link href={`${base}/spatial`} aria-current={spatial ? "page" : undefined}>Spatial<span className="z-phone-hide"> Canvas</span></Link>
        </nav>
      </HeaderSlot>
      <HeaderActions>
        <SaveState />
        <Link href={`${base}/publish`} className="z-btn z-btn-primary z-btn-sm z-hide-phone" style={{ textDecoration: "none" }}><Export size={16} aria-hidden="true" />Export</Link>
      </HeaderActions>
      <nav className="z-stagebar" aria-label="Stages">
        {counts.map((c, i) => (
          <span key={c.id} style={{ display: "contents" }}>
            {i > 0 && <span className="z-stage-sep" aria-hidden="true" />}
            <Link href={`${base}${STAGE_PATH[c.id]}`} className="z-stage" aria-current={active(c.id) ? "page" : undefined} title={c.detail}>
              {c.label}
              {c.count && <span className="z-stage-count" data-tone={c.tone}>{c.count}</span>}
            </Link>
          </span>
        ))}
      </nav>
      <div className="z-stagebody">{children}</div>
    </div>
  );
}
