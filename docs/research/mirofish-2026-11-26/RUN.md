# MiroFish simulation of plan v3 (26 Nov 2026)

**Status: simulated feedback, not research evidence.** Nothing here is a real judge, creator or customer view. It was used only to generate hypotheses, and each was checked against the repo before it changed the plan (see `docs/plans/2026-11-26-freeze-to-demo-plan.md`, "MiroFish claim check").

## What was run
- **Tool:** [MiroFish](https://github.com/666ghj/MiroFish) (AGPL-3.0), commit `7657031` (2 Oct 2026), run locally from a separate folder. No MiroFish code is in this repo.
- **Engine:** OASIS (camel-ai) social simulation, Zep Cloud knowledge graph, OpenAI-compatible LLM.
- **Models:** Google Gemini free tier. `gemini-3.5-flash-lite` for the ontology, personas and simulation; `gemini-3.1-flash-lite` for the report, because the first model's free quota (500 requests a day) ran out at the report step.
- **Seed:** [seed-status-brief.md](seed-status-brief.md), written for the run and separating implemented, in-review and planned work, plus plan v3, `docs/PRODUCT.md`, `docs/business/LEAN-CANVAS.md` and `docs/business/FINANCIALS.md` from `main`.
- **Question:** predicted judge scores and questions; adoption and willingness to pay at R149, R499 and R1499; demo risks; plan changes before Thursday's freeze and Sunday.
- **Scale:**
  - 41 agent personas generated from the graph's entities: creator segments, studios, agencies, a judge, providers, POPIA, the team members and others;
  - 24 simulated hours on a Twitter-like and a Reddit-like platform;
  - 159 actions: 32 new posts, 26 quote posts, 33 comments and 48 likes, plus reposts, follows and idle turns.

## Outputs kept here
- [report.md](report.md): the ReportAgent's report, verbatim, with a warning banner.
- [followups.md](followups.md): four follow-up questions to the ReportAgent (scores, judge questions, segment adoption, demo risks).

Raw personas, posts and comments are not committed. Several agents speak as real team members and say things those people did not say.

## Limits
- **Low-signal chatter:** many agents re-posted the seed posts word for word. Most "team" agents posted promotional lines.
- **False claims:** some agents asserted untrue things, for example that C2PA HMAC signing was "fully locked in". The report repeated some of them.
- **Anchoring:** the judge persona was anchored on the v2 review scores quoted in plan v3, so it recycled old findings such as the Publish-before-Cut bug, which C3 records as fixed.
- **Inflated scores:** the predicted scores (9/10, 8/10, 4/5, 4/5, 5/5) are not supported by the repo's state.
- **Small, cheap run:** one run, one small model, no repeats. Rate limits at the evening peak may have dropped some agent turns.
- **No real data:** no real creator, judge or market data entered the simulation.
- **The seed overstated two things.** It said the consent page works in English, isiZulu, Sesotho and Afrikaans (it is English-only) and that PR #7 was unmerged (it merged at 09:17 UTC that morning). Some agent claims about isiZulu support come from this error.
