# IZWI AI interface critique

**Baseline:** local `design/ui-pass` worktree, synthetic account/project fixtures, 28 Nov 2026. The screenshots are evidence of the current rendered build; sample media and account records are synthetic and are not product claims.

## Scope and evidence

Captured 92 page/viewport combinations in `design/critique/before/`: landing, sign in/create account, five onboarding steps, Stories, Flat Studio, Spatial Canvas, Story Room, Localise, Protect, Publish, Earn, Classic Studio, Run On, Team, Extensions, Analytics, Trust, Design/System, guest consent, review, public listing and 404 at 1440, 1280, 1024 and 375 px. Each returned the expected route status; the 404 returned 404. The document width did not exceed the viewport in any capture. That measurement does not detect content clipped inside scroll panels or controls.

The QA report dated 28 Nov already records the studio title truncation/mobile rail cue, Spatial prompt bar overlap, transcript scrolling check and public listing copy order. Those remain previously known issues and are not presented as new discoveries here. The following findings come from the new screenshots or code inspection.

## What is working

- The approved charcoal/ivory/amber palette and warm South African creator voice are recognizable and coherent. Naledi’s sample visual is consistent with the approved fictional host direction.
- Spatial Canvas reads as a different, map-like workspace; its dark 3D surface is correctly scoped to that view.
- Public clip details and enquiry fields are legible and usable at 375 px, and the simulated licence status is explicitly identified as synthetic.
- The mobile landing page reflows to one column without document-level sideways scrolling.

## Priority findings

### P0 — Flat Studio is not usable at phone width

At 375 px, the project/preview and transcript are forced into a two-panel row; the transcript column collapses to a few dozen pixels, wrapping each character vertically. Scene thumbnails and timeline tracks are clipped inside their own containers. See `before/flat-studio-375.png`; rules in `web/src/app/flat.css` lines 5–32 and 202 onward. This contradicts the design system’s one-column phone flow and makes transcript editing unusable. Rebuild the phone layout as stacked preview, tabbed transcript/captions/notes, agent card and scenes; give each scrolling region a deliberate height and keep the timeline accessible as a separate mode or horizontally scrollable region.

### P0 — The main studio’s screen is dominated by inert empty space

At 1440×900, the Flat Studio allocates a full 360 px agent panel that only says “The assistant is switched off,” while the preview panel has large unused space below a small video and thumbnails. This compresses the transcript and timeline despite both being core editing tasks. See `before/flat-studio-1440.png`; grid definitions in `flat.css` lines 5–30. A dormant assistant should collapse to a compact, opt-in panel and the freed width should go to the editor/transcript; the preview should use available area without distorting its aspect ratio.

### P1 — The landing page is too long and repeats oversized editorial treatment

At 375 px the landing capture is 7,817 CSS pixels tall (`before/landing-375.png`). Oversized serif headings, spacious section padding, a large decorative voice strand and repeated large cream cards create a long scroll before the user reaches pricing and the final action. Desktop hero rules use 52.8–105.6 px headings, while section headings reach 70.4 px (`web/src/app/globals.css` lines 154–169, 181–221). Keep Fraunces and the warm identity, but limit display type to the hero and a few section anchors; use smaller, consistent section headings, less vertical padding and compact evidence blocks. Retain the Naledi hero image and actual feature details.

### P1 — Typography and surfaces split into two competing systems

The signed-off editor tokens specify compact Instrument Sans UI (11–14 px), Fraunces only for short titles, a 4 px spacing scale and restrained radii (`web/src/app/tokens.css`; `docs/design/DESIGN-SYSTEM.md` §§3–4). The public/older interface instead uses root 16 px body text, 1.15 rem transcript text, 32–105.6 px headlines, pill-shaped buttons, broad gradients and 24–56 px panel corners (`web/src/app/globals.css` lines 34–86, 154–221). This makes the same product feel like a marketing template on public pages and a dense tool in the studio. Establish shared semantic type/space/radius tokens and use explicit display exceptions for the landing hero rather than allowing arbitrary sizes.

### P1 — Repeated cards dilute hierarchy

Stories at 375 px presents one story card amid a mostly empty page (`before/stories-375.png`). Public landing repeats rounded card treatments for market, process, feature and pricing sections (`before/landing-375.png`). In tool screens, ivory panels already provide strong grouping; adding nested cards and nested outlines inside them creates too many boxes. Reserve card borders for independently actionable items; use rows and section dividers for related facts. Keep existing functions and content.

### P1 — The decorative voice strand competes with the sample

At 375 px, the strand crosses behind the hero sample and continues as high-contrast orange and charcoal strokes around the floating status pills (`before/landing-375.png`). Its full-section canvas and fallback line are defined in `web/src/app/globals.css` lines 167–169, with the rendering in `web/src/components/Strand.tsx`. Keep it as a brand detail, but reduce its contrast and movement on narrow screens so the portrait, action and status labels lead. The Agency amount is correctly grouped as `R1 499`; retain South African currency formatting and the adjacent proposed-price disclosure.

### P2 — Shared navigation consumes scarce phone space

On 375 px, the fixed bottom navigation overlays the working canvas edge; the black “N” Next development indicator also overlaps controls in local captures. See `before/flat-studio-375.png`, `before/stories-375.png`, `before/publish-375.png`. The indicator is dev-only and will not ship, but the app must reserve bottom safe-area space for its own navigation and focused controls. The route’s document width being correct does not prove that buttons are unobscured.

### P2 — Design evidence is hard to distinguish from finished product behavior

The landing page labels the product a “Concept preview” only in its final footer (`page.tsx` around line 172), after feature and pricing claims (`before/landing-375.png`). Move status close to the first CTA and clearly distinguish working features, staged concepts and proposed prices in the relevant sections. Keep the truthful language that is already present; do not invent availability, customers, adoption or performance claims.

## Style inventory and proposed direction

The CSS mixes tokenized editor styles (`--z-text-*`, `--z-s*`, `--z-r-*`) with legacy root-relative values and one-off pixel values. A declaration scan across `web/src/app/**/*.css` and `web/src/components/**/*.css` found:

| Property | Declarations | Distinct literal values |
|---|---:|---:|
| font size | 381 | 93 |
| font weight | 135 | 6 |
| line height | 45 | 20 |
| letter spacing | 30 | 12 |
| gap | 385 | 74 |
| padding | 370 | 207 |
| margin | 138 | 62 |
| border radius | 317 | 33 |
| box shadow | 80 | 38 |
| backdrop filter | 5 | 4 |

This literal-value inventory counts token aliases as values and does not expand shorthands. The most repeated font sizes include `0.85rem` (26), `0.9rem` (25), `0.92rem` (23), `var(--z-text-meta)` (24), and `var(--z-text-ui)` (20). Repeated gaps include `var(--z-s4)` (42), `0.5rem` (40), `0.6rem` (29), and `0.4rem` (25). Border radii include `var(--r-m)` (56), `999px` (42), and `var(--r-s)` (29). `globals.css` uses a 16 px root with root-relative utility text and several clamp-based display sizes; the studio styles use a separate compact scale. This spread supports centralizing semantic tokens while preserving deliberate display exceptions.

Proposed direction:

- Preserve charcoal shell, ivory work surfaces, amber actions, approved typography and Naledi.
- Use a six-step product type scale (12, 14, 16, 20, 28, 40 px) for shared UI; 56–72 px may remain a landing-only hero exception. Keep readable 16 px form labels/body text on public forms.
- Consolidate spacing to 4, 8, 12, 16, 24, 32, 48, 64 px; use 12 px panel, 8 px control and 4 px nested clip radii. Pills stay limited to status and compact filters.
- Prefer flat grouped panels, row separators and one clear selected state. Keep decorative shadows/gradients to the landing image composition and Spatial scene.
- At phone widths, stack task regions, preserve transcript minimum width, and account for the bottom navigation and safe-area inset.

## Limits

These screenshots are a visual and route-load baseline, not proof that every control works. The browser emitted a React hydration attribute mismatch during one capture, and Three.js emitted a deprecated `THREE.Clock` warning; investigate both during functional QA. A complete keyboard-only, screen-reader and cross-browser audit remains necessary before claiming accessibility or broad browser compatibility. Existing design approval files referenced by the repository live outside this worktree and were not modified.

## Post-fix evidence

After the CSS and landing-copy changes, 46 captures cover the same 23 routes at 1440 and 375 px in `design/critique/after/`. Every route returned its expected status; only the intentional invalid route returned 404. The matrix found no document-level horizontal overflow. At 375 px, Flat Studio now presents the preview, four tabs, assistant status and scene rows in one column; its Transcript tab displayed five fixture rows, Captions displayed the review state and Notes displayed its empty state. These interactions ran against explicitly synthetic local fixtures. A synthetic member opened Stories and did not receive a “New story” action.

The phone smoke check was targeted rather than exhaustive. It did not exercise every button, menu, keyboard shortcut, screen reader, browser engine, or real provider response. An isolated run with `IZWI_FLAG_ASSISTANT=1` returned 200 for the assistant route and showed the composer disabled with “No assistant provider is ready”; no provider key or external call was used. That confirms the flag-on empty-provider state only. The 404 page and remaining owner/member/guest actions still need a dedicated functional pass before claiming full frontend QA coverage.
