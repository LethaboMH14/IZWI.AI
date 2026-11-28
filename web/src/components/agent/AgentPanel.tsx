"use client";
// The IZWI Editing Agent: proposals from the real assistant thread, with Apply edit / Dismiss / Preview range,
// and a composer that sends real assistant turns. Transport pattern copied from studio/AssistantPanel.tsx
// (useChat + DefaultChatTransport, only { threadId?, providerId, text } leaves the browser); nothing imported from it.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChat, type UIMessage } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { PaperPlaneRight, Sparkle, Warning } from "@phosphor-icons/react";
import { EmptyState } from "@/components/z";
import { api } from "@/lib/api";
import { useAgentAsk } from "@/lib/agent-bus";
import { agentProposals, type ThreadProposal } from "@/lib/proposals";
import { useAssistantEnabled, useProject } from "@/components/workspace/ProjectProvider";
import { metaChips } from "@/components/studio/assistant-render";
import { ProposalCard } from "./ProposalCard";
import { OutputsConsent } from "./OutputsConsent";
import "@/app/agent.css";

type ProviderInfo = { label: string; model: string; privacy: string };
type ProviderChoice = ProviderInfo & { id: string; kind: string; ready: boolean };
type StoredMessage = { id: string; role: "user" | "assistant"; text: string; provider?: ProviderInfo; redacted?: number; excludedLines?: number; proposals?: ThreadProposal[]; createdAt: string };
type Loaded = { providers: ProviderChoice[]; thread: { id: string; messages: StoredMessage[] } | null };
type ErrorData = { code: string; message: string; retryAfter?: number };

const PRIVACY: Record<string, string> = { private: "Private", standard: "Standard", may_log: "May log" };
const PRIVACY_TIP: Record<string, string> = {
  private: "Private: on this machine. Local models are slow on a laptop, so an answer can take 1 to 3 minutes.",
  standard: "Standard: Meta",
  may_log: "May log: the provider may keep what you send",
};

// Switched off on the server: say so and call nothing (the routes answer 404 then).
export function AgentPanel({ variant = "panel" }: { variant?: "panel" | "card" }) {
  if (useAssistantEnabled()) return <Agent variant={variant} />;
  return (
    <aside className={"ag-panel ag-v-" + variant} aria-label="IZWI Editing Agent">
      <header className="ag-head"><Sparkle size={18} weight="fill" aria-hidden="true" /><h2>IZWI Editing Agent</h2></header>
      <p className="ag-note">The assistant is switched off.</p>
    </aside>
  );
}

function Agent({ variant }: { variant: "panel" | "card" }) {
  const compact = variant === "card";
  const projectId = useProject((s) => s.id);
  const state = useProject((s) => s.state);
  const [data, setData] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [live, setLive] = useState("");
  const [pendingClips, setPendingClips] = useState<string[]>([]);
  const [meta, setMeta] = useState<{ provider: ProviderInfo; redacted: number; excludedLines: number } | null>(null);
  const [turnError, setTurnError] = useState<ErrorData | null>(null);
  const [providerId, setProviderId] = useState("");
  const [hasLastText, setHasLastText] = useState(false);
  const [text, setText] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);
  const [session, setSession] = useState({ threadId: undefined as string | undefined, lastText: "" });

  const reload = useCallback(async () => {
    try {
      const d = await api<Loaded>(`/api/projects/${projectId}/assistant`);
      setData(d); setLoadError(null);
      setSession((old) => ({ ...old, threadId: d.thread?.id, lastText: [...(d.thread?.messages ?? [])].reverse().find((m) => m.role === "user")?.text ?? old.lastText }));
    } catch (e) { setLoadError((e as Error).message); }
  }, [projectId]);
  useEffect(() => { queueMicrotask(() => { void reload(); }); }, [reload]);

  const ready = useMemo(() => (data?.providers ?? []).filter((p) => p.ready), [data]);
  const chosenProviderId = providerId || ready[0]?.id || "";
  useEffect(() => {
    let alive = true;
    fetch("/api/providers/routes", { credentials: "same-origin" })
      .then((r) => (r.ok ? (r.json() as Promise<{ routes?: { role: string; providerId: string }[] }>) : null))
      .then((v) => { const route = v?.routes?.find((x) => x.role === "chat"); if (alive && route && ready.some((p) => p.id === route.providerId)) setProviderId(route.providerId); })
      .catch(() => {});
    return () => { alive = false; };
  }, [ready]);
  const transport = useMemo(() => {
    return new DefaultChatTransport<UIMessage>({
    api: `/api/projects/${projectId}/assistant`,
    credentials: "same-origin",
    prepareSendMessagesRequest: ({ messages }) => {
      const last = messages[messages.length - 1];
      const t = last.parts.flatMap((p) => (p.type === "text" ? [p.text] : [])).join("");
      return { body: { ...(session.threadId ? { threadId: session.threadId } : {}), providerId: providerId || ready[0]?.id || "", text: t } };
    },
    });
  }, [projectId, providerId, ready, session.threadId]);

  const chat = useChat<UIMessage>({
    transport,
    onData: (part) => {
      if (part.type === "data-meta") {
        const d = part.data as { threadId?: string; provider: ProviderInfo; redacted?: number; excludedLines?: number };
        if (d.threadId) setSession((old) => ({ ...old, threadId: d.threadId }));
        setMeta({ provider: d.provider, redacted: d.redacted ?? 0, excludedLines: d.excludedLines ?? 0 });
      } else if (part.type === "data-error") setTurnError(part.data as ErrorData);
    },
    onFinish: () => { void reload(); },
    onError: (e) => {
      let m = e.message;
      try { const j = JSON.parse(m) as { error?: string; retryAfter?: number }; if (j.error) m = j.error + (j.retryAfter !== undefined ? ` Try again in ${j.retryAfter} seconds.` : ""); } catch { /* not JSON: show as is */ }
      setTurnError({ code: "request", message: m });
    },
  });
  const running = chat.status === "submitted" || chat.status === "streaming";

  const send = useCallback((t: string) => {
    const v = t.trim();
    if (!v || !(providerId || ready[0]?.id)) return;
    setTurnError(null);
    setSession((old) => ({ ...old, lastText: v }));
    setHasLastText(true);
    void chat.sendMessage({ text: v });
  }, [chat, providerId, ready]);

  const prefill = useCallback((t: string) => { setText(t); requestAnimationFrame(() => input.current?.focus()); }, []);
  useAgentAsk(prefill);

  const thread = useMemo(() => (data?.thread?.messages ?? []).flatMap((m) => m.proposals ?? []), [data]);
  const proposals = useMemo(() => agentProposals(thread, state), [thread, state]);
  const shown = compact ? proposals.slice(0, 1) : proposals;
  const open = proposals.filter((p) => p.status === "proposed").length;

  const lastReply = useMemo(() => {
    const live = [...chat.messages].reverse().find((m) => m.role === "assistant");
    const t = live?.parts.flatMap((p) => (p.type === "text" ? [p.text] : [])).join("") ?? "";
    return t || ([...(data?.thread?.messages ?? [])].reverse().find((m) => m.role === "assistant")?.text ?? "");
  }, [chat.messages, data]);

  const lastStored = [...(data?.thread?.messages ?? [])].reverse().find((m) => m.role === "assistant");
  const chipProvider = meta?.provider ?? lastStored?.provider ?? ready.find((r) => r.id === chosenProviderId) ?? null;
  const chipRedacted = meta ? meta.redacted : (lastStored?.redacted ?? 0);
  const heldChips = metaChips({ excludedLines: meta ? meta.excludedLines : lastStored?.excludedLines });

  const firstKept = useMemo(() => {
    const kept = state.clips.filter((c) => c.status === "kept").sort((a, b) => a.startMs - b.startMs || a.id.localeCompare(b.id));
    return kept[0]?.title ?? null;
  }, [state.clips]);

  const setPending = useCallback((clipId: string, on: boolean) => setPendingClips((s) => (on ? [...s, clipId] : s.filter((x) => x !== clipId))), []);
  const askAgain = useCallback(() => { if (session.lastText) send(session.lastText); }, [send, session.lastText]);
  const canSend = !running && !!chosenProviderId && text.trim().length > 0;
  const submit = () => { if (!canSend) return; send(text); setText(""); };

  return (
    <aside className={"ag-panel ag-v-" + variant} aria-label="IZWI Editing Agent">
      <header className="ag-head">
        <Sparkle size={18} weight="fill" aria-hidden="true" />
        <h2>IZWI Editing Agent</h2>
        {open > 0 && <span className="ag-count" aria-label={`${open} open`}>{open}</span>}
      </header>
      <p className="sr-only" role="status" aria-live="polite">{live}</p>

      {chipProvider && (
        <p className="ag-chips">
          <span className="ag-chip" title={PRIVACY_TIP[chipProvider.privacy] ?? chipProvider.privacy}>{chipProvider.model} · {PRIVACY[chipProvider.privacy] ?? chipProvider.privacy}</span>
          <span className="ag-chip">{chipRedacted} redacted</span>
          {heldChips.map((c) => <span key={c.text} className="ag-chip ag-chip-warn" title={c.title}>{c.text}</span>)}
        </p>
      )}

      <div className="ag-body">
        {loadError && <p className="ag-err" role="alert"><Warning weight="fill" aria-hidden="true" /> {loadError}</p>}
        {running && <p className="ag-note" role="status">Answering…</p>}
        {!running && lastReply && <p className="ag-reply">{lastReply}</p>}
        {turnError && (
          <p className="ag-err" role="alert"><Warning weight="fill" aria-hidden="true" /> {turnError.message}
            {turnError.retryAfter !== undefined ? ` Try again in ${turnError.retryAfter} seconds.` : ""}</p>
        )}
        {data && shown.length === 0 && (
          <EmptyState
            icon={<Sparkle size={20} weight="fill" />}
            title="No proposals yet"
            line="Ask for an edit"
            action={(
              <div className="ag-prompts">
                {firstKept && <button type="button" className="ag-prompt" onClick={() => prefill(`Tighten the opening of ${firstKept}`)}>Tighten the opening of {firstKept}</button>}
                <button type="button" className="ag-prompt" onClick={() => prefill("Find 3 highlights")}>Find 3 highlights</button>
              </div>
            )}
          />
        )}
        {shown.map((p) => (
          <ProposalCard key={p.planId} p={p} compact={compact} localPending={pendingClips} setPending={setPending}
             announce={setLive} askAgain={askAgain} canAsk={!!chosenProviderId && !running && hasLastText} />
        ))}
        {!compact && shown.length > 0 && <OutputsConsent />}
      </div>

      <form className="ag-compose" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <label htmlFor={`ag-in-${variant}`} className="sr-only">Ask the agent</label>
          <textarea id={`ag-in-${variant}`} ref={input} value={text} maxLength={2000} rows={compact ? 1 : 2}
            placeholder={ready.length === 0 ? "No assistant provider is ready" : "Ask the agent about this scene"}
            disabled={ready.length === 0}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); } }} />
          <button type="submit" className="ag-send" aria-label="Send" disabled={!canSend}><PaperPlaneRight weight="fill" aria-hidden="true" /></button>
        </form>
    </aside>
  );
}
