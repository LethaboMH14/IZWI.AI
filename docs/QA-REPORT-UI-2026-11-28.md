# UI and QA report, 28 November 2026 (design/ui-pass)

Branch `design/ui-pass`, from `qa/full-pass`. Critique: `design/critique/UI-CRITIQUE.md`. Before and after screenshots: `design/critique/before/` and `design/critique/after/`.

## Checks

| Check | Result |
|---|---|
| `npm run typecheck` | Passed, 0 errors |
| `npm run lint` | 0 errors, 8 warnings (unchanged from the base) |
| `npm test` | 49 files, 417 tests, all passed |
| `npm run build` | Passed (the existing env.ts tracing warning remains) |
| Capture of all routes at 1440 and 375 px | 46 captures, every route the expected status; only the deliberate 404 page returned 404; no document-level sideways scroll |
| Interaction smoke, flat studio at 375 px | Transcript, Captions and Notes tabs each open; 5 transcript rows visible on Transcript |
| Interaction smoke, synthetic member | Stories opens; no "New story" link |

## What changed

- **Type:** every product font size now sits on the six-step scale (12, 14, 16, 20, 28, 40 px) through `--z-type-*`. The editor's approved sizes moved to the nearest step (11→12, 13→14, 18→20, 22→20, 32→28). **Needs Lethabo's sign-off.** The landing hero keeps its approved larger clamp (up to 80 px on large screens, 64 px on phones).
- **Spacing:** off-grid gaps, padding and margins snap to the 4 px scale (644 declarations). Negative values, `auto`, `calc`, `clamp` and `var` values were left as they were.
- **Radii:** the public panels, cards and controls use the approved 12/10/8, with the nested 4 px radius for clips.
- **Landing:** removed the staggered offsets in the three-column "Mzansi" row, the rotated sample frame, the blur on the floating status cards, and the radial gradient on the closing band. Section corners go from 56 px to 12 px.
- **Design system page:** the type specimen shows the new scale.
- **Design doc:** `docs/design/DESIGN-SYSTEM.md` §3, §3a and §4 record the proposed values and say they are pending approval.
- **Copy:** searched for filler words ("seamless", "magic", "unlock", "effortless", "powerful", "revolutionary", "supercharge"): none in the app's copy. Product names are consistent ("story" is used everywhere in the UI).

## New tests

- `tests/clips.test.ts`: sentence splitting, limits, no overlaps, and measured reasons.
- `tests/interop.test.ts`: timecodes (nearest frame at 25 fps), the EDL header, and in and out points.
- `tests/rights-gate.test.ts`: the declaration gate, a waiting person, a person outside the clip, a whole-recording person, the latest answer (granted then revoked), and consent wording.
- `tests/contrast.test.ts`: WCAG AA for nine text pairs on public and studio surfaces. All pass.

## Known and open

- **THREE.Clock warning:** it comes from `@react-three/fiber` (inside the 3D library), not from our code. It is not fixed here; it needs a dependency upgrade, which is a separate change.
- **Hydration mismatch:** the capture did not reproduce it on the routes walked. Not fixed; to reproduce it, record the browser console on each route.
- **Flat studio at 375 px:** an empty band sits above the bottom tab bar. It's cosmetic and not fixed.
- **The API matrix** in `tests/api-routes.test.ts` covers all 27 route files; no new route tests were added in this pass.
- **Not built in this pass:** a Playwright suite that presses every control for owner, admin and member with flags off and on. `@playwright/test` is used by the capture script but is not declared in `package.json`. Not done.
- **Not tested:** real phones, real providers, live R2, and any signed-in hosted Vercel deployment.
- **Backend modules still without a direct test:** `voice`, `env`, `assistant-store`.
