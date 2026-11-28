"use client";

import { useState } from "react";
import { Copy, WhatsappLogo, UserPlus, Check } from "@phosphor-icons/react";
import { api, ApiError, whatsappLink } from "@/lib/api";
import { useLive } from "@/lib/useLive";
import "../../settings.css";

type Team = {
  members: { id: string; role: string; name: string; email: string }[];
  invites: { id?: string; email: string; role: string; status: string; expiresAt: string; url?: string }[];
  me: { role: string; userId: string };
};
const ROLE_TEXT: Record<string, string> = { owner: "Owner", admin: "Admin", member: "Member" };

function CopyBtn({ text, label = "Copy link" }: { text: string; label?: string }) {
  const [ok, setOk] = useState<boolean | null>(null);
  const go = async () => {
    try { await navigator.clipboard.writeText(text); setOk(true); } catch { setOk(false); }
    setTimeout(() => setOk(null), 2500);
  };
  return <button type="button" className="btn btn-quiet" onClick={go}>{ok ? <Check weight="bold" /> : <Copy weight="bold" />} {ok === true ? "Copied" : ok === false ? "Select and copy by hand" : label}</button>;
}

export default function TeamPage() {
  const { data, error, loading, refresh } = useLive<Team>("/api/team", { slowMs: 20_000 });
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [made, setMade] = useState<{ url: string; message: string; email: string } | null>(null);

  const canInvite = !data || data.me.role === "owner" || data.me.role === "admin";

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(""); setMade(null);
    try {
      const r = await api<{ url: string; message: string }>("/api/team", { method: "POST", body: { email: email.trim(), role } });
      setMade({ ...r, email: email.trim() }); setEmail(""); refresh();
    } catch (x) {
      setErr(x instanceof ApiError && x.status === 403 ? "Only owners and admins can invite people. Ask an owner or admin of this workspace." : x instanceof ApiError ? x.message : (x as Error).message);
    }
    setBusy(false);
  };

  return (
    <div className="st-page">
      <header>
        <h1>Your <em>team</em></h1>
        <p className="lede">People who share this workspace. No email is sent: you get an invite link and share it yourself, by WhatsApp or any way you like.</p>
      </header>

      {loading && <div className="st-skel" aria-label="Loading" />}
      {error && !data && <p className="st-note bad" role="alert">Could not load your team. {error.message}</p>}

      {data && (
        <>
          <section className="st-sec" aria-labelledby="mem-h">
            <header><div><h2 id="mem-h">Members</h2></div><span className="pill s-off">You are {ROLE_TEXT[data.me.role]?.toLowerCase() ?? data.me.role}</span></header>
            {data.members.length === 0 ? <p className="st-empty">No members found.</p> : (
              <ul className="st-people">
                {data.members.map((m) => (
                  <li key={m.id}><div><b>{m.name || m.email}</b><span className="em">{m.email}</span></div><span className={`pill ${m.role === "owner" ? "s-done" : m.role === "admin" ? "s-draft" : "s-off"}`}>{ROLE_TEXT[m.role] ?? m.role}</span></li>
                ))}
              </ul>
            )}
          </section>

          <section className="st-sec" aria-labelledby="inv-h">
            <header><div><h2 id="inv-h">Waiting to join</h2><p>Invitations that have not been accepted yet.</p></div></header>
            {data.invites.length === 0 ? <p className="st-empty">No pending invitations.</p> : (
              <ul>
                {data.invites.map((i) => {
                  const msg = `You're invited to my IZWI AI workspace. Sign up with ${i.email} and open: ${i.url}`;
                  return (
                    <li key={i.id ?? i.email} className="st-invite">
                      <div><b style={{ fontFamily: "var(--display)", fontSize: "var(--z-type-base)" }}>{i.email}</b> <span className="pill s-draft" style={{ marginLeft: "0.4rem" }}>{ROLE_TEXT[i.role] ?? i.role}</span></div>
                      {i.url && <div className="st-link">{i.url}</div>}
                      <div className="st-actions">
                        {i.url && <CopyBtn text={i.url} />}
                        {i.url && <a className="btn btn-quiet" href={whatsappLink(msg)} target="_blank" rel="noreferrer"><WhatsappLogo weight="bold" /> Share on WhatsApp</a>}
                        <span className="fine">Expires {new Date(i.expiresAt).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="st-sec" aria-labelledby="new-h">
            <header><div><h2 id="new-h">Invite someone</h2><p>Members can work on projects. Admins can also invite people, manage AI keys, ask guests for consent and remove them from a story.</p></div></header>
            {!canInvite && <p className="st-note">Only owners and admins can invite people. You can see the team but not change it.</p>}
            <form className="st-team-form" onSubmit={invite}>
              <label className="field"><span>Their email</span><input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" placeholder="name@example.com" disabled={!canInvite} /></label>
              <label className="field"><span>Role</span>
                <select value={role} onChange={(e) => setRole(e.target.value as "member" | "admin")} disabled={!canInvite}>
                  <option value="member">Member</option><option value="admin">Admin</option>
                </select>
              </label>
              <button className="btn" disabled={busy || !canInvite}><UserPlus weight="bold" /> {busy ? "Making the link…" : "Make invite link"}</button>
            </form>
            {err && <p className="st-note bad" role="alert" style={{ marginTop: "0.8rem" }}>{err}</p>}
            {made && (
              <div className="st-invite" role="status" style={{ marginTop: "1rem" }}>
                <p className="st-note good">Invite made for {made.email}. Nothing has been sent yet: share it below.</p>
                <div className="st-link">{made.url}</div>
                <p className="st-test">{made.message}</p>
                <div className="st-actions">
                  <CopyBtn text={made.url} />
                  <CopyBtn text={made.message} label="Copy message" />
                  <a className="btn btn-quiet" href={whatsappLink(made.message)} target="_blank" rel="noreferrer"><WhatsappLogo weight="bold" /> Share on WhatsApp</a>
                </div>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
