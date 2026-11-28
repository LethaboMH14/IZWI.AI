# Criteria: what IZWI AI promises, and the evidence for each

Read this file before any work. Every task names the rows it works toward. A row may move to `done` only with evidence: a path in backticks that exists in this repo (a file, test, screenshot or report). `python3 scripts/criteria_check.py` enforces this. It also runs inside `scripts/verify_handoff.py`.

**Statuses:**
- `done`: works, with evidence.
- `partial`: some of it works; the gap is named.
- `planned`: not built yet.
- `limited by access`: needs a key, an account or an approval we don't have yet.

Never mark a claim `done` because it is designed, mocked or simulated.

Source: the team's hackathon profile (team Sonar, project Izwi.AI, challenge "Creative Industries and AI-Powered Content Creation"), pasted by the team on 20 Nov 2026, plus the build asks agreed in the same session. Claims are quoted in short spans.

## Portal

| ID | Claim | Status | Evidence | Gap / next step | Owner |
|---|---|---|---|---|---|
| P1 | "Technology Readiness Level (TRL) is at 0%" | planned | | Update TRL on the portal once the end-to-end demo is recorded | team |
| P2 | "Progress Updates 0" | planned | | Post a progress update after each build wave | team |
| P3 | "Mentors Feedback 0" | planned | | Ask a mentor to review the studio and Earn flows | team |
| P4 | "Lean Business Canvas ✅ Filled in" | done | `docs/business/LEAN-CANVAS.md` | Keep in step with the prices in AGENTS.md | team |
| P5 | "Security (SSDLC) ✅ Filled in" | partial | `SECURITY.md`, `docs/security/THREAT-MODEL.md`, `docs/security/SECURITY-REVIEW-2026-11.md`, `docs/business/SSDLC.md`, `web/src/app/trust/page.tsx` | Repository SSDLC drafted. Exact portal submission and public release evidence are pending. 26 Nov: public `/trust` page lists each control as implemented, partial or planned with its evidence path; CSP mode, kill switches and the ledger head are read live. | team |
| P6 | "What technologies are you using and for what?" (the seven headings are empty on the portal) | partial | `docs/business/SSDLC.md` | Seven answers are drafted from the implemented stack. Team review and portal entry are pending. | team |

## The six capabilities

| ID | Claim | Status | Evidence | Gap / next step | Owner |
|---|---|---|---|---|---|
| C1 | "AI-Powered Creation: Transform videos, podcasts, music-related content, animations and educational materials into professional, platform-ready content" | partial | `docs/BUILD-STATUS.md`, `web/src/server/render.ts` | Talking video and podcasts work: transcript, clips, 9:16 render with captions. Music content, animation and education scenarios not yet built or tested (X10) | Claude |
| C2 | "Global Localisation: Translate and culturally adapt content ... subtitles, supported voice dubbing" | partial | `web/tests/captions.test.ts` | Source-language subtitles work. Translation is `limited by access` until a provider key is entered. Dubbing is planned (X3) | Claude |
| C3 | "Agentic Creative Workspace: ... AI to inspect projects, understand instructions, operate editing tools, coordinate workflows and execute approved actions" | partial | `web/src/server/planner.ts`, `web/src/server/assistant.ts`, `web/src/app/api/projects/[id]/assistant/route.ts`, `web/src/components/studio/AssistantPanel.tsx`, `web/tests/assistant-security.test.ts`, `design/walkthrough-laneC.md`, `web/src/server/flags.ts` | Studio assistant works in the browser: a typed proposal with reason, source line and diff, approved by the creator, changed a clip (local qwen3:1.7b). Not yet run on a hosted model; small local models need the clip named to propose. More editing tools (X7) 26 Nov: server-side kill switch `IZWI_FLAG_ASSISTANT` (panel hidden, chat and voice routes 404, restart not rebuild); replies show how many transcript lines the injection check held back. | Claude |
| C4 | "Audience & Content Intelligence: Analyse engagement, retention, audience preferences and content performance across connected platforms" | planned | | Needs platform analytics connectors (X9) and the growth agents (X8) | Claude |
| C5 | "Distribution & Global Reach: Connect supported social media and creator platforms to prepare, schedule and manage multilingual content" | partial | `web/src/components/studio/PublishTab.tsx` | Export plus "mark as posted" works. Posting and scheduling through platform APIs are `limited by access` until apps are approved (X9) | Claude |
| C6 | "Creator Rights & Monetisation: Support content provenance, collaboration agreements, licensing, digital storefronts and integrated payment options" | partial | `web/src/server/public.ts`, `web/src/components/studio/ProtectTab.tsx`, `web/src/server/provenance.ts`, `web/tests/provenance.test.ts`, `docs/security/PROVENANCE.md`, `design/walkthrough-laneC.md` | Consent by QR on a phone page and link reissue work in the browser. Every render carries a signed provenance sidecar that verified in the browser walkthrough (not C2PA: no Windows x64 c2pa-node build). Storefront and payments are planned (X11) | Claude |

## User journey

| ID | Claim | Status | Evidence | Gap / next step | Owner |
|---|---|---|---|---|---|
| J1 | "A South African podcaster uploads one recording and prompts Izwi AI to identify highlights, produce short videos, add engaging captions" | done | `docs/BUILD-STATUS.md`, `design/mockups/real-create.png`, `design/mockups/real-publish.png` | Verified on the synthetic episode; repeat on real recordings (X10) | Claude |
| J2 | "create versions for audiences in South Africa, Brazil and France" | limited by access | | Translation needs a provider key on the Run on page | team |
| J3 | "recommends publishing strategies using available engagement insights" | planned | | Growth agents (X8), fed by real analytics (X9) | Claude |
| J4 | "generates editable versions for approval" | done | `web/src/app/r/[token]/ReviewClient.tsx` | Review links with line approval and comments work | Claude |
| J5 | "distribute the content and offer premium material or licensing through a connected storefront" | partial | `web/src/app/l/[slug]/ListingClient.tsx` | Licence listing and enquiry work. Storefront and payments are planned (X11) | Claude |

## AI and data claims

| ID | Claim | Status | Evidence | Gap / next step | Owner |
|---|---|---|---|---|---|
| A1 | "hybrid web and local-first architecture ... connect their preferred models or run compatible open-weight models on their own devices" | partial | `web/src/server/providers.ts`, `web/src/app/app/engine/page.tsx` | Local whisper.cpp plus your own key (AI/ML API, Meta Llama API, Ollama). Hosted IZWI cloud is planned | Claude |
| A2 | "powered primarily by the Meta Models API" | limited by access | `docs/research/open-source-map.md` | Meta's API is now `api.meta.ai/v1` (Muse models; no Llama listed). Use Standard mode only: Contributor mode trains on content, which would break A8/A9. No key yet; until then, write "designed for" | team |
| A3 | "model-agnostic architecture supporting leading proprietary AI models, open-weight models, and custom-trained or fine-tuned models" | partial | `web/src/server/providers.ts` | OpenAI-compatible adapter works; no fine-tuned model connected yet (X1) | Claude |
| A4 | "Multimodal Content Understanding: AI analyses video, audio, images, speech, transcripts and project timelines to identify scenes, speakers, topics, highlights" | partial | `web/src/server/media.ts` | Audio and speech work. Scenes, faces and on-screen text are planned in the Watch step (X4) | Claude |
| A5 | "Adaptive Content Creation: AI generates editable content variations ... based on audience insights" | planned | | Needs X8 and X9 | Claude |
| A6 | "Intelligent Distribution: AI prepares platform-specific content, multilingual descriptions, titles, publishing schedules" | planned | | Titles and descriptions per platform and language; schedules after X9 | Claude |
| A7 | "selected compatible models may be fine-tuned using licensed, public-domain or explicitly consented datasets ... South African language recognition" | planned | | ASR track (X1), trained on Kaggle only | Claude |
| A8 | "This information is not automatically used to train shared models" | partial | `docs/DATA-USE.md` | Application training is absent. Verify hosted provider processing terms and keep future training opt-in. | Claude |
| A9 | "Training on private content or voice recordings requires explicit authorisation" | planned | | Add an opt-in consent record before any creator media enters a training set | Claude |
| A10 | "Creator Personalisation: Izwi AI can retain approved style preferences, reusable templates and performance insights" | partial | `web/src/server/actions.ts` | The glossary learns spellings. Style templates and performance insights are planned | Claude |
| A11 | "External AI calls, model licences and sensitive actions are subject to provider policies, security controls and user approval" | done | `web/src/server/crypto.ts`, `web/src/server/planner.ts`, `web/src/server/ssrf.ts`, `web/tests/ssrf.test.ts`, `docs/security/SECURITY-REVIEW-2026-11.md`, `web/src/server/audit.ts`, `web/tests/assistant-security.test.ts` | Keys sealed with AES-256-GCM; plans need approval before they run; outbound provider calls pass an SSRF guard with fixed error messages. Provider privacy classes are planned (Lane C) 26 Nov: assistant proposal creation is audited (`assistant.proposal_created`, step names only) next to approval. | Claude |
| A12 | "Statistics South Africa's Census 2022 ... 8.7% ... English most often at home" and "17.4% of households had fixed internet" | partial | | Figures come from the profile; add their source links to `docs/RESEARCH-SOURCES.md` with quoted spans | Claude |

## Build asks agreed with the team (20 Nov 2026)

| ID | Ask | Status | Evidence | Gap / next step | Owner |
|---|---|---|---|---|---|
| X1 | South African word accuracy, "all three": measure plus route plus correction layer; fine-tune on Kaggle; check the Lelapa Vulavula API | planned | | Build the evaluation set and the `web/scripts/asr_eval.py` harness first; compare with the three gates | Claude + team |
| X2 | Dictation and "adding our own points" by voice | partial | `web/src/app/api/projects/[id]/assistant/transcribe/route.ts`, `web/src/server/voice.ts` | Push-to-talk records and transcribes through the worker. Not demonstrated in a browser (headless Chrome has no microphone); test on a real laptop or phone
| X3 | South African voices for dubbing | limited by access | `docs/research/open-source-map.md` | No commercially licensed open TTS for zu/xh/st/tn/af was found (MMS-TTS and the SA VITS model are cc-by-nc; Piper has none). Azure is the only candidate, not yet verified | team |
| X4 | Computer vision that watches the video (Watch step) | planned | | Scenes, shots, faces, on-screen text, scene descriptions; feeds clip finding and the graph | Claude |
| X5 | Routing that depends on the video | partial | `web/src/server/planner.ts`, `web/src/server/providers.ts`, `web/tests/assistant-security.test.ts` | Assistant routes by privacy class (private / standard / may log) and never switches class silently. Per-task model routing and probe- and language-based routing are next | Claude |
| X6 | Music choice and editing at high quality | planned | | Licensed tracks only; trim, fade, ducking, loudness, beat-aligned cuts | Claude |
| X7 | Editing depth, effects library and an editable studio graph whose pieces connect | planned | | Design fixes first, then graph editing and an effects library | Claude + team |
| X8 | Advisor from ideation to earning, and a growth agent team (trends, what audiences like, ideas, series, pivots, learning with reasons) | planned | | No metric shown without a source | Claude |
| X9 | Platform connections (YouTube, TikTok, Instagram) through official APIs, MCPs and connectors | planned | | `limited by access` until the team registers apps | team |
| X10 | Real-content scenario matrix: podcast, music video, cooking, comedy, school explainer, animation short, community event, product review | planned | | `docs/SCENARIOS.md` with real or licensed media, measured outcomes and the business case | Claude + team |
| X11 | How creators earn and post: storefront, paid licences, South African payment provider | planned | | Research Paystack, Yoco and PayFast; no payouts shown until real payments exist | Claude |
| X12 | Demo creator accounts per niche (email and social) | planned | | The team creates and labels them; Claude never creates accounts or handles passwords | team |
| X13 | Hosted database choice | partial | `web/src/server/migrations.ts`, `web/src/server/db.ts`, `web/tests/db-pg.test.ts`, `docs/QA-REPORT-2026-11-28.md` | The app now runs on Postgres (X13 port on `main`). QA on 28 Nov used an in-process stand-in: a real Postgres server, the hosted database and live R2 were not tested by it | Claude |
| X14 | Open-source tools for everything | partial | `docs/research/open-source-map.md`, `docs/research/asr-plan.md`, `docs/research/research-review-round1.md` | All 13 verbs mapped. Adversarial review says REVISE: non-commercial corpus (MzansiText), Demucs weights, CC BY-ND music, libx264 GPL, paired statistics. Revise before any build or licence decision | Claude |
| X15 | Every screen walked through as creator and as buyer | partial | `design/walkthrough-laneC.md`, `docs/QA-REPORT-2026-11-28.md` | 28 Nov: creator, guest, reviewer, buyer, member and admin flows walked locally on the redesign build, with a phone-width pass. Not every control was pressed; real phones and signed-in hosted screens remain
| X16 | Work split with Sibusiso Khumalo | partial | `docs/TEAM-SPLIT.md` | First draft; confirm the lanes with Sibusiso and the team | Claude |

## Design critique round 1 (`design/critique-round1.md`)

| ID | Item | Status | Evidence | Gap / next step | Owner |
|---|---|---|---|---|---|
| D1 | Consent scope legible and consistent (Protect and the consent page) | done | `web/src/lib/consent-scope.ts`, `design/mockups/laneB-protect.png`, `design/mockups/laneB-consent.png`, `design/critique-round2.md` | Round 2: FIXED on both screens. Unknown scopes show as unknown, never widened | Claude |
| D2 | Say what each workflow really does (export versus posting, planning mode, device estimates) | done | `design/critique-round2.md`, `design/mockups/real-publish.png`, `design/mockups/real-runon.png` | Publish says "Render and download. Post it yourself."; the planner mode is shown only once known; device figures labelled as browser readings | Claude |
| D3 | Shorter studio header and stage rail | partial | `design/mockups/real-canvas.png` | Slimmer on desktop. Phone: the title truncates (single-line input) and the stage rail needs a scroll cue | Claude |
| D4 | Readable canvas graph and home story card | partial | `web/src/components/studio/StoryGraph.tsx`, `design/mockups/real-canvas.png`, `design/mockups/real-home.png` | Desktop graph and home card FIXED. Phone: the prompt bar covers part of the graph | Claude |
| D5 | Transcript editor workspace | partial | `design/mockups/real-create.png` | Spelling tool demoted; two columns and a sticky player. The scroll behaviour of the independent transcript column still needs a hands-on check | Claude |
| D6 | Listing page player and details; Run on device check first | partial | `design/mockups/laneC-listing-desktop.png`, `design/mockups/laneC-engine-desktop.png` | Device check first and results visible. Listing needs a clip description, and on phone the permitted use and term should come before the form | Claude |
| D7 | Plain-language AI connections in Settings | partial | `docs/SETTINGS-CONNECTIONS.md`, `web/src/components/engine/ProviderManager.tsx`, `web/tests/api-fixes.test.ts`, `web/e2e/settings-connections.spec.ts` | Playwright browser run and requested screenshots need a local Postgres-backed app plus owner and member storage-state files. Preferences, Languages and Account are tracked separately | Claude |
| D8 | Per-user appearance preferences in Settings | partial | `web/src/components/settings/PreferencesPanel.tsx`, `web/tests/preferences.test.ts`, `web/e2e/settings-preferences.spec.ts` | Server persistence and live preview are implemented behind `IZWI_FLAG_PREFERENCES=0`; authenticated browser screenshots and contrast review remain pending | Claude |
| D9 | Home greeting follows the creator's selected languages | partial | `web/src/lib/greetings.ts`, `web/tests/languages.test.ts`, `web/e2e/settings-languages.spec.ts` | Selection and daily rotation are implemented behind `IZWI_FLAG_LANGUAGES=0`; greeting phrases await native-speaker review and authenticated browser screenshots | Claude |
| D10 | Spatial Canvas actions and dropped-scene recovery | partial | `web/src/components/spatial/SpatialCanvas.tsx`, `web/tests/spatial-layout.test.ts` | Restore is available in the Canvas behind `IZWI_FLAG_SPATIAL_RESTORE=0`; a real-project pointer/keyboard/render walkthrough and screenshots still need an authenticated app fixture | Claude |
| D11 | Platform-specific publishing policy pre-check | partial | `web/src/lib/platform-policy.ts`, `web/tests/platform-policy.test.ts`, `web/e2e/policy-precheck.spec.ts` | Sourced hard-limit and evidence checks are stored per render behind `IZWI_FLAG_POLICY_PRECHECK=0`; no text/video model review or platform guarantee exists | Claude |
| D12 | Reviewable starter templates across creator journeys | partial | `web/src/lib/starter-templates.ts`, `web/tests/starter-templates.test.ts`, `web/e2e/starter-templates.spec.ts` | Eight niche outlines are available behind `IZWI_FLAG_STARTER_TEMPLATES=0`; using one fills an editable draft/title only, not a persisted template proposal | Claude |
| D13 | Scheduled post workflow and manual export | limited by access | `web/src/app/api/post-schedules/route.ts`, `web/tests/scheduled-posts.test.ts`, `web/e2e/scheduled-posts.spec.ts` | Policy-gated manual exports are recorded behind `IZWI_FLAG_SCHEDULED_POSTS=0`; OAuth tokens, worker posting, retry and platform confirmation require developer apps and review | team |
