# Platform plan: the full brief, built from open-source parts

Status: **proposal.** Written 17 November 2026 to restore the scope of the original Team Sonar brief ("AI-native creative operating system", "One Voice. Every Language. Every Market."), which the handoff docs had narrowed to a podcast-clip MVP. Nothing here is a Team Sonar decision yet. The prototype in `web/` shows the interface for it; only the items marked "works now" do real work.

## The one idea
You say what you want. IZWI shows a plan that names the tool for each step and what needs a human yes. You approve. Outputs branch off the story.

Every job, for every kind of creator, goes through that same loop, so there is one thing to learn.

## How the parts connect
```
                    ┌──────────── Workspace (Next.js) ────────────┐
 creator ──prompt──▶│ Canvas + prompt bar · Review room · Markets │
                    └───────────────┬─────────────────────────────┘
                                    │ plan (steps, tool, gate)
                         ┌──────────▼──────────┐
                         │ Planner  /api/plan   │  OpenAI-compatible chat:
                         │ rules first, model   │  Meta Llama API, AI/ML API,
                         │ when a key is set    │  Ollama, llama.cpp
                         └──────────┬──────────┘
                                    │ approved steps
                    ┌───────────────▼────────────────┐
                    │ Job runner (FastAPI + Celery/   │  one adapter per verb,
                    │ Valkey, Postgres as the record) │  same input/output shape
                    └─┬──────┬───────┬───────┬───────┬┘
                 Hear │  Cut │ Trans │ Voice │ Animate│ Publish / Record
        whisper.cpp   │FFmpeg│MADLAD │Chatter│Wan 2.1 │ Postiz / c2pa-js
        UCT isiZulu   │OpenCut│ -400 │ box   │ComfyUI │
                    └────────────────┬───────────────┘
                                     │ every output is a draft until
                          ┌──────────▼──────────┐
                          │ Gates: human review, │
                          │ consent, cost shown  │
                          └─────────────────────┘
```
**Plug and play** means each verb (Hear, Cut, Translate, Dub, Animate, Publish, Record) has one adapter with the same shape: it takes a job with an input file and options, and returns an output file plus a status. Swapping Whisper for another speech model, or MADLAD for a provider API, changes one adapter and nothing else. GPL and AGPL parts (ComfyUI, Postiz) run as separate services called over HTTP so their licence terms stay with them.

**Where a job runs** is the creator's choice on the "Run on" screen: this device, their own key, or IZWI cloud (planned). The planner marks each step with where it can run.

## The gaps in the repo docs, and what fills them
| Gap | Fill | Licence | Evidence | State |
|---|---|---|---|---|
| Translation model "not selected" | google/madlad400-3b-mt | Apache-2.0 | Model card lists zu, xh, st, tn, nso, ts, ve, ss, af, sw, yo, ha, ig, fr, pt, ar, es, hi | Not evaluated |
| isiZulu speech | uctnlp/omniASR-CTC-300M-v2-Zulu-All-v2 | Apache-2.0 | Fine-tune of Meta Omnilingual ASR, tagged isiZulu | Not evaluated |
| Other speech | openai/whisper-large-v3 | Apache-2.0 | Card lists af, sw, yo, ha, sn, so, am, ln, fr, pt, ar, es, hi. It does **not** list zu, xh, st, tn | Not evaluated |
| Dubbing voices | resemble-ai/chatterbox | MIT | GitHub, pushed 2026-11-04 | No South African language voice confirmed |
| Animation, AI story | Wan-Video/Wan2.1, Lightricks/LTX-Video via ComfyUI | Apache-2.0, GPL-3.0 | GitHub | Needs a GPU service |
| Editor | OpenCut-app/OpenCut | MIT | GitHub, pushed 2026-09-24 | Not integrated |
| Hardware check | AlexsJones/llmfit | MIT | GitHub | Desktop only; browser check works now |
| Publishing | gitroomhq/postiz-app | AGPL-3.0 | GitHub | Not integrated |
| Content credentials | contentauth/c2pa-js | MIT | GitHub, 42 stars | Spike needed |
| Review room | Built here | n/a | `ReviewRoom.tsx` | Works now, local only |

### Models that look right but cannot be used commercially
- **lelapa/InkubaLM-0.4B** (Lelapa AI): cc-by-nc-4.0, gated. Lelapa's open speech models on Hugging Face are also cc-by-nc-4.0. Lelapa sells a commercial API (Vulavula); its terms and prices were not checked.
- **facebook/nllb-200** and **facebook/mms-1b-all**: cc-by-nc-4.0.
- **CohereLabs/aya-expanse-8b**: cc-by-nc-4.0, and its card does not list any South African language.

### Honest state of "every language"
Translation has one openly licensed candidate for all the listed languages. Speech recognition has a confirmed open candidate for isiZulu and Afrikaans only among South African languages; isiXhosa, Sesotho, Setswana and the rest have none confirmed. No open dubbing voice is confirmed for any South African language. None of the candidates has been tested by native speakers. The market map in the prototype shows exactly this, per language.

## Your keys
The planner speaks the OpenAI chat format, so both providers you have fit the same three server-side settings in `web/.env.local`:
```
MODEL_BASE_URL=https://api.aimlapi.com/v1        # AI/ML API
MODEL_API_KEY=...
MODEL_NAME=...
```
For Meta's Llama API most sources give `https://api.llama.com/compat/v1`, but one source lists a different hostname, so confirm it in Meta's own docs. **This path has not been tested against a live key.** Without a key the prompt bar still works using built-in rules, and says so on screen.

## How each target market would use it
| Who | What they bring | Their problem today | What IZWI does | First real feature they need |
|---|---|---|---|---|
| Podcasters | Long recording | Hours finding three good minutes | Suggests cuts with a stated reason, captions, audiogram | Hear + Cut |
| YouTubers, short-form | Raw footage | Re-editing one video for five platforms | One source, vertical/square/wide cuts, translated captions | Cut + Translate |
| Educators | Recorded class | Learners who do not study in English | Chaptered lesson, captions in the learner's language, low-data audio | Translate + review |
| Musicians | Track, performance | Splits and permissions live in chats | Lyric video, split sheet, consent record | Protect |
| Filmmakers | A cut | Notes arrive with no timecode | Review room with notes pinned to the second, subtitle files per market | Review room |
| Animators, storytellers | Script or idea | Days before anyone sees motion | Script to timed scenes to animated frames | Storyboard, then Animate |
| Editors, studios, agencies | Client brief | Approvals lost across apps | Client review link, versions per market, approval record | Review link |
| Universities, NGOs, broadcasters | Programme content | Multilingual delivery at volume | Batch translate with reviewer queues and audit record | Translate + review at scale |

## Extensions and API
- **API:** `GET /api/plan` (is a model connected) and `POST /api/plan` (sentence in, steps out) exist now. Jobs, exports and webhooks follow the candidate routes in `engineering/ARCHITECTURE.md`.
- **Automations:** Activepieces. **Dashboards:** Metabase. **Chat surface for local models:** Open WebUI. All three report custom licences on GitHub; read them before adopting.
- **Desktop:** Tauri wraps the same web app so whisper.cpp, Ollama and llmfit can run offline.

## What works in the prototype today, and what does not
| Screen | Works now | Shown as planned |
|---|---|---|
| Canvas + prompt bar | Sentence to plan by rules; by model if a key is set (untested); approve queues steps | Running any step |
| Market map | Real world map, add or remove markets, per-language model availability | Any translation |
| Review room | Real video playback, notes pinned to timecode, checks measured from the file and captions, your own file | AI judge, sharing notes |
| AI story | Script to timed scenes | Generated frames |
| Run on | Reads this device's processor, memory, graphics, WebGPU, free space; per-model verdict | Local inference, cloud |
| Extensions | Live API status | Every connector |

## Build order I would propose
1. Hear and Cut on one real file: tus upload, whisper.cpp, FFmpeg export. This is the existing MVP slice.
2. Translate with MADLAD-400 on Kaggle or a rented GPU, with the line-review screen, and a native-speaker evaluation for isiZulu first.
3. Review room sharing (links, stored notes) and the consent gate.
4. Model key path tested with Meta Llama API and AI/ML API; AI judge on top of it.
5. Desktop app with the exact hardware check.
6. Dubbing and animation once a GPU service and consent flow exist.

## Not verified
Meta Llama API base URL; any model's real quality in any South African language; Chatterbox language coverage; memory needs beyond the Whisper README and parameter-count estimates; WhatsApp Business API terms; Lelapa Vulavula commercial terms; custom licences of Open WebUI, LiteLLM, Metabase and Activepieces.

## Sources
- Hugging Face model cards read 17 Nov 2026: google/madlad400-3b-mt, openai/whisper-large-v3, facebook/nllb-200-distilled-600M, facebook/mms-1b-all, facebook/omniASR-LLM-7B, lelapa/InkubaLM-0.4B, CohereLabs/aya-expanse-8b, uctnlp/omniASR-CTC-300M-v2-Zulu-All-v2.
- GitHub licence and activity checks via `gh api`, 17 Nov 2026.
- Llama API endpoint: https://groq.com/the-official-llama-api-accelerated-by-groq, https://docs.litellm.ai/docs/providers/meta_llama, https://docs.boundaryml.com/ref/llm-client-providers/llama-api
- AI/ML API endpoint: https://docs.aimlapi.com/readme-1, https://docs.agno.com/reference/models/aimlapi.md
