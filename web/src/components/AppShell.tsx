"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Cpu, House, PlugsConnected, SignOut, UsersThree } from "@phosphor-icons/react";
import { Mark } from "./Mark";
import { authClient } from "@/lib/auth-client";

const items = [
  { href: "/app", label: "Stories", icon: House },
  { href: "/app/engine", label: "Run on", icon: Cpu },
  { href: "/app/extensions", label: "Extensions", icon: PlugsConnected },
  { href: "/app/team", label: "Team", icon: UsersThree },
];

export function AppShell({ children, workspace, user }: { children: React.ReactNode; workspace: string; user: { name: string; email: string } }) {
  const path = usePathname();
  const router = useRouter();
  const active = (href: string) => (href === "/app" ? path === "/app" || path.startsWith("/app/p/") : path.startsWith(href));
  const signOut = async () => {
    await authClient.signOut();
    router.push("/sign-in");
    router.refresh();
  };
  return (
    <div className="shell">
      <aside className="rail" aria-label="Workspace">
        <Mark href="/app" small />
        <p className="rail-ws" title={workspace}>{workspace}</p>
        <nav>
          {items.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className={active(href) ? "on" : ""} aria-current={active(href) ? "page" : undefined}>
              <Icon weight={active(href) ? "fill" : "regular"} /> <span>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="usage rail-me">
          <b>{user.name}</b>
          <p>{user.email}</p>
          <button className="link" onClick={signOut}><SignOut /> Sign out</button>
        </div>
      </aside>
      <div className="shell-main">{children}</div>
    </div>
  );
}
