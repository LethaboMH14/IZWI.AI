# Security review, November 2026 (Lane A)

Scope: plan v3 §1 (security fixes) and §2 backend (correctness bugs), on branch `sec/hardening-review`, from `main` at `3d61d48`. Paths are under `web/`.

**Status key**
- **Fixed:** code changed, with a test that fails without the change.
- **Partial:** part of it is built; the gap is named.
- **Open:** not started.

Nothing here is marked fixed because it was designed or mocked.

## Verification, 24 Nov 2026 (Windows 11, Node 24)
| Check | Result |
|---|---|
| `npm run ci` (tsc, eslint, vitest, next build) | passes: 5 test files, 58 tests |
| Headers on `next start` (`curl -I /sign-in`) | `content-security-policy-report-only` with a nonce, Referrer-Policy, X-Frame-Options; all 12 page scripts carry the nonce |
| CSP violations in the browser console, `/` and `/sign-in` | none. The signed-in studio pages were not checked yet |
| Writes over HTTP | no `Origin` → 403; `Origin: https://evil.example` → 403; same origin → passes to validation (400) |
| 70 KB JSON body to a public route | 413 |
| Migration 2 on a copy of a real local database | applies; idempotency keys rewritten with the workspace prefix; integrity ok |
| `npx tsx scripts/verify-ledger.ts` on that copy | ok, 0 entries (no consent answered yet on it) |

## §1 Security fixes
| # | Item | Status | Evidence | Notes |
|---|---|---|---|---|
| 1 | Upload MIME XSS | Fixed | `src/server/filetype.ts`, `src/server/upload.ts`, `src/server/storage.ts`, `tests/http-guards.test.ts` | Type comes from an extension allowlist plus magic bytes. The stored extension and MIME are chosen by the server. Serving sends `sandbox` CSP, `nosniff` and CORP; non-media downloads as `application/octet-stream`. ffprobe still validates the streams in the probe step |
| 2 | Headers + CSP | Partial | `src/proxy.ts`, `src/server/headers.ts`, `next.config.ts`, `src/app/layout.tsx` | Nonce CSP on every page (the root layout renders per request so static pages get a nonce too). API headers in `next.config.ts`. **Report-Only** until `IZWI_CSP_ENFORCE=1`. `style-src`/`font-src` allow Fontshare until Switzer is self-hosted (Lane B). `/trust` gets `'wasm-unsafe-eval'`. Cookie flags not re-checked |
| 3 | CSRF | Fixed | `src/server/http.ts`, `src/server/upload.ts`, `tests/http-guards.test.ts` | A missing `Origin` is no longer let through; `Sec-Fetch-Site: same-origin` is the only fallback. The tus route checks too |
| 4 | Input and resource limits | Partial | `src/server/http.ts`, `src/server/env.ts`, `tests/http-guards.test.ts` | JSON capped at 64 KB, reading stops at the cap even if Content-Length lies. Uploads 2 GiB by default. ffprobe already had a 60 s timeout and the probe step a duration limit; ffmpeg's 6 h ceiling was not tightened |
| 5 | Rate limits | Fixed | `src/server/ratelimit.ts`, `src/server/public.ts`, `tests/security-db.test.ts` | SQLite fixed window (no new dependency; `rate-limiter-flexible` can replace it behind the same call). On: public GET and POST, consent per link, enquiries, `/api/plan`, provider add/test, upload creation. better-auth uses `storage: "database"`. Client IP from forwarded headers only with `IZWI_TRUST_PROXY=1`. `/api/assistant` is Lane C |
| 6 | SSRF | Fixed | `src/server/ssrf.ts`, `src/server/providers.ts`, `tests/ssrf.test.ts` | Connect-time check via `lookup` on `node:http(s)` plus `net.BlockList` (no undici or ipaddr.js needed). Includes IPv4-mapped IPv6, 100.64/10, fc00::/7, fe80::/10, 0/8. Redirects never followed; responses capped at 16 MB; fixed error messages. Provider add and test are owner/admin only. Rebinding fixture: `localhost` resolving to loopback is refused when hosted |
| 7 | Public links | Fixed | `src/server/actions.ts`, `src/server/public.ts`, `tests/security-db.test.ts` | Consent links use `LIMITS.linkDays` (14). `assetAllowedForToken` checks purpose and project. Review links had no approve-all; each line approval is now audited with reviewer and line |
| 8 | Tenant isolation | Fixed | `src/server/jobs.ts`, `src/server/migrations.ts`, `src/server/pipeline.ts`, `src/server/actions.ts`, `tests/security-db.test.ts` | Idempotency keys stored as `<workspace>:<key>` (migration 2 rewrites old rows; no table rebuild). `runStep` returns `publicJob`. Every worker lookup checks `workspace_id` |
| 9 | Secrets | Partial | `src/server/providers.ts`, `src/app/api/plan/route.ts` | Keys unsealed only inside the call. Provider and planner errors sanitised. **Open:** pino `redact` (no pino yet), gitleaks config, `.env.example` audit. Rotation documented in `SECURITY.md` |
| 10 | Audit + consent ledger | Partial | `src/server/ledger.ts`, `scripts/verify-ledger.ts`, `src/app/api/workspace/audit/route.ts`, `tests/security-db.test.ts` | Ledger: hash chain, Ed25519 via `node:crypto`, signing key derived from the master key, append-only triggers, verification needs a trusted key. Audit now covers project edits, line approvals and approve-all; owner-only `GET /api/workspace/audit`. **Open:** Team-page list, "AI activity" view, assistant proposals (Lane C), `/trust` chain head (Lane B) |
| 11 | Tunnel exposure | Partial | `../deploy/tunnel/cloudflared.example.yml` | Allowlist written for a named Cloudflare tunnel (assumption). Not run: no tunnel exists yet. Open question in the file about studio sign-in over the tunnel |
| 12 | Deliverables | Partial | `../SECURITY.md`, `../docs/security/THREAT-MODEL.md`, this file | **Open:** `docs/business/SSDLC.md`, `docs/DATA-USE.md` |

## §2 Backend correctness
| Item | Status | Evidence | Notes |
|---|---|---|---|
| Publish before Cut (demo blocker) | Fixed | `src/server/planner.ts`, `src/server/pipeline.ts`, `tests/planner-publish.test.ts` | Publish queues a `publish` fan-out job that depends on Cut. It keeps the clips Cut made in that plan and renders every kept clip not already rendered. A following Record step is re-pointed to wait for the renders. Each render still passes the consent gate |
| Approve in one transaction; missing source | Fixed | `src/server/planner.ts`, `tests/planner-publish.test.ts` | All jobs plus the status change in one transaction, steps ordered by dependency whatever order a model gives. No source → 409 and nothing queued |
| `isPreset` with `Object.hasOwn` | Fixed | `src/server/render.ts` | |
| Jobs finish only with the leasing worker; cancel re-checked | Fixed | `src/server/jobs.ts`, `worker/index.ts`, `tests/security-db.test.ts` | `succeed`, `failJob` and `block` require `worker_id` and `status = 'running'` in the same statement or transaction |
| Escape `LIKE` | Fixed | `src/server/actions.ts` | `ESCAPE '!'` |
| `resolveComment` 404 | Fixed | `src/server/actions.ts` | |
| Re-queue only affected outputs | Open | | `public.ts` consent grant still re-queues all blocked outputs of the project; each render re-checks its own gate, so nothing renders early |
| Delete races | Partial | `src/server/upload.ts` | Upload completion re-checks the project exists. Soft-delete → cancel → worker cleanup not built |
| Providers: model required, no query strings, retry without `response_format` | Fixed | `src/server/providers.ts`, `src/app/api/providers/route.ts`, `tests/ssrf.test.ts` | |
| Dead `clips`/`asr` roles, `knip` | Open | | |

## Not done in this lane yet
- Security CI workflow (§7): waits on the foundation-CI PR.
- HTTP-level two-tenant tests through the route handlers. The current isolation tests call the server functions directly.
- CSP enforcement and a walk through the signed-in studio with the CSP enforced.
