# IZWI AI: experience, assistant, hardening and repo upgrade (v3)

> **Status:** v3, proposed. v2 was merged with a **go-ahead, with changes** from @LethaboMH14 ([PR #1](https://github.com/LethaboMH14/IZWI.AI/pull/1)). v3 folds in his six changes plus a Judge agent and an Improver agent run on v2 (22 Nov). The open decisions below need answers before the lanes start.
> **Authors:** Sibusiso Khumalo with Claude (Claude Code). **Date:** 22 Nov 2026.

## What changed from v2
- **Mockups first** (Lethabo 1). Mon 08:00–14:00, before lanes B and D write code. Backend lanes A and C don't wait.
- **FFmpeg licence** (Lethabo 2). Corrected and decided, see §Licence policy. `setup.mjs` does not download FFmpeg; it is a separately installed GPL build called as a process.
- **OpenRouter limits sourced** (Lethabo 3). See §5.
- **Fallback only within the creator's privacy class** (Lethabo 4). See §5.
- **Cut order agreed** (Lethabo 5). See §Delivery.
- **X1 statistics** (Lethabo 6). See §9.
- **From the Judge:**
  - a demo-breaking planner bug (Publish before Cut);
  - the tunnel is the riskiest dependency;
  - two people means two tracks;
  - the team-diversity criterion (10 points) was nearly ignored;
  - HMAC instead of a plain hash in C2PA;
  - several stale items (`Mark.tsx` exists, `allowScripts` is in, the `NewStory` label is fine).
- **From the Improver:**
  - the 2D Rights map comes first;
  - an in-browser C2PA check on `/trust`;
  - a hash-chained consent ledger;
  - POPIA redaction;
  - a consent page in four languages;
  - signed build provenance in place of ZAP/Scorecard;
  - wavesurfer trimming in place of cmdk.

## Review record
**Judge scores for v2, as it would have landed:**

| Criterion | Score |
|---|---|
| Innovativeness | 7/10 |
| Diverse team | 4/10 |
| Submission | 3/5 |
| Business model | 3/5 |
| Cybersecurity | 4/5 |

The verdict was **go with changes**. The new §0 (team and submission), the business-model items in §10 and the security additions target the low scores.

**Lethabo's checks:** the cited code lines match `main`, the prices match `AGENTS.md`, and `verify_handoff.py`, `criteria_check.py` and gitleaks pass.

## Open decisions (team, before Mon 08:00)
1. **Tunnel.**
   - Options: Tailscale Funnel, or a *named* Cloudflare tunnel. Quick-tunnel hostnames change on every run, which breaks the passkey `rpID`.
   - Recommendation: a named Cloudflare tunnel, plus a phone-hotspot fallback.
2. **OpenRouter credits.**
   - The free tier is 50 requests a day with fewer than 10 credits ever purchased, and 1,000 a day with at least 10. Three rehearsals plus the demo can use up 50.
   - A $10 top-up is a purchase, so it's the account owner's call.
   - Without it, Ollama becomes the main demo path and OpenRouter the online extra.
3. **FFmpeg encoder.**
   - Recommendation: keep libx264 for this week, recorded as below.
   - Alternative: switch to an LGPL build with OpenH264 (Constrained Baseline: lower quality per bit, playback still universal).
   - Confirm in the PR.
4. **Who takes which track.** Lethabo asked to settle this after the mockups.

## Context
IZWI AI (Next.js 16.4 + React 19.3 app in `IZWI.AI/web`, SQLite, job worker, whisper.cpp, ffmpeg) runs end to end on Sibusiso's laptop. Verified 22 Nov: upload → transcript → clips → consent gate → 9:16 render → hand-off zip.

Team Sonar presents at the NEMISA Discothon on Sun 29 Nov 13:15. Judging: innovativeness 10, diverse team 10, submission 5, business model 5, cybersecurity 5.

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

**User decisions**
- 3D: landing Story Room plus a studio Rights map, with 2D fallback on phones.
- AI: streaming studio assistant whose actions run only after approval.
- Git: branches + PRs to `LethaboMH14/IZWI.AI`. `Sibusiso-K` has push access, not admin; the repo is public.
- CODEOWNERS: `@LethaboMH14`, with a commented placeholder for Sibusiso.

**Repo rules (`AGENTS.md`)**
- Ivory/amber/charcoal; no purple or dark default.
- Keep Naledi; no fabricated metrics.
- Open source where suitable, licences checked.
- Name `CRITERIA.md` IDs per change; `done` only with real evidence paths.
- `scripts/verify_handoff.py` must keep passing.

## Licence policy
**npm dependencies that ship**
- Allowed: MIT, Apache-2.0, BSD, ISC, OFL.
- LGPL is allowed only for dynamically linked prebuilt binaries. Example: `sharp`'s libvips is "Apache-2.0 AND LGPL-3.0-or-later" and is already a dependency.
- MPL-2.0 is allowed for dev-only tools (axe-core).

**Not shipped:** GPL/AGPL/non-commercial/source-available npm code, specifically:
- ffmpeg.wasm core (GPL);
- the Theatre.js studio (AGPL);
- Remotion (source-available);
- GSAP (not OSI);
- mediabunny (avoid).

**Separate-process tools.** These aren't npm packages, so the CI licence gate can't see them. They are recorded by hand in the §6 licence table.

| Tool | Licence | Use |
|---|---|---|
| FFmpeg | GPL build (gyan.dev `full_build`, `--enable-gpl`) | Installed separately (winget/apt/brew) and found on `PATH` (`env.ts:13`); `setup.mjs` does not download it. Encodes with `libx264` in `render.ts:51`, `media.ts:92` and `make-test-media.ps1:42` |
| whisper.cpp | MIT | Downloaded by setup |
| espeak-ng | GPL | CI-only, for test media |

**FFmpeg decision for this week**
- We run FFmpeg as a separate process on our own machine/server and don't redistribute it, so we have no distribution obligation.
- Record `ffmpeg -buildconf` in `docs/DECISIONS.md`.
- Fix the false claim in `lib/platform.ts:69` ("LGPL baseline").
- **Trigger to revisit:** any build we hand out (desktop packaging, a Docker image). For that, the option is BtbN's `lgpl` build with `libopenh264` (BSD-2). Note that Cisco's patent cover applies only to Cisco's own binary. Spike: `ffmpeg -encoders | findstr openh264`, then check the 9:16 preset plays on iPhone and WhatsApp.

**Enforcement:** a CI licence gate (`license-checker-rseidelsohn`) on production npm dependencies, with the LGPL exception above as an explicit allowlist.

## The demo (about 6 minutes)
1. Splash → interactive Story Room: a voice strand built from a real episode's waveform, with five pillar stations.
2. Passkey sign-in on the tunnel hostname → seeded project (`npm run seed:demo`, reset between runs).
3. Typed prompt (push-to-talk if it passes Wednesday's check): "three TikTok clips and isiZulu draft captions".
   - The assistant streams a plan with reasons, and the UI shows which provider answered.
   - Approve → jobs run.
   - This needs the §2 planner fix.
4. A prompt injection planted in the transcript is badged, and no proposal comes from it.
5. A QR code appears. A judge opens the consent page on their own phone, in isiZulu, and consents. The held clip turns moss in the Rights map (2D; 3D only if it passes Wednesday's check), and the render starts.
6. The render carries Content Credentials (C2PA, test certificate) holding an HMAC commitment to the consent-ledger entry. The judge drops the MP4 on `/trust` and sees it verified in the browser. Download the hand-off zip. Same screen at phone width.
7. `/pricing`:
   - the Free tier's limits are enforced, and a live meter shows the user's own usage;
   - the other tiers are labelled as planned;
   - BYOK and free/local models mean no inference cost to IZWI;
   - the measured cost per render-minute is shown.
8. `/trust`:
   - CI badges, signed build attestation and SBOM;
   - one-off Lighthouse/axe numbers;
   - consent-ledger head, threat model, OWASP (web + LLM Top 10) mapping, data use.

**Offline path (separate script):** Ollama plus a pre-consented clip. Steps 3 and 5 need the internet otherwise.

## Delivery
**Sun 22 (tonight): PR 1 `chore/foundation-ci`**
- Branch fresh from `main`, not from `docs/plan-v3`.
- Commit this session's local fixes first:
  - the welcome workspace name;
  - `lineFlag`;
  - the `allowScripts` entry already in `package.json`.
- Then a Prettier baseline commit, recorded in `.git-blame-ignore-revs`.
- Add `.prettierrc`, `.editorconfig`, `.nvmrc`, and `!.env.example` in `web/.gitignore`.
- CI v1: `npm ci` (lockfile check), format, lint, types, Vitest, build, handoff scripts, gitleaks, osv-scanner. Actions pinned by SHA.
- Lethabo turns on branch protection once this is on `main`.

**Mon 23, 08:00–14:00: mockups** (both of us; Lethabo signs off at 15:00)
- Wireframe each screen in Excalidraw (MIT) for about 20 minutes. Then build the screens as dev-only routes under `web/src/app/design/mockups/*`, so the code is the real component's starting point.
- Capture them at 390×844 and 1440×900 with `design/shoot.sh` into `design/mockups/`. Ivory/amber palette; held, ready and error states.
- Screens:
  1. 3D Story Room (desktop) and its 2D phone fallback;
  2. Rights map (2D, with a 3D sketch);
  3. landing with splash;
  4. studio with the assistant panel;
  5. consent on a phone via QR;
  6. `/pricing` (wireframe);
  7. `/trust` (wireframe).
- Also Monday: portal progress updates (P1/P2/P6) and a team-slide draft (§0).

**Mon 23 to Thu 26: two tracks, four lanes**
- Each lane gets its own branch, owns its files and opens its own PR. They rebase on main daily.

| Track | Lane | Branch | Covers | Starts |
|---|---|---|---|---|
| Backend | A | `sec/hardening-review` | §1, §2 backend, §7 security CI, §8 security tests | Mon morning |
| Backend | C | `feat/studio-assistant` | §5, §5b | Mon morning |
| UI | B | `feat/brand-motion-responsive` | §3, §2 frontend, `/pricing` and `/trust` | Mon 15:00, after sign-off |
| UI | D | `feat/3d-world` | §6 research (first), §4 | Mon 15:00, after sign-off |

**Mon 23 noon spikes (go/no-go)**
1. `@contentauth/c2pa-node` on Windows (it uses prebuilt native binaries). If it fails, use a signed JSON sidecar.
2. R3F at 60 fps on Sibusiso's phone, then on a second, cheaper phone on Tue.
3. Free-model JSON/tool reliability on OpenRouter, plus `qwen3:4b` tool calling on Ollama.
4. Tunnel up on a fixed hostname, a passkey made on that hostname, and the consent page loads on a phone over mobile data.
5. ProtectAI injection classifier (ONNX) loads in transformers.js under Node.

**Cut order** (agreed with Lethabo; checkpoint Wed 12:00)
- **Protect:** §1 security fixes, the assistant with approval, the consent QR, logo/splash. Also the §2 planner fix.
- **Cut first if Wednesday slips, in order:**
  1. RightsMap3D (the 2D map is already the default);
  2. the Lighthouse/ZAP/Scorecard workflows (already replaced by one-off runs and attestation);
  3. cmdk/shortcuts (already cut);
  4. the data-saver KB footer.
- **Cut after that, in order:** the cross-browser e2e matrix → the Linux whisper build in CI → the rest of data-saver → C2PA (signed JSON sidecar instead).

**Fixed dates**
- Tue 24: one real-phone check (consent page + Story Room fallback).
- Thu 26 18:00: feature freeze. Kill switches `IZWI_FLAG_3D` and `IZWI_FLAG_ASSISTANT` stay in. Record the 2-minute backup video from the freeze build that night.
- Fri 27: real Android + iPhone pass; QA and security reports with real numbers; deck.
- Sat 28: three rehearsals from tag `v0.9.0-demo` under `next start`, plus one run of the offline path.
- Sun 29: no merges.

---

## 0. Team and submission (new; targets the 10-point team criterion and submission)
- **Team slide:**
  - disciplines and the languages we speak;
  - an honest split of what humans did and what AI agents did (lanes, PR review, evidence gate).
  - Diversity shows in who we are and how we decided, not just in the PR count.
- **Creators:** test with 3 real creators from different niches (X10/X15). Quote them with permission, only what they actually said.
- **Mentor feedback (P3):** ask on Monday and record the outcome.
- **Portal:** progress updates on Mon and Wed (P1/P2/P6); fill in the tech sections.
- **Deck:** new logo, Story Room, assistant, consent QR, `/trust`. Backup video recorded Thu night.

## 1. Security review fixes (Lane A)
Paths are under `web/src`.

1. **Upload MIME XSS.**
   - `server/upload.ts:51` ORs the MIME check with the extension check; line 59 keeps the client's extension on disk; line 66 stores the client's MIME type. `api/media/[id]/route.ts:30` serves the file inline with that type.
   - Fix: derive the type server-side from an extension allowlist plus magic bytes / ffprobe, and store a server-chosen extension.
   - Serve only `video/*`, `audio/*` or `image/jpeg|png`, with `nosniff`, `CSP: sandbox`, `CORP: same-origin`. These headers are set in the route handler, because `/api/media` doesn't go through the proxy.
2. **Headers + CSP.**
   - Pages: `src/proxy.ts`, with the matcher excluding `api|_next/static|_next/image|favicon` and prefetches (the proxy buffers bodies, and tus sends 8 MB chunks).
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
   - `/trust` only: `'wasm-unsafe-eval'` for the self-hosted `c2pa.wasm`.
   - API headers go in `next.config.ts` `headers()`.
   - Ship Report-Only Mon/Tue, and **enforce by Wed 12:00**. If it isn't enforced by then, `/trust` says Report-Only.
   - Also HSTS (prod), Referrer-Policy, Permissions-Policy (`microphone=(self)`), COOP, and cookie flags checked (`Secure`, `HttpOnly`, `SameSite`).
3. **CSRF.** `server/http.ts:33` lets a missing `Origin` through. Require `Origin` or `Sec-Fetch-Site: same-origin` on mutations, including the tus route.
4. **Input and resource limits.**
   - Cap JSON bodies in `http.ts` `body()` (64 KB default).
   - Cap uploads below the 4 GB default.
   - Run ffprobe/ffmpeg with a timeout and a duration limit, so malformed or huge media can't pin the worker.
5. **Rate limits.**
   - `rate-limiter-flexible` (ISC) with a SQLite store on: public routes (GET too), `/api/plan`, `/api/assistant`, provider tests, uploads, consent answers and listing enquiries (spam).
   - Set better-auth `rateLimit.storage: "database"`.
   - Client IP comes from `x-forwarded-for` only with `IZWI_TRUST_PROXY=1`.
   - Watch SQLite write contention with the worker (WAL mode, short transactions).
6. **SSRF.**
   - Every outbound provider fetch goes through one guarded `fetch`: `checkBaseUrl` and `chatJSON` (`server/providers.ts:30-62`), `madlad` (81), the `testProvider` GET (104) and `transcribeEndpoint` (150).
   - The guard checks at connect time, using an undici `Agent` `connect.lookup` plus `ipaddr.js` (MIT) range checks: private, loopback, link-local, 100.64/10, fc00::/7, fe80::/10, IPv4-mapped, 0/8.
   - It applies when `IZWI_HOSTED=1`; local Ollama stays allowed.
   - `redirect: "manual"` everywhere.
   - Fixed error messages; no upstream body is echoed.
   - Provider tests and edits are owner/admin only.
7. **Public links.**
   - Consent links honour `LIMITS.linkDays` (14, `env.ts:24`) instead of the hard-coded 30 days in `actions.ts:211`.
   - `assetAllowedForToken` checks the link's purpose.
   - Review links can't approve all; each approval records the reviewer and line.
8. **Tenant isolation.**
   - Workspace-scoped idempotency (migration 2).
   - `runStep` returns `publicJob`.
   - Worker lookups check `workspace_id` (`server/pipeline.ts:25-26`).
9. **Secrets.**
   - Keys are decrypted only inside the request.
   - Provider errors are sanitised (`api/plan/route.ts:30`).
   - pino `redact` for keys and auth headers.
   - Document `IZWI_MASTER_KEY` rotation (re-seal provider keys).
   - gitleaks config; `.env.example` files match the env vars the code reads.
10. **Audit and consent ledger.**
    - Log provider changes, line approvals, project updates, deletes and assistant proposals.
    - Owner-only `GET /api/workspace/audit`, plus a list on the Team page.
    - An "AI activity" view built from `usage_event`.
    - **Consent ledger:**
      - each consent answer is appended as `{prev_hash, sha256(record), ts}` and signed with Ed25519 via `node:crypto` (no new dependency);
      - `scripts/verify-ledger.ts` checks the chain;
      - `/trust` shows the chain head.
11. **Tunnel exposure.** The tunnel forwards only these paths; everything else returns 404 at the tunnel:
    - `/c/*`;
    - `/api/public/consent/*`;
    - token-gated `/api/media`;
    - the auth routes needed to sign in on the tunnel hostname.
12. **Deliverables** (also P5, A8, A9):
    - `SECURITY.md`;
    - `docs/business/SSDLC.md`;
    - `docs/security/THREAT-MODEL.md` (STRIDE per trust boundary, plus OWASP LLM01/02/06/10);
    - `docs/security/SECURITY-REVIEW-2026-11.md`;
    - `docs/DATA-USE.md` (training opt-in, provider privacy classes, POPIA redaction).

## 2. Code review: correctness bugs (Lane A; frontend items [B])
**Scope.** The review covers all of these:
- `server/`, `worker/`, the public routes, `ConsentClient`/`ReviewClient`;
- `auth.ts` (better-auth's default in-memory rate-limit store), `crypto.ts`, `migrations.ts` and `scripts/`.

**Backend**
- **Demo blocker, fix first:** `planner.ts:129-132` Publish.
  - The problem: Publish reads `kept` clips when the plan is approved, before the Cut job has run, and its renders depend on `hear`, not Cut. On a fresh project, "three TikTok clips" renders nothing.
  - The fix: Publish enqueues a fan-out job that depends on Cut and creates the outputs once clips exist.
  - A test covers Hear → Cut → Publish on an empty project.
- `planner.ts:104-143`: approve in one transaction; handle a missing source (line 117 `!`).
- `render.ts:15` `isPreset`: `Object.hasOwn`.
- `jobs.ts:44-59`: `complete`, `fail` and `succeed` only with a matching `worker_id`; re-check cancel in the same transaction.
- `actions.ts`:
  - escape the `LIKE` (158);
  - `resolveComment` returns 404 on no match (247);
  - re-queue only the affected outputs (110/188/219, `public.ts:115`).
- Delete races: soft-delete → cancel jobs → worker removes files. Upload completion re-checks that the project exists.
- Providers:
  - `model` required;
  - reject query strings in base URLs;
  - retry without `response_format` on a 400;
  - remove or wire the dead `clips`/`asr` roles.
- Run `knip` (ISC) to find dead code and dependencies.

**Frontend [B]**
- `CaptionPlayer.tsx:13`: hydration mismatch.
- `Strand.tsx`: redraw after resize under reduced motion.
- `?new=1` vs `mode=create`.
- Dead `/app/episode-04` links.
- `/design` dev-only (the mockup routes live under it).
- Accessibility:
  - tabs need aria-controls, panels and arrow keys, with no hover-switching;
  - MarketMap points need Space and visible focus;
  - low-contrast tokens.
  - (The `NewStory.tsx:81` label item is dropped; it is already wrapped in a `<label>`.)
- `engine/page.tsx:340`: add an unmount guard.
- **Live consent:** add pending consent requests to the `useLive` `busy` check (`StudioShell.tsx:90`), so polling is fast while consent is pending. It's a one-line change. SSE is optional and must be tested through the tunnel, because proxies may buffer it.

**Tests:** Vitest for:
- crypto, the rights gate, jobs claim/lease/race;
- the planner fan-out, the SSRF guard, the rate limiter;
- idempotency scoping, `lineFlag`, consent scope and ledger verification.

Plus HTTP two-tenant isolation tests.

## 3. Brand, opening screen, transitions, responsive (Lane B)
**Logo**
- Redesign the existing `components/Mark.tsx` (7 bars today) into seven amber voice bars rising into an open speech ring (izwi = voice). Wordmark in Fraunces.
- Tested at 16, 32, 180 and 512 px and in monochrome.
- Files:
  - `app/icon.svg`, `apple-icon.tsx`, `manifest.ts` (installable; no service worker), `opengraph-image.tsx`;
  - a brand SVG in `assets/current/brand/` and `assets/manifest.json`.
- An animated variant draws the bars in.

**Opening screen**
- `components/Splash.tsx`: server-rendered CSS, at most about 900 ms. It never waits on 3D.
- Shown once per session using a cookie. Skippable. Instant under reduced motion. Never shown on `/c`, `/r`, `/l`.
- Branded `loading.tsx` skeletons, plus the missing `error.tsx` and `not-found.tsx`.

**Transitions**
- React 19.3 `<ViewTransition>` directly; the `experimental.viewTransition` flag was removed in Next 16.3.
- Route cross-fade and a studio stage slide. Card → header morph only if the header is in the server shell.
- `motion` (MIT, already a dependency) via `LazyMotion` + `m` for panels, plan cards, toasts and the assistant panel.
- Reduced motion disables all of it.

**Phone + PC**
- `viewport` export (`viewport-fit=cover`, `themeColor`).
- Landing sheet menu below 860 px.
- Safe-area insets.
- Studio title wraps; stage-rail scroll cue; Protect status not truncated (D3).
- Collapsible phone composer (D4).
- Transcript: independent scroll and sticky player (D5).
- Listing order (D6).
- 44 px touch targets.
- `next/image` for public images.
- Critique fixes:
  - the Run on storage label;
  - a name is needed to decline too;
  - "New render settings" vs "Existing render".

**Data-saver mode** (South Africa specific)
- Honour `Save-Data` and `navigator.connection`.
- 3D only on Wi-Fi or opt-in.
- Light previews by default.
- A "this page cost ~N KB" footer (last in the cut order).

**Productivity**
- wavesurfer.js + Regions (BSD-3) for clip trimming over the existing waveform peaks. The assistant's `trimClip` proposal shows as a before/after region diff.
- Toasts; optimistic keep/drop/approve; a "Saved" indicator.
- (cmdk and editor shortcuts are cut.)

**Pages:** `/pricing` (§10) and `/trust` (demo step 8), built from the signed-off wireframes.

## 4. Interactive 3D (Lane D, after the §6 research)
**Stack** (MIT, except n8ao, which is ISC)
- `@react-three/fiber@9.8` (peers React <19.4; Dependabot ignores react minors);
- `@react-three/drei@10.7`;
- `@react-three/postprocessing` (SMAA + subtle `n8ao`; no bloom on ivory);
- `maath`, `@react-spring/three`;
- `detect-gpu` (benchmarks self-hosted);
- `leva` (dev only).

**Constraints**
- Check the peer ranges against the existing `three@^0.187` (used by `Strand.tsx:4`) before installing.
- Avoid drei `<Text>`.
- Self-host every asset (HDRIs, Draco), so there are no CDN fetches, `connect-src 'self'` holds, and it works offline.
- Scenes load with `next/dynamic({ ssr:false })` after idle, behind `IZWI_FLAG_3D`.

**Landing Story Room** (`components/world/StoryRoom.tsx`)
- A light "paper studio" scene. The voice strand at the centre is built from a real episode's waveform peaks (an existing worker output), with mic reactivity opt-in.
- Five pillar stations on a ring. Drag, scroll or tap orbits to a station, which opens an accessible DOM card. Stations double as keyboard buttons; the canvas is `aria-hidden`.
- Performance and fallbacks:
  - `PerformanceMonitor` adaptive DPR `[1,2]`, one step down on phones;
  - `frameloop="demand"` when idle; pause offscreen;
  - handle WebGL context loss on iOS;
  - static art and 2D cards when there is no WebGL, a low tier, data saver or reduced motion.

**Rights map**
- **First:** a 2D SVG map with `motion` (`components/studio/RightsMap.tsx`). The episode, the clips on a timeline arc, people as consent nodes, and outputs.
- Colours: held = clay, ready = moss, draft = gold.
- Held clips pulse to moss when consent arrives. It shares selection with `StoryGraph`.
- `RightsMap3D.tsx` only if the Story Room hits 60 fps by Wed 12:00. It is first in the cut order.

**Budgets** (`size-limit` in CI): landing first-load JS ≤ 200 KB gzip; 3D chunk ≤ 350 KB gzip.

## 5. Studio assistant (Lane C)
**Stack**
- `ai` 7.x + `@ai-sdk/react` (Apache-2.0).
- `@openrouter/ai-sdk-provider` (Apache-2.0).
- `@assistant-ui/react` (MIT).
- All provider HTTP goes through the §1.6 guarded `fetch`.
- A zod JSON-proposal fallback for models with weak tool calling.

**Providers** (`server/providers.ts`, engine page)

| Provider | Setup | Privacy class |
|---|---|---|
| OpenRouter | See below | **May log** |
| Meta | Optional. `https://api.meta.ai/v1`, Standard mode only (Contributor mode trains on content; `docs/research/open-source-map.md` F1/F2). Not free. Not in any default chain until the A2 key arrives; URL re-verified at build | Standard |
| Ollama (MIT) | Local `qwen3:4b` (Apache-2.0, tool calling). Llama models are listed only as "Llama community licence, not OSI" | **Private** |

**OpenRouter setup**
- Base URL `https://openrouter.ai/api/v1`, with `HTTP-Referer`/`X-Title` headers.
- Free models from live `GET /models` filtered to `:free`. These include `meta-llama/*:free`, which is **the only free Meta path**.
- Pin two model IDs on Wednesday.
- Free-tier limits, per [OpenRouter's limits page](https://openrouter.ai/docs/api-reference/limits): "If you're using a free model variant (with an ID ending in `:free`), the following limits apply". The table there shows:
  - 20 requests a minute in both tiers;
  - 50 requests a day with fewer than 10 credits ever purchased;
  - 1,000 requests a day with at least 10.
- Read the remaining daily quota from `GET /api/v1/key` (`free_model_daily_requests`).
- On a 429 (`X-RateLimit-*` headers, sometimes `Retry-After`): back off, then rotate to the other pinned `:free` model, then show a friendly message.
- Some free endpoints require allowing training/logging in the OpenRouter account settings. Check this against `DATA-USE.md`.

**Privacy rules for OpenRouter (may log)**
- Excerpts are redacted before sending:
  - phone numbers via libphonenumber-js (MIT) `findPhoneNumbersInText(text, 'ZA')`;
  - SA ID numbers (13 digits with the Luhn check);
  - emails and names on the consent list.
- A chip shows "N items redacted".
- Consent records are never sent.

**Fallback rule** (replaces "OpenRouter → Meta → Ollama")
- Fallback happens only within the privacy class the creator chose:
  - **May log:** rotate the pinned `:free` models.
  - **Standard:** Meta only.
  - **Private:** Ollama only.
- A Wi-Fi drop or 429 never silently moves to another class. The UI offers "Switch to Private (local)" or "Switch to OpenRouter (may log)", and the creator approves.
- Every reply shows which provider and model answered.
- New `chat` role. Keys stay sealed by `server/crypto.ts`.

**Route** `POST /api/assistant` (SSE, `force-dynamic`, `Cache-Control: no-store, no-transform`, tested under `next start` and through the tunnel)
- Body (zod):
  - ≤ 20 turns, each ≤ 2,000 characters, ≤ 12,000 characters in total;
  - roles user/assistant only.
- Rate limit 10/min and 100/day per user per workspace. Daily token cap in `usage_event`. 30 s timeout; abort on disconnect.
- Context (`server/assistant.ts`):
  - project facts plus a transcript excerpt (≤ 4 K characters) in a delimited untrusted-data block, and a canary token in the system prompt;
  - before the context is built, transcript lines pass the ProtectAI `deberta-v3-base-prompt-injection-v2` classifier (Apache-2.0, ONNX self-hosted, via transformers.js, Apache-2.0);
  - flagged lines are badged and excluded;
  - `/trust` states that the classifier is archived and English-only. Delimiters and the canary remain the main defence.
- Typed tools, all non-destructive and all proposals:
  - `keepClip`, `dropClip`, `trimClip`, `addGlossaryTerm`, `requestConsent`, `draftTitles`, `draftCaptionPost`, `runStep(transcribe|translate|render|package)`.
  - Each shows a diff preview and its source.
  - Approve goes through `plan_run` → `/api/plan/[id]`.
- Output: plain text plus an escaped markdown subset. No images; links as plain text. `img-src 'self'` as a backstop.
- Threads persist per project (`assistant_message`, workspace-scoped, 30-day retention).
- Push-to-talk (optional; the typed prompt comes first): MediaRecorder → whisper.cpp, labelled en/af.

**UI:** a slide-over panel (a bottom sheet on phone) with suggested prompts per stage.

**Tests** (mock server `web/e2e/mock-llm.mjs`; CI uses only the mock)
- streaming renders;
- an injection yields no content-derived proposal, and the classifier badges it;
- a harmful proposal needs approval and shows a diff;
- markdown-image exfiltration is blocked;
- no canary leaks;
- redaction is applied before a may-log provider;
- there's no cross-class fallback without approval;
- 429, 413 and 400 responses;
- the key never appears in any response, HTML or log;
- one promptfoo (MIT) red-team run saved as evidence.

## 5b. Live consent handshake + Content Credentials (Lane C)
**Consent handshake**
- "Show QR" next to a consent request (`uqr`, MIT, SVG).
- The guest page is served over the fixed tunnel hostname, with `IZWI_PUBLIC_URL` and the passkey `rpID` set from it and `IZWI_TRUST_PROXY=1`.
- The laptop signs in on the tunnel hostname too, so passkeys match.
- Consent page in **en / zu / st / af**:
  - strings written by the team, only in languages one of us can check;
  - labelled "written by Team Sonar";
  - no machine-translation claims.
- The studio sees the answer fast (§2 live consent), and the Rights map updates.
- Load check: 5 phones scanning at once (judges).

**C2PA**
- The render job signs each MP4 with `@contentauth/c2pa-node` (MIT; c2patool as fallback).
- Assertions:
  - the creator declaration;
  - an AI-use assertion;
  - an **HMAC (server secret) of the consent-ledger entry**. A plain hash of a short record with a name could be brute-forced from a public manifest.
- Labelled honestly as a test certificate.
- Verified in the browser on `/trust` with `@contentauth/c2pa-web` (MIT, self-hosted wasm).
- Moves C6 provenance toward done.
- If Monday's spike fails: a signed JSON sidecar.

## 6. Research deliverable (Lane D, Mon afternoon, before 3D code): `docs/research/experience-research.md`
**Sources**
- R3F/drei performance docs.
- Open R3F audio visualizers (`r3f-equalizer`, poeti8's `unknown-pleasures`/`bolandgoo`, the three.js-forum Audio-Reactive Visualizer).
- OpenCut (MIT, classic branch), Omniclip, designcombo `react-video-editor`.
- React `<ViewTransition>`.
- C2PA / Content Credentials.
- OpenRouter limits and privacy (above); Meta API modes.

**UX evidence**
- WCAG 2.2 AA.
- Core Web Vitals including INP.
- NN/g response-time limits.
- South African data costs and connectivity (Stats SA, A12).

**Licence table:** every adopted and rejected dependency, plus the separate-process tools (FFmpeg build config, whisper.cpp, espeak-ng), each with its reason.

## 7. Senior-grade GitHub repo (PR 1, then whichever lane frees up)
**Docs**
- `README.md` rewrite:
  - pitch and Mermaid architecture;
  - setup for Windows (Build Tools + `allowScripts`, FFmpeg via winget), macOS and Linux;
  - scripts, repo map, the evidence-gated `CRITERIA.md` process, status.
  - Update `web/README.md`.
- `CONTRIBUTING.md`:
  - branches `feat/`, `fix/`, `chore/`, `docs/`, `sec/`;
  - Conventional Commits with a semantic PR-title check;
  - PR checklist (criteria IDs, tests, screenshots);
  - lanes and tracks;
  - flaky-test policy (quarantine with an issue, fix within a day).
- `CODE_OF_CONDUCT.md`, `SECURITY.md`.
- `CHANGELOG.md` (Keep a Changelog). Release tags `v0.x`.

**`.github/`**
- `CODEOWNERS`; labels.
- Issue forms (bug, feature, design critique) and `config.yml` pointing to `SECURITY.md`.
- `PULL_REQUEST_TEMPLATE.md`.
- `dependabot.yml`: npm `/web` weekly and grouped, ignoring react/react-dom minors; plus github-actions. Lethabo enables Dependabot security updates (admin).

**Workflows** (actions pinned by SHA; `zizmor` lints them)
- `ci.yml` (required):
  - `npm ci`, format, ESLint, types, Vitest with a coverage threshold, build, `size-limit`;
  - `verify_handoff.py` + `financial_model.py`;
  - the licence gate (with the LGPL binary allowlist);
  - semantic PR title.
- `e2e.yml`:
  - Chrome channel smoke + axe, and Pixel 7 emulation, required.
  - The full `@slow` pipeline is nightly/manual and not required, because bundled Chromium lacks H.264/AAC.
  - The Linux whisper.cpp build in it uses **the same commit SHA as the Windows `b5454` pin**, cached.
  - Firefox/WebKit/iPhone emulation are cut; a real iPhone is checked on Fri.
- `security.yml` (PRs + weekly):
  - `npm audit --omit=dev`, osv-scanner, gitleaks;
  - Semgrep (`p/typescript`, `p/nextjs`, `p/owasp-top-ten`);
  - CodeQL;
  - CycloneDX SBOM as an artifact;
  - on tags, `actions/attest-build-provenance` (MIT) attests the build and the SBOM.
  - `/trust` shows `gh attestation verify` output.
- **Cut:** `lighthouse.yml`, ZAP and Scorecard. Lighthouse and axe run once locally on Fri, and the real numbers go on `/trust`.

**Observability:** pino with request IDs and `redact`.

## 8. QA
**Playwright** (`web/e2e/`; `webServer` = `next start` + worker on a scratch `IZWI_STORAGE_DIR` + mock LLM; seed reset before each run)
- Auth, including passkey where supported and the rate limit.
- Onboarding regression: the workspace name.
- Hear → Cut → Publish on a fresh project (the planner fix).
- Full pipeline via `setInputFiles`.
- Consent through the QR/public link, in all four languages.
- Review link, listing enquiry, provider add/test, and the §5 assistant suite.
- Two-tenant isolation; CSP and headers present; revoked links fail; the tunnel allowlist.
- The landing works with WebGL disabled and under reduced motion.

**Accessibility:** `@axe-core/playwright` (dev only) on every route, desktop and mobile; serious/critical findings fail.

**Performance:** one Lighthouse mobile run on Fri, recorded; budgets LCP < 2.5 s, TBT < 300 ms, CLS < 0.1, a11y ≥ 95.

**Cross-browser:** Chrome + Pixel 7 in CI; a real phone on Tue; real Android + iPhone on Fri.

**Load:** 5 concurrent consent-page loads and answers over the tunnel.

**Screenshots:** Playwright regenerates `design/mockups/` (BUILD-STATUS 6).

**Report:** `docs/QA-REPORT.md` with real numbers.

## 9. Rest of the repo's open work
Sources: `CRITERIA.md`, `docs/BUILD-STATUS.md`, `docs/TEAM-SPLIT.md`, `design/critique-round2.md`, `docs/engineering/BACKLOG.md`.

**In this plan**

| Item | Covered by |
|---|---|
| P1/P2/P3/P6 portal and mentor | §0 |
| P5 SSDLC | §1.12 |
| A8, A9 | §1.12, §5 privacy classes |
| A12 Stats SA sources | §6 |
| A6 titles/descriptions per language | `draftTitles`/`draftCaptionPost`, labelled drafts |
| C3 agentic workspace | §5 |
| C6 provenance | §5b |
| A1 local-first | Ollama, the Private class |
| X2 dictation | Push-to-talk (optional) |
| X5 routing | Router by role and privacy class |
| X10/X15 creators | §0 (3 creators) |
| D3–D6, critique "still open" | §3 |
| BUILD-STATUS 2–6 | §1, §2, §7, §8 |
| X13 hosted DB | Decision note in `docs/DECISIONS.md` (SQLite for the pilot) |
| X16 lanes | CONTRIBUTING |
| FFmpeg licence decision | `docs/DECISIONS.md` (§Licence policy) |

**Next plan** (Sibusiso's lane first)
- **X1** SA speech accuracy: glossary priming + a correction layer + the `web/scripts/asr_eval.py` WER harness; Lelapa Vulavula check. Evidence from 22 Nov: "Joseph Stories", "Saw Bonam's ANSI".
  - Systems are scored on the same clips, so Mann-Whitney is invalid. Instead:
    - aggregate WER per file;
    - a paired permutation test that swaps system labels within speaker/episode groups;
    - a speaker-clustered paired bootstrap CI for the WER difference;
    - Holm correction across languages.
  - See `docs/research/research-review-round1.md`.
  - `docs/TEAM-SPLIT.md` still prescribes Mann-Whitney and gets corrected with X1.
- X4 Watch step.
- X6 music.
- X7 effects/graph editing.
- X8 growth agents.
- X11 storefront + payments (Paystack/Yoco sandbox, labelled planned).
- X14 licence revisions.
- C1/A4.
- J3.

**Blocked on access**
- J2/C2 translation key (unblocked by OpenRouter `:free` drafts, labelled).
- X3 SA dubbing voices.
- A2 Meta key.
- X9 platform apps.
- X12 demo accounts.

**After the pilot:**
- creator study;
- billing sandbox;
- payouts;
- desktop packaging (this triggers the LGPL FFmpeg switch);
- load tests.

## 10. Judging map

| Criterion | What we add |
|---|---|
| Innovativeness (10) | Consent-gated render with an in-browser C2PA check, plus a multilingual phone consent page and a hash-chained consent ledger. Agentic assistant with approval and privacy-class routing. Real-waveform 3D Story Room. Data-saver mode |
| Diverse team (10) | §0: team slide (disciplines, languages, honest human/agent split), 3 creators quoted, mentor feedback, plus lanes/PR history/CODEOWNERS and the evidence-gated CRITERIA process |
| Submission (5) | Portal updates Mon/Wed, updated deck, backup video Thu night, refreshed screenshots |
| Business model (5) | `/pricing`: Free tier enforced from a config table, other tiers labelled planned, a live usage meter from `usage_event`, measured cost per render-minute. BYOK/free/local models remove inference cost. Numbers from `docs/business/FINANCIALS.md` labelled as assumptions; no fabricated revenue |
| Cybersecurity (5) | `/trust`: headers/CSP status, SBOM + signed attestation, consent-ledger head, threat model with OWASP web + LLM Top 10 mapping, data use, POPIA redaction, injection classifier, live injection demo, tunnel allowlist, plus the §1 fixes with evidence |

## Critical files
- **Server:**
  - `web/src/server/{http,upload,providers,planner,actions,public,jobs,pipeline,render,media,audit,migrations,auth,env}.ts`;
  - new `ratelimit.ts`, `assistant.ts`, `ssrf.ts`, `c2pa.ts`, `ledger.ts`, `redact.ts`;
  - `web/src/worker/*`;
  - `lib/platform.ts`.
- **Routes and config:** `web/src/proxy.ts`, `app/api/{media,upload,providers,plan,assistant,public}/…`, `next.config.ts`.
- **UI:**
  - `components/{Mark,Strand,CaptionPlayer,MarketMap,Splash}.tsx`;
  - `components/world/*`;
  - `components/studio/{StudioShell,ProtectTab,PublishTab,LocaliseTab,RightsMap,RightsMap3D,AssistantPanel}.tsx`;
  - `app/{layout,page,pricing,trust,design/mockups}`;
  - the CSS files.
- **Repo:** `.github/**`, `README.md`, `CONTRIBUTING.md`, `SECURITY.md`, `CHANGELOG.md`, `CRITERIA.md`, `docs/**`, `design/mockups/`, `assets/manifest.json`.

## Verification
- **Every PR:** `ci.yml` green, then a local walkthrough under `next start` at 390×844 and 1440×900.
- **Mockups:** 7 screens at both widths in `design/mockups/`; Lethabo's sign-off recorded in the PR.
- **Lane A:**
  - tests prove tenant isolation, origin checks, body/resource limits, rate limits, the SSRF guard (including a rebinding fixture), HTML-as-mp4 rejection and the planner fan-out;
  - `curl -I` shows CSP and headers;
  - `verify-ledger` passes;
  - the tunnel 404s outside the allowlist.
- **Lane B:** one Lighthouse mobile run recorded; reduced-motion and data-saver runs; real-phone check.
- **Lane C:**
  - assistant Playwright + the promptfoo run pass against the mock;
  - one manual chat each with Sibusiso's OpenRouter free key and Ollama (keys entered only on the Run on page);
  - phone consent over the tunnel updates the studio within 2 s;
  - the C2PA manifest checks out with `c2patool` and on `/trust`.
- **Lane D:** 60 fps target, adaptive DPR on a mid-range phone; WebGL-off fallback; bundle budgets.
- **Final:**
  - `docs/QA-REPORT.md` and `docs/security/SECURITY-REVIEW-2026-11.md` with real numbers;
  - `CRITERIA.md` with real evidence only;
  - `python scripts/verify_handoff.py` passes;
  - tag `v0.9.0-demo` with attestation;
  - three rehearsals plus the offline path.
