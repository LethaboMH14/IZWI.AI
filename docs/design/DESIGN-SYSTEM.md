# IZWI AI design system
Status: v2, 26 Nov 2026. Replaces the v1 baseline. Authority, in order:
1. the two approved images, `screen mock ups/00-grounding/` (outside the repo): grounding A, Professional Studio (the Flat Studio), and grounding B, Spatial Story Canvas;
2. the approved mockups 001–030;
3. the 60-screen masterplan from the design chat;
4. external references (CapCut, Descript, Runway, Frame.io, Linear, Lusion, Spline);
5. HCI evaluation.

An image that drifted from the originals never becomes a reference.

Lethabo approved the theme rule on 26 Nov: charcoal shell, ivory working panels, amber selection; dark only for the 3D Spatial Canvas and Story Room; no purple; no dark Flat Studio.

## 1. Identity
- **Product:** IZWI AI, by Team Sonar. **Stages:** Create · Localise · Protect · Publish · Earn.
- **Wordmark:** seven amber voice bars (heights 8, 16, 24, 33, 24, 16, 8) beside "IZWI AI" set in Fraunces 600. It works at 16, 32 and 180 px and in one colour.
- **Character:** Naledi, the fictional host (short natural hair, ochre jacket, black shirt, headphones, warm studio). `assets/current/presentation/slides/03.png` is the reference. Any simulated media keeps the `sim_` prefix in its label.

## 2. Surfaces and colour
Values were measured from grounding A with `sample_colors.py` (median of 7×7 patches). They are tokens in `web/src/app/tokens.css`.

| Token | Hex | Use |
|---|---|---|
| `--z-shell-0` | `#181514` | stage bar, deepest shell |
| `--z-shell-1` | `#1e1a1a` | icon rail |
| `--z-shell-2` | `#241d1b` | header |
| `--z-shell-3` | `#24211f` | project panel |
| `--z-shell-page` | `#2a2522` | gutter between panels |
| `--z-shell-text` | `#eee3ce` | text on shell |
| `--z-shell-muted` | `#a9a294` | secondary text on shell (6.2:1 on `--z-shell-3`) |
| `--z-ivory-0` | `#fcf4e9` | transcript, brightest working panel |
| `--z-ivory-1` | `#fbf0e4` | agent panel |
| `--z-ivory-2` | `#f8ebdc` | editor header and preview frame |
| `--z-ivory-3` | `#f8e9d8` | timeline |
| `--z-ivory-4` | `#f4e3cf` | track headers, sunken rows |
| `--z-ink` | `#211a14` | text on ivory |
| `--z-ink-muted` | `#6f6253` | secondary text on ivory (5.5:1) |
| `--z-amber` | `#e79922` | primary action fill, playhead, selection |
| `--z-amber-ink` | `#241a0e` | text on amber (7.4:1) |
| `--z-amber-text` | `#8a520a` | amber text on ivory (5.2:1) |
| `--z-amber-tint` | `#fcdea8` | selected row |
| `--z-amber-hover` | `#f3d299` | hovered menu row |
| `--z-moss` | `#3f6b1e` text, `#54a213` icon, `#eef0cc` tint | ready, granted, approved |
| `--z-clay` | `#974a3b` text and icon, `#f3d6cc` tint | held, blocked, declined, failed |
| `--z-gold` | `#d3a96f` | proposal and draft badges, dashed outlines |
| `--z-wave-original` | `#e1918a` | original range in a proposal |
| `--z-wave-proposed` | `#91be63` | proposed range in a proposal |

Status is never colour alone: each state also has a word, an icon or a pattern (held clips are hatched).

**Spatial scene (dark, 3D only).** Night backdrop `#0b0907`. Glass cards are `rgba(24,20,17,.78)` with a 1 px `rgba(240,190,120,.18)` border. Selected glow `#efb54b`, idle edge `rgba(231,153,34,.35)`, lit edge `#efb54b`.

## 3. Type
- **Display:** Fraunces, upright, `SOFT 0, WONK 0`, weight 600 to 650. Used for:
  - scene and page titles;
  - the agent panel title;
  - the proposal title;
  - big durations in a proposal.
- **UI:** Neue Helvetica, through a Helvetica stack (`"Neue Helvetica", "Helvetica Neue", Helvetica, Arial`). **Proposed 28 Nov 2026, pending Lethabo's approval:** replaces Instrument Sans (OFL, §9). Neue Helvetica is a licensed Monotype font, so it is not shipped; it shows where installed and Arial shows elsewhere.
- **Mono:** Geist Mono (OFL), tabular, for every timecode, duration and count shown in a column.
- No italics anywhere in the chrome. All faces are self-hosted through next/font, with no external font links.

**Proposed, 28 Nov 2026 UI pass: pending Lethabo's approval.** The 26 Nov values were: micro 11/14, meta 12/16, ui 13/18, body 14/20, title-s 18/22, title-m 22/26, title-l 28/32, figure 32/34. Every role now sits on the six-step scale in §3a below; the mapping is in `web/src/app/tokens.css`.

| Step | Size / line | Face | Use |
|---|---|---|---|
| micro | 12/16 | sans 500 | rail labels, chips, track tags |
| meta | 12/16 | sans 400 | secondary rows, file sizes |
| ui | 14/20 | sans 400/500 | default UI text, buttons, menus |
| body | 14/20 | sans 400 | transcript lines, form fields |
| head | 14/18 | sans 600 | panel headers |
| title-s | 20/24 | Fraunces 650 | agent panel title, card titles |
| title-m | 20/24 | Fraunces 650 | proposal title |
| title-l | 28/32 | Fraunces 650 | scene or page title |
| figure | 28/32 | Fraunces 650 | 36s → 34s |
| time | 12/16 | mono 500 | timecodes, durations |

**§3a Six-step scale (proposed):** 12, 14, 16, 20, 28 and 40 px. Product text uses these steps only. The landing hero is the only exception: up to 80 px on large screens and 64 px on phones. Relative sizes (`em`) remain for inline emphasis, and the 3D labels in the Story Room keep their own sizes on the dark scene.

Public and account screens share a compact semantic scale defined in `tokens.css`: 12, 14, 16, 20, 28 and 40 px. The 16 px role is the minimum for long-form public form copy; 40 px is the normal page heading. Landing hero headings may grow to 80 px on large screens and 64 px on phones. Marketing sections use 20–40 px. Avoid introducing another one-off size when a role fits.

## 4. Space, shape, depth
Public and account layouts may use 48 and 64 px as section spacing; keep them out of dense editor chrome.
- **Spacing:** a 4 px base: 2, 4, 6, 8, 12, 16, 20, 24, 32. Public and account layouts add 48 and 64. Off-grid gaps, paddings and margins (0.4rem, 0.6rem, 1.2rem and similar) snap to the nearest step in the 28 Nov UI pass (proposed, pending approval).
- **Nested radius (proposed, 28 Nov):** 4 px for a clip or thumbnail inside a panel (`--z-r-nested`).
- **Rows:** dense list rows are 32 px; transcript rows are at least 40 px.
- **Touch:** targets are at least 44 px on touch devices.
- **Radii:**

| Element | Radius |
|---|---|
| panels | 12 |
| cards and video | 10 |
| buttons and inputs | 8 |
| menus | 8 |
| chips | pill |
| timeline clips | 6 |

- **Depth:**
  - panels sit on `--z-shell-page` with a 1 px inner line and a soft 0 8 24 rgba(0,0,0,.25) shadow;
  - menus and popovers use 0 12 32 rgba(0,0,0,.35);
  - nothing glows on ivory; glow belongs to the dark spatial scene.

## 5. Layout
- **Desktop shell:** icon rail 72 px · project panel 272 px · work area · agent panel 360 px. The header is 48 px and the stage bar 44 px.
- **Flat Studio at 1440×900:** the editor and transcript sit side by side over the timeline, and the agent panel spans the full height on the right.
- **At 1280 px or less:** the project panel collapses to a drawer.
- **At 1024 px or less:** the agent panel becomes a drawer.
- **At 767 px or less (phone):**
  - one column: preview, then tabs (Edit · Transcript · Captions · Notes), the agent card, then scenes;
  - a bottom tab bar (Stories · Studio · Outputs · More);
  - Spatial becomes a vertical 2D chain.

## 6. States (every object, every view)
| State | Treatment |
|---|---|
| Default | ivory or glass card, 1 px line |
| Hover | lifts 1 px, tint, quick actions appear (also on keyboard focus) |
| Selected | 2 px amber ring, amber tint, inspector follows |
| Multi-selected | ring plus a check badge; group toolbar shows "N selected" |
| AI proposal | dashed gold outline, "Proposal" badge, not yet applied |
| Held | clay hatch, "Held" pill, the reason in the tooltip |
| Busy | progress with a percentage from `job.progress`, never a fake spinner time |
| Disabled | 45% opacity, reason in the tooltip |
| Focus | 2 px amber outline, 2 px offset, always visible on keyboard |
| Empty / loading / error | each panel has its own, written per §8 |

## 7. Interaction grammar (masterplan §5)
| Input | Result |
|---|---|
| Click | select; the inspector follows |
| Double-click | open the object's editor |
| Right-click or ⋯ | context menu for that object type |
| Shift-click | range select |
| Ctrl/Cmd-click | add to or remove from the selection |
| Drag | trim, move or connect; every drag has a keyboard or menu equivalent |
| Esc | close menus, then clear the selection |
| Space | play or pause; I and O set in and out points; Enter makes a scene from them |
| Apply / Dismiss | AI changes are proposals until applied; apply updates every view |

## 8. Words
- **Buttons are verbs:** Apply edit, Dismiss, Render vertical, Request consent, Add scene, Export.
- **Panels are nouns:** Transcript, Scenes, Outputs, People.
- **Case:** sentence case, with no full stop on labels.
- **States over sentences:**
  - counts: "9/14 reviewed", "1 held";
  - status words: Ready, Queued, Rendering 42%, Failed, Held, Draft, Approved, Requested, Granted, Declined.
- **Where help goes:** only in tooltips, empty states and errors.
  - An error says what happened and what to do: "Render failed. Try again".
  - An empty state says what goes here and offers the one action that fills it.
- **Honesty:**
  - Never "Published" unless recorded as posted; say Export or Mark as posted.
  - No money unless a real payment exists.
  - No quotas that don't exist.
  - "IZWI signed provenance (not C2PA)".
  - Machine translations stay Draft until a person approves each line.

## 9. Type specimen (26 Nov 2026)
Candidates were set at 11–32 px on the measured surfaces, served through the dev server so the real fonts loaded.

| Role | Candidates | Choice | Why |
|---|---|---|---|
| UI sans | Instrument Sans, Schibsted Grotesk, Hanken Grotesk, Geist, Onest | **Instrument Sans** | Its slightly narrow width fits the dense editor chrome. It stays crisp at 12–13 px and isn't a default AI-app face. |
| Mono | Geist Mono, JetBrains Mono, Martian Mono, IBM Plex Mono | **Geist Mono** | It is compact enough that "00:00 – 00:48" fits narrow columns. Martian Mono wrapped. |
| Display | Fraunces | **Fraunces, upright** | It matches the grounding headings and was already the brand face. |

All three are self-hosted through next/font, so the external Fontshare link (Switzer) is gone.

A Claude Design system mirrors this file (tokens, guideline sections and live component previews), along with the approved artboards for the Flat Studio and Spatial Canvas. Both are private to Lethabo; this file is the copy code reads.

## 10. Motion
| Use | Duration |
|---|---|
| hover | 120 ms |
| menus | 160 ms |
| panels | 220 ms |
| view switch and camera | 450–700 ms |

- **Easing:** `cubic-bezier(.2,.7,.2,1)`.
- **Libraries:** `motion` (LazyMotion) for panels; React `<ViewTransition>` for route changes.
- **3D:** idles at `frameloop="demand"`.
- **Reduced motion:** opacity fades of 120 ms or less only, no camera flights, and 3D replaced by the static backdrop.

## 10b. Open-source building blocks (prior art first; checked 26–27 Nov 2026 with `gh api` and `npm view`)
Each library is installed, then restyled to these tokens rather than rebuilt.

**Used:**
| Library | Licence · last push | What it does here | README, quoted |
|---|---|---|---|
| @xyflow/react 13.0.3 | MIT · 2026-11-23 | the Spatial Canvas graph: selection, box select, pan, zoom, minimap | — |
| @react-three/fiber 9.8.2, @react-three/drei 10.7.9 | MIT · 2026-10-21 / 2026-11-17 | the night backdrop and the Story Room (peer React <19.4; the app runs 19.3) | — |
| @base-ui/react 1.9.0 | MIT · 2026-11-26 | menus, context menus, tooltips, tabs, slider | — |
| zustand 5.1.0 | MIT · 2026-11-23 | the project store (also a dependency of @xyflow/react) | — |
| motion | MIT · 2026-11-26 (already a dependency) | panel and view motion | "A modern animation library for React and JavaScript" |
| cmdk 1.1.1 | MIT · 2025-10-29 | a ⌘K command palette of real actions | "⌘K is a command menu React component that can also be used as an accessible combobox" |
| @phosphor-icons/react, three | MIT (already dependencies) | icons, 3D | — |

The repository description is quoted where the README span was not captured. cmdk's peer range is React ^18 || ^19.

**Patterns only (not installed):**
- **OpenCut** (MIT · 2026-09-24): persistent asset, preview, properties and timeline regions; the keyboard map. It is a whole app with its own stores, so we take the patterns rather than the code.
- **Omniclip** (omni-media/omniclip, MIT · 2026-11-24): built with Lit web components, not React, so patterns only.

**Rejected, with reasons:**
- **wavesurfer.js** (BSD-3 · 2026-11-24): it owns its own scroll container and canvas, so it cannot share one time scale and scroll with the frame and caption lanes. The app already has precomputed peaks.
- **@xzdarcy/react-timeline-editor** (MIT · 2026-01-25): an animation keyframe-row model ("used to quickly build a timeline animation editor") with no media, waveform or caption lanes.
- **openvideodev/react-video-editor** (formerly designcombo): no licence asserted (NOASSERTION), and it is built on Remotion.
- **Remotion** (custom licence): its terms limit free use to small teams. Rendering stays on the existing FFmpeg worker.

## 11. Sources and limits
- **Measured from the images:** hex values and layout proportions.
- **Decided:** contrast ratios are computed, not estimated.
- **What a raster cannot show:** a raster reference is not an accessible implementation, so every screen is checked in a browser at 1440×900 and 390×844, with keyboard and screen-reader passes.
