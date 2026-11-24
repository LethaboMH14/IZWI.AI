# Threat model (STRIDE)

IZWI AI as it runs for the Discothon demo: one laptop runs the Next.js app, the job worker, SQLite, ffmpeg and whisper.cpp. Guests reach the consent page through a tunnel. Paths are under `web/src` unless noted.

**Labels**
- **Built:** in code, with a test or a check in [SECURITY-REVIEW-2026-11.md](SECURITY-REVIEW-2026-11.md).
- **Planned:** not built yet.

## Assets
- Creators' source media and renders.
- Consent records and the consent ledger.
- Provider API keys (sealed).
- Sessions and passkeys.
- Workspace data: transcripts, glossary, enquiries with buyers' contact details.

## Trust boundaries
| # | Boundary | Who is on the other side |
|---|---|---|
| B1 | Browser → app (signed-in studio) | Members of a workspace, and other workspaces' members |
| B2 | Internet → tunnel → guest routes | Anyone with, or guessing, a consent or review link |
| B3 | App → AI providers | OpenRouter, Meta, Ollama, or any URL a workspace admin types |
| B4 | Upload → worker → ffmpeg/whisper | Untrusted media files |
| B5 | App ↔ worker via SQLite | Two processes sharing one database |

## STRIDE per boundary
| Boundary | Threat | Control | Status |
|---|---|---|---|
| B1 | **S**poofing: stolen session | better-auth sessions, passkeys, rate-limited sign-in (`server/auth.ts`, database store) | Built |
| B1 | **T**ampering: cross-site writes | Origin / Sec-Fetch-Site check on every write (`server/http.ts`) | Built |
| B1 | **I**nfo disclosure: another workspace's data | Every query scoped by `workspace_id`; IDs from other workspaces answer 404 (`server/guard.ts`); job idempotency per workspace | Built (function-level tests; HTTP-level two-tenant tests planned) |
| B1 | **E**levation: member doing owner/admin actions | `requireRole` on provider add/test/delete and audit read | Built |
| B1 | XSS via uploaded file | Server-chosen type, sandboxed serving, nonce CSP | Built (CSP Report-Only until enforced) |
| B2 | **S**poofing: someone else answers consent | Random 20+ character tokens, stored hashed; the typed name must match; links expire in 14 days and can be revoked | Built |
| B2 | **R**epudiation: "I never agreed" | Hash-chained, Ed25519-signed consent ledger; user agent and time stored | Built |
| B2 | **D**oS: link brute force or spam | Per-IP and per-link rate limits, 64 KB bodies | Built |
| B2 | Exposure of the studio | Tunnel allowlist: only consent paths, static files and token-gated media; the rest is 404 at the edge (`deploy/tunnel/cloudflared.example.yml`) | Planned (config written, tunnel not set up) |
| B3 | SSRF to metadata or the LAN | Connect-time address check, no redirects, hosted mode blocks private ranges (`server/ssrf.ts`) | Built |
| B3 | Key leakage | Keys sealed at rest, unsealed per call, never returned; provider errors are fixed strings | Built |
| B3 | Provider logs creator content | Privacy classes, redaction before "may log" providers, no cross-class fallback | Planned (Lane C) |
| B4 | Malformed or huge media pins the worker | Upload cap, magic-byte check, ffprobe timeout, duration limit, process timeouts | Built (ffmpeg ceiling still 6 h) |
| B4 | Command injection via filenames | Tools run with argument arrays, never a shell (`server/media.ts`) | Built (existing) |
| B5 | Two workers finish the same job | Finish only with the matching `worker_id` while running | Built |

## OWASP Top 10 for LLM applications (the studio assistant, Lane C)
| Risk | Control | Status |
|---|---|---|
| LLM01 Prompt injection | Transcript in a delimited untrusted block, canary token, injection classifier badges lines, proposals only, approval required | Planned |
| LLM02 Sensitive information disclosure | Redaction (phone, SA ID, email, consent names) before "may log" providers; consent records never sent | Planned |
| LLM06 Excessive agency | Typed, non-destructive tools only; every action goes through `plan_run` approval. The current planner already needs approval (`server/planner.ts`) | Partly built |
| LLM10 Unbounded consumption | Per-user rate limits, daily token cap, 30 s timeout | Planned. The planner route is rate-limited now |

## Known gaps
- The CSP is Report-Only until it is enforced.
- Logs don't redact secrets yet.
- No security CI yet.
