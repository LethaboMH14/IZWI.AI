"use client";
// The one shell for every signed-in page (docs/design/DESIGN-SYSTEM.md, Shell): a charcoal header with the
// wordmark, a slot for page controls and the account menu, and the icon rail with a word under every icon.
// On a phone the rail becomes a bottom tab bar.
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { ChartBar, Cube, DotsThree, FilmSlate, GearSix, Globe, House, ShareNetwork, SignOut, Stack } from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import { authClient } from "@/lib/auth-client";
import { clearFrames } from "@/lib/frames";
import { DropdownMenu, type MenuItem } from "@/components/z";
import { Tooltip } from "@/components/z/Tooltip";
import { Wordmark } from "@/components/brand/Wordmark";
import { ShellSlotsContext } from "@/components/workspace/ShellSlots";
import "@/app/workspace.css";

const LAST_PROJECT = "izwi:lastProject";

type Dest = { label: string; icon: Icon; href: (project: string | null) => string | null; match: (path: string) => boolean; phone?: boolean };

// Project-scoped destinations open the story in the URL, else the last story opened on this device.
const DESTS: Dest[] = [
  { label: "Stories", icon: House, href: () => "/app", match: (p) => p === "/app", phone: true },
  { label: "Studio", icon: FilmSlate, href: (id) => (id ? `/app/p/${id}` : null), match: (p) => /^\/app\/p\/[^/]+\/?$/.test(p) || /^\/app\/p\/[^/]+\/(localise|earn)/.test(p), phone: true },
  { label: "Spatial", icon: Globe, href: (id) => (id ? `/app/p/${id}/spatial` : null), match: (p) => /^\/app\/p\/[^/]+\/spatial/.test(p) },
  { label: "Story Room", icon: Cube, href: (id) => (id ? `/app/p/${id}/room` : null), match: (p) => /^\/app\/p\/[^/]+\/room/.test(p) },
  { label: "Rights map", icon: ShareNetwork, href: (id) => (id ? `/app/p/${id}/protect` : null), match: (p) => /^\/app\/p\/[^/]+\/protect/.test(p) },
  { label: "Outputs", icon: Stack, href: (id) => (id ? `/app/p/${id}/publish` : null), match: (p) => /^\/app\/p\/[^/]+\/publish/.test(p), phone: true },
  { label: "Analytics", icon: ChartBar, href: () => "/app/analytics", match: (p) => p.startsWith("/app/analytics") },
];

const projectInPath = (path: string) => /^\/app\/p\/([^/]+)/.exec(path)?.[1] ?? null;

function useLastProject(current: string | null) {
  const stored = useSyncExternalStore(
    (cb) => { window.addEventListener("storage", cb); return () => window.removeEventListener("storage", cb); },
    () => window.localStorage.getItem(LAST_PROJECT),
    () => null,
  );
  useEffect(() => {
    if (current && current !== stored) window.localStorage.setItem(LAST_PROJECT, current);
  }, [current, stored]);
  return current ?? stored;
}

export function AppShell({ children, workspace, user, connectionsEnabled }: { children: React.ReactNode; workspace: string; user: { name: string; email: string }; connectionsEnabled: boolean }) {
  const path = usePathname();
  const router = useRouter();
  const project = useLastProject(projectInPath(path));
  const [main, setMain] = useState<HTMLElement | null>(null);
  const [actions, setActions] = useState<HTMLElement | null>(null);

  const signOut = async () => {
    window.localStorage.removeItem(LAST_PROJECT);
    clearFrames(); // frames are private imagery; never keep them past the session
    await authClient.signOut();
    router.push("/sign-in");
    router.refresh();
  };
  const settings: MenuItem[] = [
    { heading: workspace },
    ...(connectionsEnabled ? [{ id: "settings", label: "Settings", onSelect: () => router.push("/app/settings") } satisfies MenuItem] : []),
    { id: "engine", label: "Run on", onSelect: () => router.push("/app/engine") },
    { id: "team", label: "Team", onSelect: () => router.push("/app/team") },
    { id: "extensions", label: "Extensions", onSelect: () => router.push("/app/extensions") },
    { separator: true },
    { id: "signout", label: "Sign out", icon: SignOut, onSelect: () => void signOut() },
  ];
  const account: MenuItem[] = [{ heading: `${user.name} · ${user.email}` }, ...settings.slice(1)];
  const initial = (user.name.trim()[0] ?? "?").toUpperCase();

  const railItem = (d: Dest, phone = false) => {
    const href = d.href(project);
    const on = d.match(path);
    const Ic = d.icon;
    const body = (
      <>
        <Ic size={20} weight={on ? "fill" : "regular"} aria-hidden="true" />
        <span>{d.label}</span>
      </>
    );
    if (!href) {
      return (
        <Tooltip key={d.label} content="Open a story first">
          <span className="z-rail-item" aria-disabled="true" tabIndex={0}>{body}</span>
        </Tooltip>
      );
    }
    return (
      <Link key={d.label} href={href} className={`z-rail-item${on ? " is-on" : ""}${phone ? " is-phone" : ""}`} aria-current={on ? "page" : undefined}>
        {body}
      </Link>
    );
  };

  return (
    <ShellSlotsContext.Provider value={{ main, actions }}>
      <div className="z-shell">
        <header className="z-header">
          <Wordmark href="/app" />
          <span className="z-header-divider" aria-hidden="true" />
          <div className="z-header-slot" ref={setMain} />
          <div className="z-header-actions" ref={setActions} />
          <DropdownMenu
            items={account}
            trigger={<button type="button" className="z-avatar" aria-label={`Account: ${user.name}`}>{initial}</button>}
          />
        </header>
        <nav className="z-rail" aria-label="Workspace">
          {DESTS.map((d) => railItem(d))}
          <span className="z-rail-spacer" />
          <DropdownMenu
            items={settings}
            trigger={<button type="button" className="z-rail-item"><GearSix size={20} aria-hidden="true" /><span>Settings</span></button>}
          />
        </nav>
        <main className="z-main" id="main">
          {/* Project views and new pages lay themselves out; pages not yet moved keep their old padding. */}
          {path === "/app" || path.startsWith("/app/p/") || path.startsWith("/app/analytics") ? children : <div className="legacy-page">{children}</div>}
        </main>
        <nav className="z-tabbar" aria-label="Main">
          {DESTS.filter((d) => d.phone).map((d) => railItem(d, true))}
          <DropdownMenu
            items={[...DESTS.filter((d) => !d.phone).map((d): MenuItem => {
              const href = d.href(project);
              return { id: d.label, label: d.label, disabled: !href, disabledReason: href ? undefined : "Open a story first", onSelect: () => href && router.push(href) };
            }), { separator: true }, ...settings.slice(1)]}
            trigger={<button type="button" className="z-rail-item is-phone"><DotsThree size={20} aria-hidden="true" /><span>More</span></button>}
          />
        </nav>
      </div>
    </ShellSlotsContext.Provider>
  );
}
