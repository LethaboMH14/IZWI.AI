"use client";
// The Studio assistant: a slide-over (bottom sheet on narrow screens) over the contract in
// docs/engineering/assistant-contract.md. The server owns history, the provider class and the redaction;
// this file only sends { threadId?, providerId, text } and renders what comes back.
// Runtime pattern: assistant-ui's useChatRuntime with a plain DefaultChatTransport (which, unlike the default
// AssistantChatTransport, does not forward system messages or tool definitions) and prepareSendMessagesRequest,
// so nothing but the three contract fields leaves the browser.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { AssistantRuntimeProvider, MessagePrimitive, ThreadPrimitive, useAui, useAuiState } from "@assistant-ui/react";
import { useChatRuntime } from "@assistant-ui/react-ai-sdk";
import type { UIMessage } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Microphone, PaperPlaneRight, Sparkle, Stop, Warning, X } from "@phosphor-icons/react";
import { api, ApiError } from "@/lib/api";
import { clock } from "@/lib/format";
import type { TabId } from "./types";
import { metaChips, parseMarkdown, type Inline } from "./assistant-render";
import "@/app/assistant.css";

type Privacy = "private" | "standard" | "may_log";
type ProviderInfo = { label: string; model: string; privacy: string };
type ProviderChoice = ProviderInfo & { id: string; kind: string; ready: boolean };
type Proposal = {
  planId: string; title: string; reason: string;
  source?: { lineId: string; index: number; atMs: number };
  preview: { label: string; before?: string; after?: string }[];
  scope?: string; kind: "action" | "jobs";
  // From stored history: the plan's current status. Live cards from a new turn have none (they are "proposed").
  status?: "proposed" | "approved" | "dismissed" | "missing" | string;
};
type StoredMessage = { id: string; role: "user" | "assistant"; text: string; provider?: ProviderInfo; redacted?: number; excludedLines?: number; proposals?: Proposal[]; createdAt: string };
type Loaded = { providers: ProviderChoice[]; thread: { id: string; messages: StoredMessage[] } | null; limits: { perMinute: number; perDay: number; usedToday: number } };
type ErrorData = { code: "rate_limited" | "budget" | "busy" | "canary" | "provider" | "timeout" | "switch_class"; message: string; retryAfter?: number; suggest?: "private" | "may_log" };
type Stage = Exclude<TabId, "canvas">;

const BADGE: Record<Privacy, string> = {
  private: "Private: on this machine (owner-configured; IZWI can't verify that it doesn't forward elsewhere). Local models are slow on a laptop, so an answer can take 1 to 3 minutes.",
  standard: "Standard: Meta",
  may_log: "May log: the provider may keep what you send",
};
const CLASS_NAME: Record<Privacy, string> = { private: "Private", standard: "Standard", may_log: "May log" };
const badge = (p: string) => BADGE[p as Privacy] ?? p;
const className = (p: string) => CLASS_NAME[p as Privacy] ?? p;

const PROMPTS: Record<Stage, string[]> = {
  create: ["Which parts of this recording should I keep?", "Find the strongest 30 seconds.", "Which lines look like transcript mistakes?"],
  localise: ["Which translated lines need a check?", "Is a name spelled differently across my languages?"],
  protect: ["Who still needs to give consent?", "Which clips are held, and why?"],
  publish: ["What is blocking my renders?", "Which outputs are ready to share?"],
  earn: ["What do I need before I can list a licence?", "Why is my listing switched off?"],
};

const MAX_REC_MS = 60_000;

type Ctx = { refresh: () => Promise<void>; askAgain: () => void; switchTo: (privacy: "private" | "may_log") => void; busy: boolean };
const PanelCtx = createContext<Ctx | null>(null);
const usePanel = () => {
  const c = useContext(PanelCtx);
  if (!c) throw new Error("Assistant parts must render inside the assistant panel");
  return c;
};

function Spans({ xs }: { xs: Inline[] }) {
  return <>{xs.map((x, i) => x.t === "b" ? <strong key={i}>{x.v}</strong> : x.t === "i" ? <em key={i}>{x.v}</em> : x.t === "code" ? <code key={i}>{x.v}</code> : <span key={i}>{x.v}</span>)}</>;
}
function Md({ text }: { text: string }) {
  return (
    <div className="as-md">
      {parseMarkdown(text).map((b, i) => {
        if (b.t === "p") return <p key={i}>{b.lines.map((l, j) => <span key={j}>{j > 0 && <br />}<Spans xs={l} /></span>)}</p>;
        const Tag = b.t;
        return <Tag key={i}>{b.items.map((it, j) => <li key={j}><Spans xs={it} /></li>)}</Tag>;
      })}
    </div>
  );
}

function MetaPart({ data }: { data: { provider: ProviderInfo; redacted?: number; excludedLines?: number } }) {
  return (
    <p className="as-chips">
      <span className="as-chip" title={badge(data.provider.privacy)}>{data.provider.label} · {data.provider.model}</span>
      {metaChips(data).map((c) => <span key={c.text} className="as-chip as-chip-warn" title={c.title}>{c.text}</span>)}
    </p>
  );
}

function ErrorPart({ data }: { data: ErrorData }) {
  const { switchTo } = usePanel();
  const wait = (data.code === "rate_limited" || data.code === "busy") && data.retryAfter !== undefined;
  return (
    <div className="as-error" role="alert">
      <p><Warning weight="fill" /> {data.message}</p>
      {wait && <p>Try again in {data.retryAfter} {data.retryAfter === 1 ? "second" : "seconds"}.</p>}
      {data.code === "switch_class" && data.suggest && (
        <button className="btn btn-quiet" onClick={() => switchTo(data.suggest as "private" | "may_log")}>Switch to {className(data.suggest)}…</button>
      )}
    </div>
  );
}

type CardState = "idle" | "working" | "approved" | "dismissed" | "stale" | "failed";
function ProposalCard({ p }: { p: Proposal }) {
  const { refresh, askAgain, busy } = usePanel();
  const [state, setState] = useState<CardState>(p.status === "approved" ? "approved" : p.status === "dismissed" ? "dismissed" : p.status === "missing" ? "stale" : "idle");
  const [msg, setMsg] = useState<string | null>(null);
  const act = async (action: "approve" | "dismiss") => {
    setState("working");
    setMsg(null);
    try {
      await api(`/api/plan/${p.planId}`, { method: "POST", body: { action } });
      setState(action === "approve" ? "approved" : "dismissed");
      if (action === "approve") await refresh();
    } catch (e) {
      const err = e as ApiError;
      setState(err.status === 409 ? "stale" : "failed");
      setMsg(err.message);
    }
  };
  const done = state === "approved" || state === "dismissed";
  return (
    <section className={"as-card as-" + state} aria-label={p.title}>
      <h4>{p.title}</h4>
      <p>{p.reason}</p>
      {p.source && <p className="as-src mono">from transcript line {p.source.index} · {clock(p.source.atMs)}</p>}
      {p.preview.length > 0 && (
        <dl className="as-diff">
          {p.preview.map((r, i) => (
            <div key={i}>
              <dt>{r.label}</dt>
              <dd>{r.before !== undefined && <del>{r.before}</del>}{r.before !== undefined && r.after !== undefined && <span aria-label="becomes"> → </span>}{r.after !== undefined && <ins>{r.after}</ins>}</dd>
            </div>
          ))}
        </dl>
      )}
      {p.scope && <p className="as-scope">{p.scope}</p>}
      {done ? <p className="as-done" role="status">{state === "approved" ? "Approved." : "Dismissed."}</p> : (
        <div className="as-card-act">
          {state !== "stale" && <>
            <button className="btn" disabled={state === "working"} onClick={() => void act("approve")}>Approve</button>
            <button className="btn btn-quiet" disabled={state === "working"} onClick={() => void act("dismiss")}>Dismiss</button>
          </>}
          {state === "stale" && <button className="btn" disabled={busy} onClick={askAgain}>Ask again</button>}
        </div>
      )}
      {msg && <p className="as-err" role="alert">{msg}</p>}
    </section>
  );
}

function ProposalsPart({ data }: { data: { proposals: Proposal[] } }) {
  return <div className="as-cards">{data.proposals.map((p) => <ProposalCard key={p.planId} p={p} />)}</div>;
}

const TextPart = ({ text }: { text: string }) => <Md text={text} />;
const ASSISTANT_PARTS = { Text: TextPart, data: { by_name: { meta: MetaPart, proposals: ProposalsPart, error: ErrorPart } } };
const USER_PARTS = { Text: TextPart };

function UserMessage() {
  return <MessagePrimitive.Root className="as-msg as-user"><MessagePrimitive.Parts components={USER_PARTS} /></MessagePrimitive.Root>;
}
function AssistantMessage() {
  return <MessagePrimitive.Root className="as-msg as-asst"><MessagePrimitive.Parts components={ASSISTANT_PARTS} /></MessagePrimitive.Root>;
}

const micSupported = () => typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
const noSub = () => () => {};

// Click to start, click to stop (a held key or button is hard for keyboard and switch users), 60 s at most.
// The text goes into the input for the user to edit and send. It is never sent on its own.
function Mic({ projectId, onText }: { projectId: string; onText: (t: string) => void }) {
  const supported = useSyncExternalStore(noSub, micSupported, () => false);
  const [denied, setDenied] = useState(false);
  const [rec, setRec] = useState(false);
  const [secs, setSecs] = useState(0);
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = () => { if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop(); };
  useEffect(() => () => {
    if (tick.current) clearInterval(tick.current);
    recorder.current?.stream.getTracks().forEach((t) => t.stop());
  }, []);

  const transcribe = async (blob: Blob) => {
    setSending(true);
    try {
      const fd = new FormData();
      fd.append("audio", blob, "voice.webm");
      const res = await fetch(`/api/projects/${projectId}/assistant/transcribe`, { method: "POST", body: fd, credentials: "same-origin" });
      const j = (await res.json().catch(() => null)) as { text?: string; error?: string; retryAfter?: number } | null;
      if (!res.ok) throw new Error((j?.error ?? `Request failed (${res.status}).`) + (j?.retryAfter !== undefined ? ` Try again in ${j.retryAfter} seconds.` : ""));
      if (typeof j?.text !== "string") throw new Error("The server sent no text back.");
      onText(j.text);
    } catch (e) { setNote((e as Error).message); } finally { setSending(false); }
  };

  const start = async () => {
    setNote(null);
    let stream: MediaStream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { setDenied(true); return; }
    const chunks: Blob[] = [];
    const r = new MediaRecorder(stream);
    recorder.current = r;
    r.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    r.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      if (tick.current) clearInterval(tick.current);
      setRec(false);
      void transcribe(new Blob(chunks, { type: r.mimeType || "audio/webm" }));
    };
    const t0 = Date.now();
    setSecs(0);
    setRec(true);
    tick.current = setInterval(() => {
      const ms = Date.now() - t0;
      setSecs(Math.floor(ms / 1000));
      if (ms >= MAX_REC_MS) stop();
    }, 250);
    r.start();
  };

  if (!supported || denied) return <p className="as-note">{denied ? "The microphone is blocked, so voice is off. You can still type." : "Voice input is not available in this browser. You can still type."}</p>;
  return (
    <>
      <button type="button" className={"as-mic" + (rec ? " on" : "")} aria-pressed={rec} disabled={sending}
        aria-label={rec ? "Stop recording" : "Record a spoken question"} onClick={() => (rec ? stop() : void start())}>
        {rec ? <Stop weight="fill" /> : <Microphone />}
      </button>
      {rec && <span className="as-timer mono" role="timer" aria-label="Recording time">{clock(secs * 1000)} / {clock(MAX_REC_MS)}</span>}
      {sending && <span className="as-note" role="status">Turning speech into text…</span>}
      {note && <p className="as-err" role="alert">{note}</p>}
    </>
  );
}

type Selection = { providerId: string; threadId: string | undefined; lastText: string };
const newSelection = (providerId: string, thread: Loaded["thread"]): Selection => ({
  providerId, threadId: thread?.id, lastText: [...(thread?.messages ?? [])].reverse().find((m) => m.role === "user")?.text ?? "",
});
const chooseProvider = (s: Selection, id: string) => { s.providerId = id; };
const learnThread = (s: Selection, id: string) => { s.threadId = id; };
const rememberText = (s: Selection, t: string) => { s.lastText = t; };

function Chat({ projectId, stage, refresh, data }: { projectId: string; stage: Stage; refresh: () => Promise<void>; data: Loaded }) {
  const ready = data.providers.filter((p) => p.ready);
  const [providerId, setProviderId] = useState(ready[0]?.id ?? "");
  const [pending, setPending] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  // What the transport reads at send time. It lives outside render so the callback never touches a ref there.
  const [sel] = useState(() => newSelection(providerId, data.thread));
  useEffect(() => {
    let live = true;
    fetch("/api/providers/routes", { credentials: "same-origin" }).then(r => r.ok ? r.json() as Promise<{ routes?: { role: string; providerId: string }[] }> : null).then(value => {
      const route = value?.routes?.find(item => item.role === "chat");
      if (live && route && ready.some(p => p.id === route.providerId)) setProviderId(route.providerId);
    }).catch(() => {});
    return () => { live = false; };
  }, [ready]);
  useEffect(() => { chooseProvider(sel, providerId); }, [sel, providerId]);

  const initial = useMemo<UIMessage[]>(() => (data.thread?.messages ?? []).map((m) => ({
    id: m.id, role: m.role,
    parts: [
      ...(m.role === "assistant" && m.provider ? [{ type: "data-meta" as const, data: { provider: m.provider, redacted: m.redacted ?? 0, excludedLines: m.excludedLines ?? 0 } }] : []),
      { type: "text" as const, text: m.text },
      ...(m.proposals?.length ? [{ type: "data-proposals" as const, data: { proposals: m.proposals } }] : []),
    ],
  })), [data.thread]);

  const transport = useMemo(() => new DefaultChatTransport<UIMessage>({
    api: `/api/projects/${projectId}/assistant`,
    credentials: "same-origin",
    // Only the contract's three fields: no history, no system or tool messages, no class.
    prepareSendMessagesRequest: ({ messages }) => {
      const last = messages[messages.length - 1];
      const t = last.parts.flatMap((p) => (p.type === "text" ? [p.text] : [])).join("");
      return { body: { ...(sel.threadId ? { threadId: sel.threadId } : {}), providerId: sel.providerId, text: t } };
    },
  }), [projectId, sel]);

  const runtime = useChatRuntime({
    transport, messages: initial,
    onData: (part) => { if (part.type === "data-meta") learnThread(sel, (part.data as { threadId: string }).threadId); },
    onError: (e) => {
      let m = e.message;
      try { const j = JSON.parse(m) as { error?: string; retryAfter?: number }; if (j.error) m = j.error + (j.retryAfter !== undefined ? ` Try again in ${j.retryAfter} seconds.` : ""); } catch { /* not JSON: show as is */ }
      setNotice(m);
    },
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <Body {...{ projectId, stage, refresh, data, ready, providerId, setProviderId, pending, setPending, text, setText, notice, setNotice, remember: (t: string) => rememberText(sel, t), last: () => sel.lastText }} />
    </AssistantRuntimeProvider>
  );
}

type BodyProps = {
  projectId: string; stage: Stage; refresh: () => Promise<void>; data: Loaded; ready: ProviderChoice[];
  providerId: string; setProviderId: (s: string) => void; pending: string | null; setPending: (s: string | null) => void;
  text: string; setText: (s: string) => void; notice: string | null; setNotice: (s: string | null) => void;
  remember: (t: string) => void; last: () => string;
};
function Body(p: BodyProps) {
  const aui = useAui();
  const running = useAuiState((s) => s.thread.isRunning);
  const count = useAuiState((s) => s.thread.messages.length);
  const cur = p.ready.find((r) => r.id === p.providerId);
  const canSend = !running && !!cur && p.text.trim().length > 0;

  const send = useCallback((t: string) => {
    p.setNotice(null);
    p.remember(t);
    aui.thread().append(t);
  }, [aui, p]);
  const submit = () => { if (!canSend) return; send(p.text.trim()); p.setText(""); };

  const change = (id: string) => {
    const next = p.ready.find((r) => r.id === id);
    if (!next || next.id === p.providerId) return;
    if (count > 0 && cur && next.privacy !== cur.privacy) p.setPending(id);
    else p.setProviderId(id);
  };
  const switchTo = (privacy: "private" | "may_log") => {
    const hit = p.ready.find((r) => r.privacy === privacy);
    if (hit) p.setPending(hit.id);
    else p.setNotice(`No ${className(privacy).toLowerCase()} provider is set up and ready. Ask a workspace owner to add one.`);
  };
  const pendingP = p.ready.find((r) => r.id === p.pending);
  const ctx: Ctx = { refresh: p.refresh, askAgain: () => { const t = p.last(); if (t) send(t); }, switchTo, busy: running };
  const { limits } = p.data;

  return (
    <PanelCtx.Provider value={ctx}>
      <div className="as-pick">
        <label htmlFor="as-provider">Answer with</label>
        {p.ready.length === 0 ? <p className="as-note">No assistant provider is ready. A workspace owner can add and test one in Settings.</p> : (
          <>
            <select id="as-provider" value={p.providerId} onChange={(e) => change(e.target.value)} disabled={running}>
              {p.data.providers.map((r) => <option key={r.id} value={r.id} disabled={!r.ready}>{r.label} · {r.model}{r.ready ? "" : " (not ready)"}</option>)}
            </select>
            {cur && <p className="as-badge" data-class={cur.privacy}>{badge(cur.privacy)}</p>}
          </>
        )}
        {pendingP && (
          <div className="as-confirm" role="alertdialog" aria-label="Switch provider">
            <p>Switch to {className(pendingP.privacy)}? Messages from now on go to {pendingP.label}.</p>
            <button className="btn" onClick={() => { p.setProviderId(pendingP.id); p.setPending(null); }}>Switch</button>
            <button className="btn btn-quiet" onClick={() => p.setPending(null)}>Keep {cur?.label ?? "current"}</button>
          </div>
        )}
      </div>

      <ThreadPrimitive.Root className="as-thread">
        <ThreadPrimitive.Viewport className="as-view" aria-live="polite" aria-relevant="additions text" aria-busy={running}>
          {count === 0 && (
            <div className="as-empty">
              <p>Ask about this story. IZWI can suggest changes, and nothing changes until you approve it.</p>
              <ul className="as-prompts" aria-label="Suggested questions">
                {PROMPTS[p.stage].map((q) => <li key={q}><button className="btn btn-quiet" disabled={running || !cur} onClick={() => send(q)}>{q}</button></li>)}
              </ul>
            </div>
          )}
          <ThreadPrimitive.Messages components={{ UserMessage, AssistantMessage }} />
        </ThreadPrimitive.Viewport>
      </ThreadPrimitive.Root>

      {p.notice && <p className="as-err" role="alert"><Warning weight="fill" /> {p.notice}</p>}
      <p className="as-note">{limits.usedToday} of {limits.perDay} questions used today (up to {limits.perMinute} a minute).</p>

      <form className="as-compose" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <label htmlFor="as-input" className="sr-only">Your question</label>
        <textarea id="as-input" value={p.text} maxLength={2000} rows={2} placeholder="Type a question"
          onChange={(e) => p.setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); } }} />
        <div className="as-compose-row">
          <Mic projectId={p.projectId} onText={(t) => p.setText(p.text ? `${p.text} ${t}` : t)} />
          <button type="submit" className="btn as-send" disabled={!canSend}><PaperPlaneRight /> {running ? "Answering…" : "Send"}</button>
        </div>
      </form>
    </PanelCtx.Provider>
  );
}

const FOCUSABLE = 'a[href],button:not([disabled]),select:not([disabled]),textarea:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])';

function Sheet({ projectId, stage, refresh, open, onClose }: { projectId: string; stage: Stage; refresh: () => Promise<void>; open: boolean; onClose: () => void }) {
  const [data, setData] = useState<Loaded | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ac = new AbortController();
    api<Loaded>(`/api/projects/${projectId}/assistant`, { signal: ac.signal }).then(setData).catch((e: Error) => { if (e.name !== "AbortError") setErr(e.message); });
    return () => ac.abort();
  }, [projectId]);

  useEffect(() => {
    if (open) root.current?.querySelector<HTMLElement>("textarea, select, .as-close")?.focus();
  }, [open, data]);

  const keys = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.stopPropagation(); onClose(); return; }
    if (e.key !== "Tab" || !root.current) return;
    const els = [...root.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
    if (els.length === 0) return;
    const first = els[0], last = els[els.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  return (
    <>
      {open && <div className="as-scrim" onClick={onClose} aria-hidden />}
      <div ref={root} className="as-panel" role="dialog" aria-modal="true" aria-labelledby="as-title" hidden={!open} onKeyDown={keys}>
        <header>
          <h2 id="as-title">Ask IZWI</h2>
          <button className="as-close" onClick={onClose} aria-label="Close the assistant"><X /></button>
        </header>
        {err && <p className="as-err" role="alert"><Warning weight="fill" /> {err}</p>}
        {!err && !data && <p className="as-note" role="status">Loading…</p>}
        {data && <Chat projectId={projectId} stage={stage} refresh={refresh} data={data} />}
      </div>
    </>
  );
}

function Inner({ projectId, tab, refresh }: { projectId: string; tab: TabId; refresh: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [opened, setOpened] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const stage: Stage = tab === "canvas" ? "create" : tab;
  const close = () => { setOpen(false); opener.current?.focus(); };
  return (
    <>
      <button ref={opener} className="btn btn-quiet as-open" aria-haspopup="dialog" aria-expanded={open} onClick={() => { setOpened(true); setOpen(true); }}>
        <Sparkle /> Ask IZWI
      </button>
      {/* Mounted after the first open and then only hidden, so closing the panel never cuts an answer short. */}
      {opened && <Sheet projectId={projectId} stage={stage} refresh={refresh} open={open} onClose={close} />}
    </>
  );
}

// `enabled` comes from the server page (server/flags.ts), read per request: a restart switches it, no rebuild.
export function AssistantPanel({ enabled, ...props }: { enabled: boolean; projectId: string; tab: TabId; refresh: () => Promise<void> }) {
  if (!enabled) return null;
  return <Inner {...props} />;
}
