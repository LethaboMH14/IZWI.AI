# Design critique, round 2 (20 Nov 2026)

Captured from the running app after the three design lanes (studio; consent, Protect and Publish; home, listing and Run on). Each part was reviewed read-only by an AI reviewer that did not build it. Screenshots: `mockups/real-*.png`, `mockups/laneB-*.png`, `mockups/laneC-*.png`.

## Fixed after this review (same day)
- Canvas no longer shows "Checking the planner" while loading; it shows only "You review before anything runs" until the mode is known.
- Home: the collapsed new-story panel shows a "Choose video or audio" button.
- Protect stage hint shortened to "All consent recorded", so it no longer truncates.
- Publish: the settings summary is labelled "New render:", separate from existing renders.
- Consent: the name field says "Type your name to answer, yes or no".
- Run on: the device check says its figures are browser readings, not a promise that a model will run.

## Still open
- Phone: the story title is a single-line editable input and truncates; the stage rail needs a visible cue that it scrolls.
- Phone canvas: the prompt bar and suggestion chips cover part of the graph; make the composer collapsible with scroll clearance.
- Fixed bottom navigation on phone can cover the end of some pages; add a bottom inset.
- Listing: add a short description of the clip, and show permitted use and term before the enquiry form on phone.
- Run on: label what the worker storage figure measures.

---

## Studio and consent (reviewer A, read-only)

## Studio canvas — desktop and phone

- **Graph readability — PARTLY FIXED:** Desktop shows full titles in Source → Clips → Outputs columns, with connectors between cards. On phone, the visible graph becomes a vertical list; its relationships are not shown in the captured area.
- **Composer clarity — PARTLY FIXED:** The placeholder is specific and the phone says “Rule-based planning · You review before anything runs.” Desktop instead says “Checking the planner,” leaving the active mode unclear.
- **New:** On phone, the composer and suggestion chips cover much of the canvas. **Fix:** Make the composer collapsible and reserve bottom space for it so content can scroll fully into view.

## Create / transcript editor — desktop and phone

- **Spelling tool priority — FIXED:** “Teach spelling” is a compact action above the transcript rather than a large intervening form.
- **Workspace layout — PARTLY FIXED:** Desktop gives the transcript a substantial column and groups playback with the waveform; “How to trim” is a short disclosure. Independent scrolling, resizing and sticky behavior cannot be established from the screenshots.
- **New:** On phone, the story title and later workflow stages are cut off. **Fix:** Allow the title to wrap and make horizontal stage navigation visibly scrollable, with a cue that more stages exist.

## Protect — desktop

- **Consent scope — FIXED:** “Recorded permission” is plain text, while the selector is explicitly labelled “Scope for a new request.”
- **Declaration density — FIXED:** A short declaration contains one ownership-verification disclaimer, followed by the recorded date.
- **New:** The Protect stage status is truncated to “Consent and declaration re…”. **Fix:** Use a shorter complete status or allow it to wrap.

## Publish — desktop

- **Manual posting clarity — FIXED:** The opening copy says “Render and download. Post it yourself,” and “Mark as posted” is identified as a creator report.
- **Caption control ambiguity — FIXED:** “No captions” is selected, no checked burn-in box is visible, and the summary says “Burn-in off.”
- **New:** The ready render has English captions burned in, while the current form defaults to no captions; the visual proximity could make the two states easy to conflate. **Fix:** Label the upper summary “New render settings” and the lower card “Existing render.”

## Guest consent — desktop and phone

- **Permission summary — FIXED:** Requested uses are listed separately, with the withdrawal consequence and exact recorded statement visible.
- **Answer visibility — FIXED:** “Yes, I agree” and “No” appear before the preview, with a “See where you appear” link; both choices are similarly prominent.
- **New:** “Type your name to answer” appears to apply to both choices, but the screen does not explain whether a name is required to decline. **Fix:** State the requirement beside the field and make the decline path’s requirements explicit.

## Highest-impact remaining fixes

1. **Stop the phone canvas composer covering work:** collapse it and provide sufficient scroll clearance.
2. **Make the planner mode unambiguous on desktop:** show the actual mode and review requirement when available.
3. **Improve mobile orientation:** show the full story title and indicate that the five-stage navigation continues horizontally.

**Judge-showing readiness: 7/10.** The core journey is clearer and the consent and manual-export language are much stronger, but the mobile canvas obstruction and unresolved workspace behavior deserve attention before a confident live demonstration.

This is a screenshot-only assessment of a synthetic test episode. It cannot establish keyboard access, measured contrast, motion, actual control behavior, independent scrolling or real-device usability. Home, Run on and the public licence listing were not shown, so their round-one items remain unassessed.

---

## Home, Run on and listing (reviewer B, read-only)


## Home — desktop
- **Card hierarchy and entry action — FIXED.** The story has a clear title and “Open story →” link; the status is one concise line.
- **New-story upload affordance — PARTLY FIXED.** “Start a new story” is visible, but the dashed panel shows no “Choose video or audio” button.
- **New problem:** The story title says “synthetic test,” but the card gives no visible cue explaining what that label means. Add a short, plain-language note if judges may mistake it for creator content.

## Home — mobile
- **Card hierarchy and entry action — FIXED.** The story image, title, status, and “Open story →” are easy to find in sequence.
- **New-story upload affordance — PARTLY FIXED.** The dashed panel is visible, but its text describes dropping a file without showing a tap-to-choose action.
- **New problem:** The bottom navigation overlaps the visible upload panel in this capture. Give the page enough bottom inset so content can scroll clear of the fixed navigation.

## Run on — desktop
- **Unscanned estimates and compatibility — PARTLY FIXED.** “Not checked yet” and a warning about what the browser cannot measure are visible; this screenshot does not show the catalogue’s estimate labels or post-check compatibility state.
- **Device-check panel before model details — FIXED.** “Check this device” leads, and model details are collapsed below it.
- **New problem:** The worker’s “7.7 MB” storage figure appears without context. Label what it measures and whether it is current or cumulative.

## Run on — mobile
- **Unscanned estimates and compatibility — PARTLY FIXED.** The result shows device details and available space, but this still does not show the catalogue’s estimate labels or how compatibility is determined.
- **Device-check panel before model details — FIXED.** Device results lead; model details remain collapsed.
- **New problem:** “8 GB or more” and “10.7 GB available to this site” could be mistaken for a guarantee that a model will run. Add a brief, visible note that these figures are browser-reported and do not guarantee model compatibility.

## Public licence listing — desktop
- **Video preview — PARTLY FIXED.** A representative frame and prominent play button replace the empty-looking player, but the video itself occupies only part of the wider preview panel.
- **Details before the enquiry form — PARTLY FIXED.** A “Clip details” section is visible below the player, but the screenshot does not show whether it includes the requested terms or precedes the form.
- **New problem:** “Start before you are ready” does not identify the clip’s subject. Add a descriptive title or short summary near the heading.

## Public licence listing — mobile
- **Video preview — PARTLY FIXED.** The poster and play button are prominent, but the preview fills a narrow portrait player; the frame’s top and bottom are blurred extensions.
- **Details before the enquiry form — PARTLY FIXED.** Duration and a caption-languages heading begin below the player; permitted use and term are not visible.
- **New problem:** The clip details continue below the captured fold, with the fixed bottom control potentially covering content. Add clear page spacing and keep the enquiry context easy to reach.

## Highest-impact remaining fixes
1. Add a visible **Choose video or audio** action to the new-story panel on both home layouts.
2. Clarify the device-check limits and label model memory figures consistently, including after a check.
3. Make the licence listing’s subject, permitted use, and term easy to see before any enquiry action.

**Judge readiness: 7/10.** The home and device-check screens now communicate their main actions clearly, and the listing has a real preview; upload choice and complete licensing context still need clearer evidence.

**Cannot judge from these screenshots:** keyboard access or focus order, measured color contrast, motion and reduced-motion behavior, or whether the visible controls work.