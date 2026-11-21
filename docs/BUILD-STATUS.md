# Build status (18 November 2026)

The real app's backend is built and verified end to end on a synthetic recording. The screens are **not yet wired** to it: the pages under `web/src/app/app` still show the earlier design prototype with sample data.

## Run it
```sh
cd web
npm install
npm run setup        # local secrets, pinned whisper.cpp + model + caption font (SHA-256 checked), database migrations
npm run dev:all      # web app on :3187 and the job worker together
npm run test:media   # optional: makes test-media/sim_jozi-stories-ep04.mp4 (synthetic, Windows voices)
```

## Verified working (real files, real rows)
| Piece | Evidence |
|---|---|
| Database: 31 tables, forward-only migrations, backup before migrate, integrity check | `npm run db:migrate` output |
| Job queue: atomic claim, leases, retries with backoff, dependencies, idempotency keys, cancel | worker log; `src/server/jobs.ts` |
| Probe → light preview → cover → 16 kHz audio → waveform peaks | 80 s episode: 1.4 s + 8.1 s |
| Transcription with whisper.cpp base, primed by the workspace glossary | 80 s audio in 17–27 s; "Sawubona Mzansi", "Jozi Stories", "Naledi" correct |
| Caption lines: sentence-first, two rows of ≤ 42 characters, no speaker mixing | 11 unit tests pass (`tests/captions.test.ts`) |
| Clip finder with reasons measured from the transcript | 2 sensible clips with true reasons |
| Rights gate: render held until declaration + consent | "Waiting on Thabo K. (requested)", then rendered after consent |
| Render: 1080×1920, blurred fill, word-by-word gold captions, -14 LUFS | 38 s clip, frame checked |
| Hand-off package: SRT/VTT, EDL, OTIO, renders, record sheet | 8-file zip |

## Written and typechecked, not yet exercised over HTTP
Sign-up/sign-in and workspaces (better-auth), resumable upload (tus), project/clip/line/person/consent/link/output/listing APIs, media streaming with ranges, bring-your-own-key providers (OpenAI-compatible: AI/ML API, Meta Llama API, Ollama; MADLAD endpoint; speech endpoint), planner (rules, or model when connected), public review/consent/licence-enquiry endpoints, system status, team invites.

## Left to do, in order
1. Wire the screens to the API: sign-in, onboarding, home, upload, studio tabs, Run on (keys), review/consent/listing pages, invite page. Remove the sample-data studio.
2. HTTP integration tests: two-tenant isolation, consent gate over links, idempotent exports, expired/revoked links.
3. Unit tests for jobs, crypto, rights, clips, interop; validate EDL/OTIO with the OpenTimelineIO library.
4. Security pass: `npm run security` (npm audit, gitleaks, semgrep), headers/CSP.
5. Test translation with your AI/ML API or Meta Llama key, entered in Run on (never in chat).
6. Screenshots and two critique rounds; lifecycle docs (DBLC, SDLC, SSDLC, AIDLC, orchestration).

## Limits stated plainly
- isiZulu and most South African languages: no open speech model is wired; Whisper does not list them. Translation needs a connected provider.
- Dubbing and animation: planned, need a GPU service.
- Publishing to platforms: export and "mark as posted" only; no platform accounts connected.
