# production/: IZWI AI ad production workspace

Two ads: **"Your hustle. Amplified."** (a 20 s pitch video, 1920×1080, 30 fps) and a **30 s South African comedy radio ad**.
Claude owns the creative, scripts, captures and Figma. Codex owns the Remotion studio, 3D, audio and render.

| Path | What |
|---|---|
| `creative/RECORDING-PACKAGE.md` | Scripts to record now: the livestream scene, the IZWI instruction (full and short), the radio ad, alternate narrator takes, direction, naming, upload |
| `creative/STORYBOARD.md` | 10-shot board (frame ranges) plus the radio sound board |
| `research/REFERENCES.md` | Study of the Wimpy and LangEase reference ads; the ChatGPT spec could not be read |
| `design/tokens.json` | Tokens copied from `web/src/app/globals.css` |
| `assets/captures/` | Real Playwright screenshots of the deployed app (public routes) plus `captures.json` |
| `scripts/capture-app.mjs` | Re-run the captures |
| `asset-manifest.json` | Every asset, its status (real / concept / pending) and its owner |
| `COORDINATION.md` `STATUS.md` `DECISIONS.md` `HANDOFF.md` | Process files |
| `qa/CHECKLIST.md` | Claims and technical QA before release |

Recordings of real people are **never** committed. They go to the shared drive (see the recording package §6).
