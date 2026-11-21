# Frontend design prototype

Status: **design prototype with sample data.** It lives in `web/`. No sign-in, upload, AI job, payment or publishing is wired. Every screen carries a "Design prototype · sample data" label, and every figure on screen comes from `web/src/lib/demo.ts`.

## Run it
```sh
cd web
npm install
npm run dev
```
Open `/design` for the board that links every screen. Mockup images are in `design/mockups/`. Capture more with `bash design/shoot.sh <path> <name> [width] [height]` while the dev server runs.

## Concept: the strand
"Izwi" means voice. The product promise is "Turn one story into many", so the interface draws exactly that: one strand of voice that splits into many outputs.

- **Landing hero:** a 3D ribbon (Three.js shader) rises from the microphone button, passes through Naledi's frame and fans into the outputs an episode becomes. Visitors can drive it with their own microphone. Audio is analysed in the tab and never recorded or sent.
- **Story map:** the same idea as a working screen. One source, its clips, every output, and the honest state of each.
- **Stage navigation:** the five pillars sit on one line, each with a state dot, so the navigation is also the progress report.

## Screens
| Route | Screen | What it has to prove |
|---|---|---|
| `/` | Landing | The promise in ten seconds, a live caption demo with code-switching, the story map, proposed prices |
| `/sign-in` | Sign in | WhatsApp code or email link, no password, a real validation error |
| `/welcome` | Onboarding | Four questions that change the product; the file step reads a real file's name and size locally |
| `/app` | Home | Stories as waveform rows with stage states |
| `/app/episode-04#map` | Story map | What is ready, what is waiting, and on whom |
| `#create` | Create | Player, waveform, transcript, suggested cuts with a stated reason; keep and drop work |
| `#localise` | Localise | Line-by-line review; editing a line removes its approval; "Mark reviewed" unlocks only when every line is approved |
| `#protect` | Protect | Declarations, consent, terms; a missing consent holds the affected outputs |
| `#publish` | Publish | Format picker, per-output readiness, size before export, connected versus ready |
| `#earn` | Earn | Labelled planned; no money figures |
| `/r/episode-04` | Review link | A guest approves or asks for a change on a phone, no account |

## Proposals that go beyond the handoff (not decisions)
1. Word-level language tags so mixed speech survives captioning.
2. The story map as the project home, replacing a dashboard.
3. Consent as a gate that holds only the clips a person appears in.
4. Review and consent by link, sent on WhatsApp.
5. Stated reasons for each suggested cut instead of virality scores.
6. A paid network of first-language reviewers (also the first real Earn path).
7. C2PA content credentials attached to exports. Needs a spike.
8. Voice-note-first capture, and a WhatsApp Status export pack.

## Things the design covers that are easy to forget
Interrupted uploads, people who are not users, drafts that look finished, ready versus posted, cost before a job, names and slang, the empty workspace, wrong file type. Still open: revoking consent after export, deletion and retention, offline state, exhausted credits, a failed render.

## Type and colour
Colours follow `DESIGN-SYSTEM.md`: ivory and white surfaces, amber and gold, charcoal. Clay (`#c4552d`) and moss (`#4f6b3a`) are added for "waiting" and "reviewed". No purple, no dark theme.

Type is a **proposal that needs sign-off**, because the handoff keeps Plus Jakarta Sans for the presentation template: Cabinet Grotesk 800 (display, close to the poster headline), Switzer (text), Gambetta italic (spoken or non-English words), Martian Mono (timecodes). The first three load from Fontshare under the ITF Free Font Licence; read it before shipping. Martian Mono is OFL.

## References studied (16 to 17 November 2026)
Captures are in the vault library under `creator_media_tools`.
- **OpusClip** (category): near-black page, centred headline with one phrase in a soft pill, a paste-a-link box as the hero action. Learned: the first action sits in the hero. Not taken: the dark theme and "viral" claims.
- **CapCut** (category): white page, two-colour headline, a strip of real footage tiles. Learned: show real footage early.
- **Descript** (category, phone capture): plum page, serif headline, the product window shown directly under the button. Learned: text-based editing shown as the product itself.
- **Stripe** (beauty): one bold coloured ribbon over a calm layout. Borrowed: a single abstract gesture, here made of voice strands in amber.
- **Lusion** (beauty): a 3D object in a rounded frame that reacts to you. Borrowed: the framed live 3D element and pointer response.
- **Linear** (beauty): calm product navigation. Borrowed: the quiet left rail, in a light theme.
Riverside, Captions and ElevenLabs could not be captured headless, and Descript's desktop page was not seen.

## Open-source picks (checked on GitHub, 16 November 2026)
| Use | Repo | Licence | Last push | Status |
|---|---|---|---|---|
| 3D strand | mrdoob/three.js | MIT | 2026-11-16 | In use |
| Motion | motiondivision/motion | MIT | 2026-11-16 | Installed, not yet used |
| Icons | phosphor-icons/react | MIT | not checked | In use |
| Real waveforms | katspaugh/wavesurfer.js | BSD-3-Clause | 2026-11-12 | For the working editor |
| Resumable upload | tus/tus-js-client, transloadit/uppy | MIT | 2026-11-15, 2026-11-16 | For the working upload |
| Word timing | m-bain/whisperX | BSD-2-Clause | 2026-11-12 | Evaluate with faster-whisper |
| Content credentials | contentauth/c2pa-js | MIT | 2026-11-16 | Spike; 42 stars, small project |
| Caption rendering | remotion-dev/remotion | Custom licence, not OSI | 2026-11-16 | Read the company licence before use |
Not verified: any translation model for isiZulu, model weights licences, WhatsApp Business API terms and cost.

## Known weak points
- Naledi's images are crops from the deck slides (about 600 px wide), so they soften on large screens.
- The "video" is a still image with animated captions. There is no real audio or video yet.
- The isiZulu sample lines were written for the design and have not been checked by a first-language speaker.
- Outputs chips in the hero do not line up with individual strands.
- The design board's screen list is a plain grid.
- Checked in Chrome at 1440 px and 375 px only. Not checked on a real phone, in Safari or Firefox, or with a screen reader.
