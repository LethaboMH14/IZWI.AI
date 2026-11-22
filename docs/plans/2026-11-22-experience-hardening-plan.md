# IZWI AI: experience, assistant, hardening and repo upgrade (v2, after critique)

> **Status:** proposed, awaiting review by @LethaboMH14 (go-ahead / changes in the PR).
> **Authors:** Sibusiso Khumalo with Claude (Claude Code). **Date:** 22 Nov 2026.
> **Process:** v1 drafted from a full read of the repo, v2 after an independent reviewer agent critiqued it. Building starts only after Lethabo's go-ahead, with the judge and improver agents' feedback folded in.

## Context
IZWI AI (Next.js 16.4 + React 19.3 app in `IZWI.AI/web`, SQLite, job worker, whisper.cpp, ffmpeg) runs end to end on Sibusiso's laptop. Verified 22 Nov: upload → transcript → clips → consent gate → 9:16 render → hand-off zip.

Team Sonar presents at the NEMISA Discothon on Sun 29 Nov 13:15. Judging: innovativeness 10, team 10, submission 5, business model 5, cybersecurity 5.

Sibusiso asked for:
- phone + PC compatibility;
- an interactive 3D environment;
- research-backed, open-source-first enhancements;
- an animated opening screen and animated transitions;
- a logo;
- Meta + OpenRouter free models via API;
- a whole-repo code review with bug fixes;
- a senior-engineer-grade GitHub setup;
- full QA and a full security review;
- the rest of the repo's open work.

A reviewer agent critiqued v1; its fixes and upgrades are folded in here.

**User decisions**
- 3D: landing "story room" plus a studio 3D map, with 2D fallback on phones.
- AI: streaming studio assistant whose actions run only after approval.
- Git: branches + PRs to `LethaboMH14/IZWI.AI`. Account `Sibusiso-K` has push access, not admin; the repo is public.
- CODEOWNERS: `@LethaboMH14`, with a commented placeholder for Sibusiso.

**Repo rules (`IZWI.AI/AGENTS.md`)**
- Ivory/amber/charcoal; no purple or dark default.
- Keep Naledi; no fabricated metrics.
- Open source where suitable, licences checked.
- Name `CRITERIA.md` IDs per change; `done` only with real evidence paths.
- `scripts/verify_handoff.py` must keep passing.

**Licence policy for new dependencies**
- Allowed: MIT, Apache-2.0, BSD, ISC, OFL.
- Dev-only acceptable: MPL-2.0 (axe-core).
- Not shipped: GPL/AGPL/non-commercial/source-available. Specifically ffmpeg.wasm core (GPL), the Theatre.js studio (AGPL), Remotion (source-available), GSAP (not OSI) and mediabunny (MPL, avoid).
- A CI licence gate enforces this.

## The demo we are building toward (about 6 minutes)
1. Splash → interactive Story Room (the voice strand built from a real episode's waveform; five pillar stations).
2. Passkey sign-in → seeded project (`npm run seed:demo`).
3. Push-to-talk: "three TikTok clips and isiZulu draft captions" → the assistant streams a plan with reasons → Approve → jobs run.
4. A prompt injection planted in the transcript is flagged, and no proposal comes from it.
5. A QR code appears on screen. A judge consents on their own phone, the held clip turns moss in the 3D Rights map, and the render starts.
6. The render carries Content Credentials (C2PA, test certificate) that bind the consent record. Download the hand-off zip. Same screen shown at phone width.
7. Earn + Plans page: R0/R149/R499/R1499 limits actually enforced. BYOK and free models mean no inference cost to IZWI.
8. `/trust` page: CI badges, ZAP baseline, SBOM, real Lighthouse/axe numbers, threat model. Team lanes and PR history.

## Delivery shape and schedule
**Sun 22 (tonight): PR 1 `chore/foundation-ci`**
- Commit this session's uncommitted fixes first. Then a Prettier baseline commit, recorded in `.git-blame-ignore-revs`.
- Add `.editorconfig`, `.nvmrc`, `allowScripts`, and `!.env.example` in `web/.gitignore`.
- CI v1: format, lint, types, Vitest, build, handoff scripts, gitleaks, osv-scanner. Actions pinned by SHA.

**Mon 23 to Thu 26: four parallel lanes**
- Each lane gets its own branch/worktree, owns its own files and opens its own PR. They rebase on main daily.

| Lane | Branch | Covers |
|---|---|---|
| A | `sec/hardening-review` | §1, §2, §7 security CI, §8 security tests |
| B | `feat/brand-motion-responsive` | §3, Plans page and `/trust` shell from §10 |
| C | `feat/studio-assistant` | §5, §5b consent QR handshake |
| D | `feat/3d-world` | §4, §6 research doc |

- Repo docs and QA scaffolding (§7, §8) go to whichever lane frees up first, or to me between lanes.

**Mon 23 noon spikes (go/no-go)**
1. `@contentauth/c2pa-node` on Windows.
2. R3F at 60 fps on Sibusiso's phone.
3. Free-model JSON/tool reliability on OpenRouter.
4. A stable HTTPS hostname via Cloudflare Tunnel or Tailscale Funnel. Needed for phone consent, mic and passkeys.

**Fixed dates**
- Thu 26 18:00: feature freeze. Kill switches `IZWI_FLAG_3D` and `IZWI_FLAG_ASSISTANT` stay in.
- Fri 27: real Android + iPhone pass, QA and security reports with real numbers, deck + 2-minute backup video.
- Sat 28: three rehearsals from tag `v0.9.0-demo` under `next start`, one with Wi-Fi off (Ollama fallback).
- Sun 29: no merges.

---

## 1. Security review fixes (Lane A)
Paths are under `web/src`.

1. **Upload MIME XSS.**
   - `server/upload.ts:51,66` trusts the client's `filetype`, and `api/media/[id]/route.ts:30` serves the file inline with that type.
   - Fix: derive the type server-side from the extension allowlist plus magic bytes / ffprobe.
   - Serve only `video/*`, `audio/*` or `image/jpeg|png`, with `nosniff`, `CSP: sandbox`, and `CORP: same-origin`.
2. **Headers + CSP.**
   - Pages: `src/proxy.ts` (Next 16), with the matcher excluding `api|_next/static|_next/image|favicon` and prefetches. The proxy buffers bodies and tus sends 8 MB chunks.
   - Nonce CSP:
     - `script-src 'nonce' 'strict-dynamic'`;
     - `style-src 'self' 'unsafe-inline'`;
     - `img-src 'self' data: blob:`;
     - `media-src 'self' blob:`;
     - `connect-src 'self'`;
     - `font-src 'self'`;
     - `worker-src 'self' blob:`;
     - `object-src 'none'`;
     - `base-uri 'none'`;
     - `form-action 'self'`;
     - `frame-ancestors 'none'`.
   - API headers go in `next.config.ts` `headers()`.
   - Ship `Report-Only` for 24 h first. Every page becomes dynamic, which is accepted and documented.
   - Also HSTS (prod), Referrer-Policy, Permissions-Policy (`microphone=(self)`) and COOP.
   - Self-host Switzer only if its Fontshare licence allows; otherwise an OFL fallback.
3. **CSRF.** `server/http.ts:33` lets a missing `Origin` through. Require `Origin` or `Sec-Fetch-Site: same-origin` on mutations, including the tus route.
4. **Input limits.** Cap JSON bodies in `http.ts` `body()` (64 KB default). The per-workspace storage quota is deferred.
5. **Rate limits.**
   - `rate-limiter-flexible` (ISC) with a SQLite store on public routes (GET too), `/api/plan`, `/api/assistant`, provider tests, uploads and consent answers.
   - Set better-auth `rateLimit.storage: "database"`.
   - Client IP comes from `x-forwarded-for` only with `IZWI_TRUST_PROXY=1`.
6. **SSRF** (`server/providers.ts:30-62`).
   - Check at connect time with an undici `Agent` `connect.lookup` plus `ipaddr.js` (MIT) range checks: private, loopback, link-local, 100.64/10, fc00::/7, fe80::/10, IPv4-mapped, 0/8. This avoids the TOCTOU gap that DNS rebinding exploits.
   - Applied when `IZWI_HOSTED=1`; local Ollama stays allowed.
   - `redirect: "manual"`.
   - Fixed error messages; no upstream body echoed.
   - Owner/admin only for provider tests and edits.
7. **Public links.**
   - Consent links honour `LIMITS.linkDays`.
   - `assetAllowedForToken` checks the link's purpose.
   - Review links can't approve all; each approval records the reviewer and line.
8. **Tenant isolation.**
   - Workspace-scoped idempotency (migration 2).
   - `runStep` returns `publicJob`.
   - Worker lookups check `workspace_id` (`server/pipeline.ts:25-26`).
9. **Secrets.**
   - Keys are decrypted only inside the request.
   - Provider errors are sanitised (`api/plan/route.ts:30`).
   - gitleaks config.
   - `.env.example` files match the env vars the code reads.
10. **Audit.**
    - Log provider changes, line approvals, project updates, deletes and assistant proposals.
    - Owner-only `GET /api/workspace/audit` plus a list on the Team page.
    - An "AI activity" view built from `usage_event`.
11. **Deliverables** (also covers CRITERIA P5, A8, A9):
    - `SECURITY.md`;
    - `docs/business/SSDLC.md`;
    - `docs/security/THREAT-MODEL.md` (STRIDE per trust boundary);
    - `docs/security/SECURITY-REVIEW-2026-11.md`;
    - `docs/DATA-USE.md` (training opt-in, provider privacy classes).

## 2. Code review: correctness bugs (Lane A, except frontend items marked [B])
**Backend**
- `render.ts:15` `isPreset`: `Object.hasOwn`.
- `jobs.ts:44-57`: complete or fail only with a matching `worker_id`; re-check cancel in the same transaction.
- `planner.ts:104-143`: approve in one transaction; handle a missing source (no `!`).
- `actions.ts`:
  - escape the `LIKE` (line 158);
  - `resolveComment` returns 404 on no match (247);
  - re-queue only the affected outputs (110/188/219, `public.ts:115`).
- Delete races: soft-delete → cancel jobs → worker removes files. Upload completion re-checks that the project exists.
- Providers:
  - `model` required;
  - reject query strings in base URLs;
  - retry without `response_format` on a 400;
  - remove or wire the dead `clips`/`asr` roles and `transcribeEndpoint`.
- Run `knip` (ISC) to find dead code and dependencies.

**Frontend [B]**
- `CaptionPlayer.tsx:13`: hydration mismatch.
- `Strand.tsx`: redraw after resize under reduced motion.
- `?new=1` vs `mode=create`.
- Dead `/app/episode-04` links.
- `/design` dev-only.
- Accessibility:
  - tabs need aria-controls, panels and arrow keys, with no hover-switching;
  - MarketMap points need Space and visible focus;
  - `NewStory.tsx:81` input needs a label;
  - low-contrast tokens.
- `engine/page.tsx:340`: add an unmount guard.
- **Live updates:** `useLive` polls every 10 s when idle (`StudioShell.tsx:90`). Switch to SSE (or 1 s polling) while a consent request or job is pending, so the consent moment is instant.

**Tests:** Vitest for crypto, rights gate, jobs claim/lease/race, the SSRF guard, rate limiter, idempotency scoping, `lineFlag` and consent scope. HTTP two-tenant isolation tests.

## 3. Brand, opening screen, transitions, responsive (Lane B)
**Logo**
- New `components/Mark.tsx`: seven amber voice bars that rise into an open speech ring (izwi = voice). Wordmark in Fraunces.
- Tested at 16, 32, 180 and 512 px and in monochrome.
- Files: `app/icon.svg`, `apple-icon.tsx`, `manifest.ts` (installable; no service worker this week), `opengraph-image.tsx`, plus a brand SVG in `assets/current/brand/` and `assets/manifest.json`.
- An animated variant draws the bars in.

**Opening screen**
- `components/Splash.tsx`: server-rendered CSS animation, at most about 900 ms. It never waits on 3D.
- Shown once per session using a cookie, so there's no flash. Skippable. Instant under reduced motion. Never shown on the guest routes `/c`, `/r`, `/l`.
- Branded `loading.tsx` skeletons, plus the missing `error.tsx` and `not-found.tsx`.

**Transitions**
- React 19.3 `<ViewTransition>` used directly; the `experimental.viewTransition` flag was removed in Next 16.3.
- Route cross-fade and a studio stage slide.
- Card → studio-header morph only if the header renders in the server shell; otherwise a fade.
- In-page motion: `motion` (MIT, already a dependency) via `LazyMotion` + `m` for stage panels, plan cards, toasts and the assistant panel.
- Reduced motion disables all of it; unsupported browsers navigate instantly.

**Phone + PC**
- `viewport` export (`viewport-fit=cover`, `themeColor`).
- Landing sheet menu below 860 px.
- Safe-area insets plus bottom padding under the fixed rail and prompt bar.
- Studio title wraps; stage-rail scroll cue; Protect status no longer truncated (D3).
- Collapsible phone composer (D4).
- Transcript column: independent scroll and sticky player (D5).
- Listing: description, then use/term before the form (D6).
- 44 px touch targets.
- `next/image` for public images; `unoptimized` for private `/api/media`.
- Critique fixes: Run on storage label; the consent page says a name is needed to decline too; "New render settings" vs "Existing render".

**Data-saver mode** (South Africa specific, research-backed)
- Honour the `Save-Data` header and `navigator.connection`.
- 3D only on Wi-Fi or when the user opts in.
- Light previews by default.
- A "this page cost ~N KB" footer.
- `web-vitals` (Apache-2.0) field reporting into `usage_event`.

**Productivity**
- `cmdk` (MIT) ⌘K / Ctrl+K palette.
- Editor shortcuts (J/K/L, I/O, ←/→) with a `?` overlay.
- Toasts; optimistic keep/drop/approve; a "Saved" indicator.

## 4. Interactive 3D environment (Lane D)
**Stack** (all MIT except n8ao, which is ISC)
- `@react-three/fiber@9.8` (peers React <19.4, so Dependabot ignores react minors);
- `@react-three/drei@10.7`;
- `@react-three/postprocessing` (SMAA + subtle `n8ao` AO; no bloom on ivory);
- `maath` (damping), `@react-spring/three`;
- `detect-gpu` (MIT) for the tier, with its benchmarks self-hosted;
- `leva` (dev only).
- Avoid drei `<Text>` (troika weight).
- Self-host every drei and detect-gpu asset (HDRIs, Draco). No CDN fetches, to keep `connect-src 'self'` and work offline at the venue.
- Scenes load with `next/dynamic({ ssr:false })` after idle, behind `IZWI_FLAG_3D`.

**Landing Story Room** (`components/world/StoryRoom.tsx`)
- A light "paper studio" scene. The voice strand sits at the centre, built from a real episode's waveform peaks (an existing worker output), with mic reactivity opt-in.
- Five pillar stations on a ring. Drag, scroll or tap orbits to a station, which opens an accessible DOM card. Stations double as keyboard buttons; the canvas is `aria-hidden`.
- Performance and fallbacks:
  - `PerformanceMonitor` adaptive DPR `[1,2]` with one step down on phones;
  - `frameloop="demand"` when idle; pause offscreen;
  - handle WebGL context loss on iOS;
  - fallback to the current static art and 2D cards when there is no WebGL, a low tier, data saver or reduced motion.

**Studio Rights map** (`components/studio/RightsMap3D.tsx`)
- Replaces the generic "story map 3D".
- The episode is a waveform disc; clips orbit on a timeline arc; people float as consent nodes linked to the clips they appear in; outputs are satellites.
- Colours: held = clay, ready = moss, draft = gold.
- It animates live when consent arrives (the demo moment).
- Shares selection with the 2D `StoryGraph`. Phones default to 2D.
- First thing cut if Thursday's checkpoint fails.

**Budgets** (with `size-limit`, MIT, in CI): landing first-load JS ≤ 200 KB gzip; 3D chunk ≤ 350 KB gzip.

## 5. Studio assistant: Meta + OpenRouter free models (Lane C)
**Stack**
- `ai` 7.x + `@ai-sdk/react` (Apache-2.0) for streaming and typed tools.
- `@openrouter/ai-sdk-provider` (Apache-2.0).
- `@assistant-ui/react` (MIT) for the chat UI.
- All provider HTTP goes through a custom `fetch` that applies the §1.6 SSRF guard.
- A zod JSON-proposal fallback for free models whose tool calling is unreliable.

**Providers and router** (`server/providers.ts`, engine page)

| Provider | Setup | Privacy class |
|---|---|---|
| OpenRouter | `https://openrouter.ai/api/v1`; free models from live `GET /models` filtered to `:free`, including `meta-llama/*:free`; `HTTP-Referer`/`X-Title` headers; 429 → friendly message (about 20/min, 50/day without credits) | May log, so excerpts are redacted (names, emails, phone numbers) and consent records are never sent |
| Meta | Per the repo's research (`docs/research/open-source-map.md` F1/F2): `https://api.meta.ai/v1`, Standard mode only (Contributor mode trains on content). Not free; the URL is re-verified at build | Standard |
| Ollama (MIT) | Local `llama3.2:3b`. The Llama community licence is noted as not OSI | Private |

- New `chat` role.
- Fallback chain: OpenRouter free → Meta → Ollama, so the demo survives a Wi-Fi drop.
- Keys stay sealed by `server/crypto.ts`.

**Route** `POST /api/assistant` (SSE, `force-dynamic`, `Cache-Control: no-store, no-transform`, tested under `next start`)
- Request body (zod):
  - ≤ 20 turns, each ≤ 2,000 characters, ≤ 12,000 characters in total;
  - roles user/assistant only.
- Rate limit 10/min and 100/day per user per workspace; daily token cap in `usage_event`; 30 s timeout; abort on disconnect.
- Server-built context (`server/assistant.ts`): project facts plus a transcript excerpt (≤ 4 K characters) inside a delimited untrusted-data block, and a canary token in the system prompt.
- Typed tools, all non-destructive and all proposals:
  - `keepClip`, `dropClip`, `trimClip`, `addGlossaryTerm`, `requestConsent`, `draftTitles`, `draftCaptionPost`, `runStep(transcribe|translate|render|package)`.
  - Each shows a diff preview and its source ("from transcript line 14").
  - Approve goes through the existing `plan_run` → `/api/plan/[id]` path.
- Output: plain text plus an escaped markdown subset. No images; links shown as plain text. `img-src 'self'` as a backstop.
- Threads persist per project (`assistant_message`, workspace-scoped, 30-day retention).
- Push-to-talk "speak to IZWI": MediaRecorder → the existing whisper.cpp. Labelled en/af today. VAD skipped (noisy venue).

**UI:** a slide-over panel (a bottom sheet on phone) with suggested prompts per stage.

**Tests** (OpenAI-compatible mock server `web/e2e/mock-llm.mjs`, plus `promptfoo` (MIT) red-team runs saved as evidence)
- streaming renders;
- an injection in the transcript yields no proposal derived from content;
- a plausible harmful proposal still needs approval and shows a diff;
- markdown-image exfiltration is blocked;
- no system-prompt canary leaks;
- 429 when rate-limited, 413/400 on oversized input;
- the key never appears in any response, HTML or log.

## 5b. Live consent handshake + Content Credentials (Lane C)
**Consent handshake**
- "Show QR" next to a consent request, using `uqr` (MIT, SVG).
- The guest page works on any phone over the stable HTTPS hostname. `IZWI_PUBLIC_URL` and the passkey `rpID` are set from it, with `IZWI_TRUST_PROXY=1`.
- The studio receives the answer live (SSE) and the Rights map updates.

**C2PA**
- The render job signs each MP4 with `@contentauth/c2pa-node` (MIT; c2patool as fallback).
- Assertions: creator declaration, a hash of the consent record, and an AI-use assertion.
- Labelled honestly as a test certificate. Moves C6 provenance toward done.
- Depends on Monday's spike; if it fails, emit a signed JSON sidecar instead.

## 6. Research deliverable (Lane D): `docs/research/experience-research.md`
**Sources**
- R3F/drei performance docs.
- Open R3F audio visualizers (`r3f-equalizer`, poeti8's `unknown-pleasures`/`bolandgoo`, the three.js-forum Audio-Reactive Visualizer).
- Web editors for timeline and shortcut conventions: OpenCut (MIT, classic branch), Omniclip, designcombo `react-video-editor`.
- Next 16 view transitions; React `<ViewTransition>`.
- C2PA / Content Credentials.
- OpenRouter free tier and privacy; Meta API modes.

**UX evidence**
- WCAG 2.2 AA (target size, focus appearance).
- Core Web Vitals including INP.
- NN/g response-time limits (0.1 / 1 / 10 s) for splash and streaming.
- South African data costs and connectivity (Stats SA, CRITERIA A12).

**Licence table:** every adopted and rejected dependency with the reason.

## 7. Senior-grade GitHub repo (PR 1 plus whichever lane frees up)
**Docs**
- `README.md` rewrite: pitch, Mermaid architecture, setup for Windows (Build Tools + `allowScripts`), macOS and Linux; scripts; repo map; the evidence-gated `CRITERIA.md` process; status. Update `web/README.md` (stale "sample data only").
- `CONTRIBUTING.md`:
  - branches `feat/`, `fix/`, `chore/`, `docs/`, `sec/`;
  - Conventional Commits with a semantic PR-title check;
  - PR checklist (criteria IDs, tests, screenshots);
  - lanes from `docs/TEAM-SPLIT.md`;
  - a branch-protection request for Lethabo (admin): required checks, 1 review, linear history, secret push protection.
- `CODE_OF_CONDUCT.md`, `SECURITY.md`.
- `CHANGELOG.md` (Keep a Changelog, hand-written; release-please dropped).

**`.github/`**
- `CODEOWNERS`.
- Issue forms (bug, feature, design critique) and `config.yml` pointing security reports to `SECURITY.md`.
- `PULL_REQUEST_TEMPLATE.md`.
- `dependabot.yml`: npm `/web` weekly and grouped, ignoring react/react-dom minors while R3F peers <19.4; plus github-actions.

**Workflows** (all actions pinned by SHA; `zizmor` (MIT) lints the workflows)
- `ci.yml`: format, ESLint, types, Vitest + coverage, build, `size-limit`, `verify_handoff.py` + `financial_model.py`, licence gate (`license-checker-rseidelsohn`, BSD-3; fails on GPL/AGPL/NC in production dependencies), semantic PR title.
- `e2e.yml`, with three projects:
  - Chrome channel: the full `@slow` pipeline (bundled Chromium lacks H.264/AAC);
  - chromium, firefox, webkit: smoke + axe;
  - Pixel 7 and iPhone 14 emulation.
  - Linux whisper.cpp is built from the pinned v1.9.5 tag with cmake (cached) via a new Linux branch in `setup.mjs` (`WHISPER_CLI`).
  - Test media from a cross-platform `scripts/make-test-media.mjs` (espeak-ng, GPL, CI-only) + ffmpeg. Assertions check structure, not exact words.
- `lighthouse.yml`: LHCI mobile on public routes (`/`, `/sign-in`, `/c/<seeded>`, `/l/<seeded>`). Budgets: LCP < 2.5 s, TBT < 300 ms, CLS < 0.1, a11y ≥ 95.
- `security.yml` (PRs + weekly):
  - `npm audit --omit=dev`, osv-scanner (Apache-2.0), gitleaks, Semgrep (`p/typescript`, `p/nextjs`, `p/owasp-top-ten`);
  - CodeQL (free on this public repo);
  - OWASP ZAP baseline against `next start`;
  - OpenSSF Scorecard;
  - CycloneDX SBOM (`@cyclonedx/cyclonedx-npm`, Apache-2.0) published as an artifact and on `/trust`;
  - nightly promptfoo red-team against the mock LLM.

**Observability:** pino logs with request IDs (OpenTelemetry cut).

## 8. QA
**Playwright** (`web/e2e/`; `webServer` = `next start` + worker on a scratch `IZWI_STORAGE_DIR` + mock LLM)
- Auth, including passkey where supported and the rate limit.
- Onboarding regression: the workspace name.
- Full pipeline via `setInputFiles`.
- Consent through the QR/public link.
- Review link, listing enquiry, provider add/test, and the §5 assistant suite.
- Two-tenant isolation; CSP and headers present; revoked links fail; the landing works with WebGL disabled and under reduced motion.

**Accessibility:** `@axe-core/playwright` (MPL-2.0, dev only) on every route, desktop and mobile; serious/critical findings fail the run.

**Performance:** LHCI mobile; `web-vitals` field data from the real phones.

**Cross-browser:** the matrix above, plus a real Android and a real iPhone pass on Fri 27.

**Screenshots:** Playwright regenerates `design/mockups/` (closes BUILD-STATUS 6 screenshots).

**Report:** `docs/QA-REPORT.md` with real numbers.

## 9. Rest of the repo's open work (from `CRITERIA.md`, `docs/BUILD-STATUS.md`, `docs/TEAM-SPLIT.md`, `design/critique-round2.md`, `docs/engineering/BACKLOG.md`)
**In this plan**

| Item | Covered by |
|---|---|
| P5 SSDLC | §1.11 |
| A8, A9 (data-use doc, training opt-in record) | §1.11, §5 privacy classes |
| A12 Stats SA sources | §6, `docs/RESEARCH-SOURCES.md` |
| A6 platform titles/descriptions per language | Assistant `draftTitles`/`draftCaptionPost`, labelled drafts |
| C3 agentic workspace | §5 typed tools |
| C6 provenance | §5b C2PA |
| A1 local-first | Ollama route |
| X2 dictation | Push-to-talk |
| X5 routing | Provider router by role and privacy class |
| D3–D6 and critique "still open" | §3 |
| BUILD-STATUS 2–6 (HTTP tests, unit tests, OTIO validated with the `opentimelineio` Python lib in CI, security pass, screenshots) | §1, §2, §7, §8 |
| X13 hosted DB | Decision note in `docs/DECISIONS.md` (SQLite for the pilot, Postgres path) |
| X16 lanes | CONTRIBUTING |

**Next plan** (Sibusiso's lane first)
- **X1** SA speech accuracy: glossary priming + correction layer + `web/scripts/asr_eval.py` WER harness; Lelapa Vulavula check. Evidence from 22 Nov: "Joseph Stories", "Saw Bonam's ANSI".
- X4 Watch step.
- X6 music.
- X7 effects/graph editing.
- X8 growth agents.
- X10 scenario matrix.
- X11 storefront + payments (Paystack/Yoco/PayFast).
- X14 licence revisions.
- C1/A4 music, animation and education.
- J3 strategy.

**Blocked on access** (team actions)
- J2/C2 translation key: OpenRouter or Meta from §5 unblocks drafts.
- X3 SA dubbing voices.
- A2 Meta key.
- X9 platform apps.
- X12 demo accounts.
- P1–P3 portal updates (Lethabo).

**After the pilot:** creator study, billing sandbox, payouts, desktop packaging, load tests.

## 10. Judging map

| Criterion | What we add |
|---|---|
| Business model (5) | `/pricing` page plus server-enforced tier limits: projects, render minutes, assistant calls/day, team seats per R0/R149/R499/R1499. Shows that BYOK/free models remove inference cost. Numbers from `docs/business/FINANCIALS.md`; no fabricated revenue |
| Submission (5) | Updated deck slides (new logo, Story Room, assistant, consent QR, trust), a 2-minute backup video, refreshed screenshots |
| Cybersecurity (5) | `/trust` page (headers, SBOM, ZAP, CI badges, threat model, data use, provider privacy classes) and the §1 fixes with evidence |
| Innovativeness (10) | Real-waveform 3D world, live consent handshake with C2PA, agentic assistant with privacy routing, data-saver mode |
| Team (10) | PR history, lanes, CODEOWNERS, evidence-gated CRITERIA process explained in the README |

## Critical files
- **Server:** `web/src/server/{http,upload,providers,planner,actions,public,jobs,pipeline,render,audit,migrations,auth}.ts`, new `ratelimit.ts`, `assistant.ts`, `ssrf.ts`, `c2pa.ts`.
- **Routes and config:** `web/src/proxy.ts`, `app/api/{media,upload,providers,plan,assistant}/…`, `next.config.ts`.
- **UI:**
  - `components/{Mark,Strand,CaptionPlayer,MarketMap,NewStory,Splash,CommandPalette}.tsx`;
  - `components/world/*`;
  - `components/studio/{CanvasTab,StudioShell,ProtectTab,PublishTab,LocaliseTab,RightsMap3D,AssistantPanel}.tsx`;
  - `app/{layout,page,pricing,trust}`;
  - the CSS files.
- **Repo:** `.github/**`, `README.md`, `CONTRIBUTING.md`, `SECURITY.md`, `CHANGELOG.md`, `CRITERIA.md`, `docs/**`, `assets/manifest.json`.

## Verification
- **Every PR:** CI green (format, lint, types, unit, build, size-limit, licence gate, handoff scripts, gitleaks, osv). Then a local walkthrough under `next start` in the browser pane at 390×844 and 1440×900.
- **Lane A:**
  - tests prove tenant isolation, origin checks, body limits, rate limits, the SSRF guard (including a rebinding fixture) and HTML-as-mp4 rejection;
  - `curl -I` shows CSP and headers;
  - ZAP baseline has no highs.
- **Lane B:** Lighthouse mobile within budgets; reduced-motion and data-saver runs; real-phone check.
- **Lane C:**
  - assistant Playwright + promptfoo suites pass against the mock;
  - one manual chat each with Sibusiso's OpenRouter free key and Ollama (keys entered on the Run on page only);
  - phone consent over the tunnel updates the studio live;
  - the C2PA manifest checks out with `c2patool`.
- **Lane D:** 60 fps target, adaptive DPR on a mid-range phone; WebGL-off fallback; bundle budgets.
- **Final:**
  - `docs/QA-REPORT.md` and `docs/security/SECURITY-REVIEW-2026-11.md` with real numbers;
  - `CRITERIA.md` updated with real evidence only;
  - `python scripts/verify_handoff.py` passes;
  - tag `v0.9.0-demo`; three rehearsals.
