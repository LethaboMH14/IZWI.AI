# Team split (first draft, 20 Nov 2026)

Who does what next, so two people and their agents never edit the same files. Every task names its `CRITERIA.md` row. Mark a row `done` only with evidence; `python3 scripts/criteria_check.py` checks this.

## Getting started (Sibusiso)
1. Clone the repo, then:
   ```sh
   cd web
   npm install
   npm run setup
   npm run dev:all
   ```
   `setup` creates your own local secrets in `web/.env.local`. Never copy anyone else's.
2. **AI provider keys** go in the app's **Run on** page (`/app/engine`). They are sealed in the database with your own `IZWI_MASTER_KEY`. Never put keys in chat, commits, briefs or screenshots.
3. **Kaggle** (all training runs there, not on a laptop): put your token in `~/.kaggle/kaggle.json`.
4. Read `AGENTS.md`, `CRITERIA.md` and `docs/BUILD-STATUS.md` first.

## Lanes

| Lane | Rows | Owner | Owns (files or area) | Done when |
|---|---|---|---|---|
| Portal and judges | P1, P2, P3, P5, P6 | Lethabo | Hackathon portal; `docs/business/SSDLC.md` | Progress update posted after each wave; TRL updated; mentor review asked for; SSDLC copied into the repo |
| Platform apps | X9, X12 | Lethabo | YouTube, TikTok and Instagram developer apps; demo creator accounts per niche, labelled as demo | App IDs recorded (secrets only in `web/.env.local`); demo accounts listed in `docs/DEMO-ACCOUNTS.md` with no passwords |
| Real content | X10 | Sibusiso | `docs/SCENARIOS.md`; consented or licensed media | Each scenario run end to end with measured outcomes and the business case |
| Speech accuracy | X1, X2 | Claude + Sibusiso | `web/scripts/asr_eval.py`, `web/src/server/media.ts`, evaluation set (consented clips) | Native-checked transcripts for the evaluation set; baseline WER per language; the three-gate comparison of routed, corrected and fine-tuned versions |
| Watch and route | X4, X5 | Claude | New `web/src/server/watch.ts`, `web/src/server/planner.ts` | Scenes and descriptions feed clip finding and the graph |
| Music and effects | X6, X7 | Claude | New `web/src/server/music.ts`, `web/src/server/render.ts` | Licensed track on a clip with ducking and loudness, rendered |
| Advisor and growth | X8 | Claude | New `web/src/server/advisor.ts`, studio side panel | Advice per stage with a reason and a source; no metric without a source |
| Earn | X11, C6, J5 | Claude | `web/src/server/public.ts` (listing), Earn tab | Payment provider chosen from research; storefront records |
| Design polish | D3–D6 | agents | Files listed in `design/critique-round2.md` "Still open" | Round 3 critique has no NOT FIXED items |

## Rules for both of us
- Prior art first. Check open-source tools before building, and record licence and last push. The research is in `docs/research/`.
- Real and working only. Anything simulated starts with `sim_`. No made-up engagement, revenue, consent or translation quality.
- No training on a laptop: Kaggle only.
- Before claiming "A is better than B": Mann-Whitney p<0.05, a bootstrap 95% CI that excludes 0, and Cliff's delta reported.
- One owner per file at a time. Agree in chat before touching another lane's files.
- Before handing over: `python3 scripts/verify_handoff.py` and `python3 scripts/financial_model.py`, plus `npm run typecheck`, `npm run lint` and `npm run test` in `web`.
