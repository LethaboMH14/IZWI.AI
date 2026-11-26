# Studio assistant: server–UI contract (Lane C)

The assistant server routes (`web/src/app/api/projects/[id]/assistant/…`) and the Studio panel (`web/src/components/studio/AssistantPanel.tsx`) are built in parallel against this contract. Change it only by agreement, and update both sides together.

## Privacy classes
| Class | Means | Badge text |
|---|---|---|
| `private` | Kind `ollama` on a loopback URL, set by a workspace owner | "Private: on this machine (owner-configured; IZWI can't verify that it doesn't forward elsewhere)" |
| `standard` | `https://api.meta.ai/v1` (Standard mode only) | "Standard: Meta" |
| `may_log` | Anything else, including OpenRouter | "May log: the provider may keep what you send" |

The class is derived on the server from the provider row. The client never sends a class, only the provider to use.

## `GET /api/projects/[id]/assistant`
Returns `{ providers: ProviderChoice[], thread: { id, messages: StoredMessage[] } | null, limits: { perMinute, perDay, usedToday } }`.
- `ProviderChoice = { id, label, kind, model, privacy, ready: boolean }`, covering only providers with the `chat` role that passed their test.
- `StoredMessage = { id, role: "user" | "assistant", text, provider?: { label, model, privacy }, redacted?: number, proposals?: Proposal[], createdAt }`.

## `POST /api/projects/[id]/assistant`
Body (zod, strict): `{ threadId?: string, providerId: string, text: string (1..2000) }`. No other fields are accepted.
- The server loads history from storage and never accepts client-sent history, system or tool messages, or non-text parts.
- The response is an AI SDK 7 UI message stream (SSE), consumed with `@assistant-ui/react-ai-sdk` / `@ai-sdk/react`.
- Custom data parts:
  - `data-meta`: `{ threadId, messageId, provider: { label, model, privacy }, redacted: number }`, sent first.
  - `data-proposals`: `{ proposals: Proposal[] }`, sent **only after the turn finished cleanly**. Each proposal is already saved as its own `plan_run` with status `proposed`.
  - `data-error`: `{ code: "rate_limited" | "budget" | "busy" | "canary" | "provider" | "timeout" | "switch_class", message, retryAfter?: number, suggest?: "private" | "may_log" }`.
- Errors before streaming come back as plain JSON `{ error }`, with 400 (bad body), 404 (foreign project or thread), 409, 413 (too large) or 429 (rate limit or one stream already open).

```ts
type Proposal = {
  planId: string;           // the plan_run id; approve with POST /api/plan/[planId] { action: "approve" }
  title: string;            // "Keep clip 2 (0:42–1:24)"
  reason: string;           // the model's reason, plain text
  source?: { lineId: string; index: number; atMs: number }; // "from transcript line 14"
  preview: { label: string; before?: string; after?: string }[]; // diff rows
  scope?: string;           // e.g. "Teaches this spelling to the whole workspace; changes 3 draft lines in 2 projects"
  kind: "action" | "jobs";
  status?: string;          // stored history only: the plan_run status ("proposed" | "approved" | "dismissed"), or "missing"
};
```

## `POST /api/projects/[id]/assistant/transcribe`
Multipart with a single `audio` field (at most 10 MB, at most 60 s). Returns `{ text }`, or 413, 415 or 429 `{ error, retryAfter }` when whisper is busy. It runs through the worker's `voice_transcribe` job.

## Proposal content
- Clip tools require a one-sentence `reason` from the model; it becomes the card's reason.
- A keep or drop of a clip that is already in that state is not a proposal; the tool tells the model so.
- Clip cards carry `source`: the transcript line where the clip starts.

## Approval
The existing `POST /api/plan/[planId]` with `{ action: "approve" | "dismiss" }`. A 409 means the proposal is stale; the UI shows the message and offers "Ask again".

## Rendering rules (UI)
- Text is shown as an escaped markdown subset: paragraphs, bold, italics, lists and inline code.
- No images, no raw HTML, and links are shown as plain text.
- Every assistant message shows its provider chip and, when `redacted > 0`, "N items redacted".
