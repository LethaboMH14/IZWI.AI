# Threat model: IZWI AI Lane A

**Scope:** Current local demo architecture and reviewed backend code, as recorded in `docs/BUILD-STATUS.md` and `SECURITY-REVIEW-2026-11.md`. This is a design and evidence map, not a penetration test or production assurance. Planned integrations are not treated as deployed systems.

## Assets and security goals

- Source media, derived media, transcripts, captions and project metadata: keep private to the creator's workspace and process only for requested tasks.
- Accounts, sessions, workspace membership and role assignments: prevent impersonation and unauthorized cross-workspace access.
- Provider keys: keep confidential and usable only by authorized server-side provider calls.
- Consent, review and licensing-enquiry records: preserve integrity, limit access and honor expiry/revocation.
- Worker capacity and local files: prevent malformed or excessive work from exhausting the demo host or escaping intended storage.

## Actors and trust boundaries

| Boundary | Untrusted input / actor | Principal risk |
|---|---|---|
| Browser to signed-in app | Authenticated member, compromised browser, cross-site request | Unauthorized writes, role abuse, cross-workspace disclosure |
| Public link to guest route | Anyone who receives or guesses a token | Link misuse, consent spoofing, private media exposure, spam |
| Upload to worker and media tools | Creator-provided files, filenames and metadata | Parser/resource abuse, unsafe serving, command misuse |
| App to AI provider | Creator prompt/media context, user-configured endpoint, provider response | Data disclosure, server-side request forgery, malformed proposal, misleading output |
| App and worker to Postgres and media storage | Concurrent processes and filesystem state | Tenant mix-up, duplicate work, corruption or data loss |
| Demo host to external network/tunnel | Network users and tunnel operator | Exposure beyond guest routes; configuration drift |

## Defensive controls and evidence

| Threat | Current defense | Status and remaining limit |
|---|---|---|
| Session spoofing and sign-in abuse | better-auth database-backed sessions, passkeys, database rate limits | Code and selected review evidence exist. Production identity configuration is not claimed. |
| Cross-site writes | Same-origin `Origin` / `Sec-Fetch-Site` checks on writes, including upload | Verified by selected HTTP checks in the security review. |
| Cross-workspace reads/writes | Workspace-scoped server queries and role checks; workspace-prefixed job idempotency | Function-level tests exist. HTTP-level two-tenant route tests remain planned. |
| Uploaded content served as active content | Server-selected extension/MIME, sandboxed media serving, `nosniff`, CORP and nonce CSP | CSP remains Report-Only unless explicitly enforced; enforcement review of signed-in pages is open. |
| Guessing or reusing public tokens | Random tokens stored hashed; purpose/project checks; expiry and revocation; rate limits | Implemented/reviewed. External tunnel is not configured or tested. |
| Forged or disputed consent record | Hash-chained, Ed25519-signed ledger with append-only triggers and verification script | Ledger check ran on a database copy with zero entries; this is not identity proof or a legal rights determination. |
| SSRF through user-configured provider URLs | Connect-time address checks, private-range blocking in hosted mode, no redirects, response cap | Implemented/reviewed. No claim that every deployment/network is hardened. |
| Provider key exposure | AES-256-GCM sealed at rest; unseal only for calls; fixed/sanitized provider errors | Implemented/reviewed. Secret log redaction and rotation procedure need operational completion. |
| Malformed/oversized media or worker exhaustion | Upload limits, magic-byte checks, ffprobe and process timeouts, duration limits, capped request bodies | Implemented with limits; ffmpeg ceiling is still six hours and needs tightening. |
| Prompt injection or unsafe model actions | Model response is schema-validated as bounded intents; reviewed code builds a plan; human approval precedes queueing; no model-written code execution | Current planner supports rule-based planning and optional provider-assisted proposals. This is not a general autonomous agent. Prompt-injection defenses and redaction for providers that may log are not yet implemented. |
| Provider retention/training beyond creator expectation | Disclosure and provider-by-provider verification required before live use | Not verified. No live provider key or contractual review is evidenced. Do not promise provider-side deletion or no-training without proof. |
| Tunnel exposure | Example allowlist limits intended public routes | Config only; no tunnel exists or has been tested. Do not treat the studio as safely internet-exposed. |
| Secret/personal data in logs | Sanitized provider errors | Logs are not comprehensively redacted; this remains open. |

## Model and tool boundary

The model may suggest a limited intent such as transcription, clipping or translation. Server code validates the intent, checks project state and authorization, applies consent and resource gates, and builds the executable plan. A person must approve before work is queued. Provider output cannot grant itself access, change a role, skip consent, publish to a platform or execute arbitrary code. Unsupported intents should fail closed. The current project does not have live social-platform publishing, audience analytics or production commerce integrations.

## Release gates

Before external or production use, close or formally accept these risks: enforce CSP after a signed-in browser review; run route-level workspace isolation and link lifecycle tests; redact secrets and personal data from logs; tighten worker resource limits; document and test retention/deletion and backups; verify provider terms and regional handling; and verify tunnel allowlisting plus sign-in. Independent security certification and production penetration testing are not evidenced.

## Evidence boundary

The November 2026 security review reports local CI passing (5 test files, 58 tests), selected same-origin/body-limit checks, and a ledger verification on a local database copy. It does not establish production deployment, a live external provider, a public tunnel, independent assessment, or human user validation. See `docs/security/SECURITY-REVIEW-2026-11.md` for the detailed results and open items.
