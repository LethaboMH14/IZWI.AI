# IZWI AI: freeze-to-demo plan (v4), after a MiroFish review

> **Status:** v4, proposed. It amends [plan v3](2026-11-22-experience-hardening-plan.md) for Thu 26 Nov 12:45 to Sun 29 Nov; v3 stays the record of the wider plan. Nothing here is decided until @LethaboMH14 reviews it.
> **Authors:** Sibusiso Khumalo with Claude (Claude Code), 26 Nov 2026.
> **Basis:** `main` at `6eb0185` (PR #7 and PR #8 merged), a MiroFish simulation of plan v3 ([run notes](../research/mirofish-2026-11-26/RUN.md)), and an Improver agent that checked every MiroFish claim against the repo.

## Summary
- **Freeze today at 18:00.** Land three small assistant fixes (runtime kill switch, injection badge, proposal audit) and a plain `/trust` page.
- **Undo:** defer it unless the fixes land early.
- **The demo:** cut it to five beats that already work, built around consent, approval and provenance.
- **Honesty:** say plainly what is English-only, what is not C2PA, and that no real creators or revenue exist yet.
- **Three facts in v3 are now wrong and need correcting:**
  - consent languages;
  - C2PA;
  - the demo seed script.

## What changed since v3
**Merged since v3:**
- Lane A (PRs #5, #6).
- Lane C assistant (PR #7, merged 26 Nov 09:17 UTC).
- Provider presets and per-task routing (PR #8, 10:15 UTC; Groq, Gemini, AI/ML API, Meta, OpenRouter, Ollama).
- The Publish-before-Cut planner fix (`web/tests/planner-publish.test.ts`, CRITERIA C3).

**Not started:**
- Lane B (brand, `/pricing`, `/trust`) and Lane D (3D). Design PR #3 has no go.

**v3 claims that no longer hold:**

| v3 said | Repo today | Evidence |
|---|---|---|
| Consent page in en / zu / st / af; a judge consents in isiZulu (demo step 5) | English only. The isiZulu and Setswana drafts are empty on purpose; Sesotho and Afrikaans don't exist | `web/src/lib/consent-i18n.ts`, `docs/CONSENT-STRINGS.md` |
| C2PA Content Credentials, verified in the browser on `/trust` | The C2PA spike failed (no Windows x64 prebuilt). Each render gets **IZWI signed provenance (not C2PA)**, checked with a script | `docs/security/PROVENANCE.md`, `web/scripts/verify-provenance.ts` |
| `npm run seed:demo` resets the demo | There is no seed script | `web/package.json` |
| CSP enforced by Wed 12:00 | Ships Report-Only unless `IZWI_CSP_ENFORCE=1` | `web/src/server/headers.ts` |
| `IZWI_FLAG_ASSISTANT` is a kill switch | Build-time, and only hides the panel. The API route ignores it | `AssistantPanel.tsx` (the `NEXT_PUBLIC_IZWI_FLAG_ASSISTANT` check) |
| The assistant streams the plan live | Local Ollama `qwen3:1.7b` took about 60–70 s per reply; `qwen3:4b` failed | `design/walkthrough-laneC.md` |

**Measured on 26 Nov** (`design/walkthrough-laneC.md`):
- a 9:16 render was ready in 62 s;
- the provenance check printed `OK IZWI signed provenance (not C2PA)`;
- the studio showed consent Granted 11.4 s after the guest answered (a bound, not a propagation time);
- no injection badge exists.

## What the MiroFish review found
MiroFish simulated 41 LLM agents (creator segments, studios, agencies, a judge, providers, a regulator) reacting to plan v3 for 24 simulated hours, then wrote a forecast. **It is a simulation by a small model, not feedback from people.** Several of its claims are false, and its predicted scores are inflated. Full outputs: [report](../research/mirofish-2026-11-26/report.md), [follow-ups](../research/mirofish-2026-11-26/followups.md).

### Claim check

| MiroFish claim | Verdict | Evidence |
|---|---|---|
| Publish-before-Cut is the top demo risk | Already fixed | C3, `web/tests/planner-publish.test.ts` |
| Cut Lighthouse, ZAP and Scorecard | Already done | Only `.github/workflows/lane-a.yml` exists |
| `/trust` is the most valuable addition | Agreed; not built | No route under `web/src/app` |
| "C2PA HMAC hardened", "all C2PA checks fully tested" (quote put in Lethabo's mouth) | False | `docs/security/PROVENANCE.md` |
| isiZulu consent page exists, and is "the template for other languages" | False | `web/src/lib/consent-i18n.ts` |
| POPIA masking at ingestion | False. Redaction runs only before a "may log" provider | `web/src/server/assistant.ts` (`redactForMayLog`) |
| Ollama keeps R149 margins healthy | Unsupported. No cost is measured; Creator-only break-even is 686 subscribers | `docs/business/FINANCIALS.md` |
| Local model latency can make the demo look broken | Confirmed: 60–70 s per reply | `design/walkthrough-laneC.md` |
| Privacy work must be visible on screen | Half built: provider and redaction chips exist, injection badge doesn't | `web/src/components/studio/AssistantPanel.tsx` |
| Kill switches make the demo safe | Partly false: assistant flag is UI-only; the 3D flag has nothing to switch | as above |
| Musicians and universities/NGOs are weak fits; institutional pricing undefined | Confirmed | C1, X6; `docs/business/LEAN-CANVAS.md` |
| Six minutes can't hold C2PA, ledger, BYOK, 3D and pricing | Agreed (plan v3 has eight demo steps) | v3 §The demo |

**Predicted scores.** MiroFish predicted 9, 8, 4, 4 and 5. Each high number rests on something that doesn't exist (isiZulu, C2PA, `/trust`, an OWASP mapping). Our own reading of what the repo supports today is below. It's a working estimate, not a judge prediction:

| Criterion | Today | Why | What moves it before Sunday |
|---|---|---|---|
| Innovativeness (10) | about 6–7 | Real: consent-gated render, phone QR consent, approval-gated assistant with privacy classes, hash-chained ledger, signed provenance | A clean live consent moment; the injection badge |
| Diverse team (10) | no evidence yet | No team slide; mentor feedback (P3) not asked | §Fri deck: team slide with real disciplines and languages, honest human vs agent split, both presenting |
| Submission (5) | about 3 | P1, P2, P3 planned; deck and backup video not made | Portal updates, deck, backup video |
| Business model (5) | about 3 | Honest but unvalidated canvas; no pricing page | One honest pricing slide; answer the break-even question |
| Cybersecurity (5) | about 4 | Lane A controls and tests are real; CSP Report-Only; no HTTP-level tenant tests; no SBOM | `/trust` with evidence paths; enforce CSP if Friday's walk is clean |

### Signal worth keeping
1. Make privacy visible: provider and privacy chip, "N items redacted", and a held-back-line chip.
2. Explain the consent gate as consent, in one sentence ("the clip can't render until the person in it says yes"), so it doesn't read as friction.
3. Don't run the live assistant on a slow local model.
4. Local-language support is the most likely judge question, and it is the honest weak spot.
5. Institutional buyers (universities, NGOs) need a pricing answer we don't have. Say so.

## Before the 18:00 freeze (about 5 h)
One branch from `main`: `fix/assistant-gaps`, rebased onto `6eb0185`. Proposed split (an assumption; Lethabo decides): Sibusiso builds items 1–3, Lethabo drafts item 4's text and reviews by 17:30. Nothing merges without Lethabo.

| # | Change | Files | Moves | CRITERIA | Effort / risk |
|---|---|---|---|---|---|
| 1 | **Runtime kill switch.** The route reads server-only `IZWI_FLAG_ASSISTANT` per request and returns 404 when off (also the transcribe route); the server passes `enabled` to the panel, so switching needs a restart, not a rebuild. Test plus `.env.example` | `web/src/app/api/projects/[id]/assistant/route.ts`, `.../assistant/transcribe/route.ts`, `AssistantPanel.tsx`, `web/tests/assistant-security.test.ts`, `web/.env.example` | Cybersecurity; demo safety | C3, A11 | 45–60 min / low |
| 2 | **Injection badge.** Send `excludedLines` in `data-meta` and store it with the message; show "1 transcript line held back: possible instruction" next to the redaction chip. Test that the count arrives and that no proposal comes from that line | `route.ts`, `web/src/server/assistant.ts`, `AssistantPanel.tsx` (`MetaPart`), tests | Cybersecurity; innovativeness (demo beat 3) | C3, A11 | 45 min / low |
| 3 | **Audit proposal creation.** `assistant.proposal_created` with action and thread, next to the existing approval audits | `route.ts` or `web/src/server/assistant.ts`, test | Cybersecurity | A11 | 20–30 min / low |
| 4 | **Plain `/trust` page.** One server page using existing tokens, no new dependencies, independent of PR #3. It's a table of controls marked implemented / partial / planned with evidence paths (SSRF guard, CSP and its mode, CSRF, rate limits, tenant tests, redaction, canary, injection classifier and its English-only caveat, approval and audit), the live consent-ledger head, and provenance labelled "IZWI signed provenance (not C2PA)" with the verify command | `web/src/app/trust/page.tsx` | Cybersecurity; submission | P5, A11, C6 | about 1.5 h / low |
| 5 | **Undo (keep, drop, trim)**, only if 1–3 are merged by 15:30. Capture the clip's previous start, end and status when the approved action applies, and restore it from the card. Reuse the idea from Sibusiso's earlier stash (`decideProposal`), not the code | `web/src/server/planner.ts`, `/api/plan/[id]`, `AssistantPanel.tsx` | Innovativeness; Lethabo's PR #3 review point 4 | C3 | 1.5–2 h / medium |
| 6 | **isiZulu consent strings: decide by 13:30.** Fill `zu` and set `reviewed: true` only if a team member writes it and a second speaker checks it. No machine translation. If not, the demo runs in English and the docs stop claiming isiZulu | `web/src/lib/consent-i18n.ts`, `docs/CONSENT-STRINGS.md` | Innovativeness; team | C6, D1 | about 1.5 h writing / quality |

**`/pricing`: cut the page.** The enforced Free tier, live meter and cost per render-minute don't exist, and claiming them would break `AGENTS.md`. Use one deck slide instead:
- four tiers marked "proposed, not live billing";
- R85000 a month fixed cost as an assumption;
- 686 Creator-only break-even;
- "no users or revenue yet".

Also keep out of the freeze build: design PR #3, and any work-in-progress branch.

## Fri 27
1. **Phone and tunnel.** Named Cloudflare tunnel (v3 recommendation, still an assumption), passkey on that hostname, consent page on a real Android and iPhone over mobile data. Go/no-go at 14:00. Fallback: sign the laptop in before the demo and run consent on a team phone on a hotspot.
2. **Fast assistant route.**
   - Use a hosted preset from PR #8 (for example Groq `openai/gpt-oss-120b`, May log, redaction on).
   - Time first token and full turn five times, and record the numbers.
   - Ollama becomes the offline path only.
   - Keys are entered only on the Run on page.
   - OpenRouter free allows 50 requests a day; any credit top-up is the account owner's call.
3. **Injection model.** Pre-download the 739 MB classifier on the demo laptop with `IZWI_FLAG_INJECTION=1`, then check that a planted line produces the chip.
4. **CSP.** Walk the studio with `IZWI_CSP_ENFORCE=1`. If it's clean, keep it on; if not, `/trust` says Report-Only.
5. **Demo reset without new code.** Build the demo project through the app, snapshot the database and `IZWI_STORAGE_DIR`, and restore the snapshot between runs.
6. **Reports with real numbers.** `docs/QA-REPORT.md` and the security review: test count from CI, render time, consent propagation actually timed, assistant timings.
7. **Deck and portal.** Team slide (each person's real disciplines and languages; who did what, human vs agent, including that MiroFish was a simulation), pricing slide, portal updates P1/P2/P6, and a mentor question (P3).
8. **Docs.** Correct the v3 claims listed above wherever they appear (CRITERIA notes, `docs/DATA-USE.md`, deck).
9. **Backup video.** Record it from the freeze build. Re-record if Friday changes the flow.

## Sat 28: rehearsals from `v0.9.0-demo` under `next start`
- **Run 1:** time each beat against the script.
- **Run 2, the chaos run:** Wi-Fi off, assistant flag off, the judge's phone fails, a slow render. Practise each fallback line.
- **Run 3:** clean, with both of you speaking.
- **Plus:** one run of the offline path (Ollama, pre-consented clip, pre-rendered output) and a 15-minute Q&A drill.

## The demo (6 minutes, five beats)
1. **0:00–0:40 Problem.** Naledi, introduced as a fictional persona, and one sentence on fragmentation and data costs.
2. **0:40–1:40 Plan and approve.** Signed in, project already uploaded and transcribed. Prompt "three TikTok clips" (drop "isiZulu draft captions": no translator connected, no native-speaker check). The plan shows each step and what needs a yes. Approve.
3. **1:40–2:50 Assistant.** Hosted route, with the provider and privacy chip and "N items redacted" visible. A planted line shows "held back" and produces no proposal. Name a clip; the card shows reason, source line and diff. Approve.
4. **2:50–4:10 Consent.** QR on screen; a judge answers on their own phone; the held clip releases. Start the render here, because it takes about a minute.
5. **4:10–6:00 Proof.** Render ready, then `verify-provenance` prints "OK IZWI signed provenance (not C2PA)", then the hand-off zip, then `/trust`, the pricing slide, and the ask.

## What we say plainly
- **Consent:** the text is in English (and isiZulu only if reviewed by name before freeze).
- **Speech recognition:** Whisper doesn't list isiZulu.
- **Translation:** needs a provider key and stays a draft until a speaker approves each line.
- **Redaction:** runs before "may log" providers. Private means local Ollama. Nothing switches privacy class silently. We claim engineering controls, not POPIA certification.
- **Injection defences:** the classifier is English-only, archived upstream and best-effort. Delimiters, the canary and human approval are the main defences.
- **Provenance:** IZWI's own signature, not C2PA. It shows the file bytes match the signed record. It doesn't prove consent was informed.
- **Users and money:** Naledi is fictional. No creator outside the team has used it. Prices are proposals, with no users or revenue.
- **How it was built:** AI agents wrote most of the code under the CRITERIA evidence gate; Lethabo reviews and merges every PR. A MiroFish simulation was used to stress the plan; its output is not user research.

## Judge Q&A drill
| Likely question | Honest answer, with evidence |
|---|---|
| Does it work in isiZulu? | Consent: English (or reviewed isiZulu). Speech: no open isiZulu model wired. Translation: draft-only until a speaker approves (`web/src/server/planner.ts`) |
| How do you handle POPIA? | Redaction of phone numbers, SA ID numbers (Luhn-checked), emails and consent-list names before may-log providers. Consent records never sent. Workspace-scoped data. No certification claimed |
| What stops prompt injection? | Delimited untrusted block, canary, classifier (English-only), approval before any change. Then show the badge |
| Is this C2PA? | No. The spike failed on Windows x64; see `docs/security/PROVENANCE.md` |
| How do you make money? | Proposed tiers; R85000 fixed cost assumption; 686 Creator-only break-even; BYOK and local models cut our compute but not support. Not validated |
| Who has used it? | Nobody outside the team yet. Next step: three creators, then 20 interviews |
| What did AI do, and what did you do? | Agents wrote most code under the evidence gate; humans set scope, reviewed and merged every PR |
| What if the AI is wrong? | It only proposes; a person approves; approvals (and proposals, if item 3 lands) are audited; Undo is planned |
| Team diversity? | Only real facts about the team |

## Cut or deferred to after Sunday
- 3D Story Room and RightsMap3D.
- Splash, brand refresh, transitions.
- In-browser C2PA.
- The Free-tier meter and live `/pricing`.
- Push-to-talk on stage.
- Data-saver mode.
- wavesurfer trimming.
- Lighthouse and axe numbers, unless measured on Friday.
- Per-line injection badges and a rescan after edits.
- HTTP-level tenant tests.
- SBOM and attestation.
- C2PA on Linux.
- An institutional tier.
- Lanes B and D after the design go.
- X1 speech accuracy.

## Real-world outlook (simulated, weak evidence)
MiroFish's agents leaned towards:
- independent podcasters at R149 as the likeliest payers;
- small studios at R499 if security evidence is visible;
- agencies at R1499 if BYOK and admin controls exist;
- musicians, universities and NGOs as weak fits.

These come from 41 simulated agents, several of them not people (a regulator, a model runner, a platform), so they are hypotheses only. The cheapest real checks after Sunday:
- **Three creators** (CRITERIA X10/X15): one upload-to-export session each, quoted only with permission.
- **Spend and price questions:** one question on what they spend now on tools and data, and one on whether R149 or R499 is too cheap or too expensive.
- **Two targeted sessions:** one educator on language, and one studio on consent.

## Open decisions
1. **isiZulu consent strings before freeze.** Needs a team member who writes isiZulu and a second speaker. Decide by 13:30.
2. **Undo before freeze:** only if items 1–3 are merged by 15:30.
3. **Hosted chat route for the demo**, and whose key is used. A paid top-up is the account owner's call.
4. **Tunnel:** named Cloudflare tunnel (v3 recommendation, an assumption until Friday's test).

## Verification
- **Freeze branch:** in `web/`, `npm run ci` (typecheck, lint, test, build) passes. Each new test fails on `main` and passes on the branch. Then a walk under `next start` at 390×844 and 1440×900 with both flags on, and again with the assistant flag off after a restart only.
- **This plan:** `python scripts/verify_handoff.py`, `python scripts/criteria_check.py` and `python scripts/financial_model.py` pass. No CRITERIA row changes status in this PR.
