# Design critique, round 1 (AI design reviewer, read-only, 2026-11-20)

Screens: design/mockups/real-*.png, captured from the running app with real data on the synthetic episode.

## 1. Home

1. **The existing story looks like a dashboard summary, not something to open.** The waveform, three badges and oversized “1” compete with the title, while there is no clear entry action.  
   **Fix:** Make the entire card a link with a visible **Open story →** affordance. Remove the large render count and keep one concise status line beneath the title.

2. **“Start a new story” resembles a drop zone, but gives no visible way to choose a file.** The dashed border implies drag-and-drop; a user on a phone needs an obvious tap target.  
   **Fix:** Add a high-contrast **Choose video or audio** button inside the panel, with “or drag and drop” as secondary desktop copy. Keep the upload-resume claim only if that behavior is supported.

## 2. Studio canvas

1. **The graph is difficult to read and wastes its largest surface.** Truncated clip names, tiny timestamps and lines crossing behind nodes make the relationships harder to understand than a simple list.  
   **Fix:** Use a three-column layout—**Source → Clips → Outputs**—with full titles in 200–240px-wide nodes. Route connectors between fixed column edges and prevent them from passing behind cards.

2. **The prompt composer is visually dominant but operationally vague.** It looks like the primary way to make something, while the small disclaimer says no planning model is connected and every plan needs approval.  
   **Fix:** Put the current mode above the input in normal-size text: **Rule-based planning · You review before anything runs**. Change the placeholder to a concrete request such as “Describe the clips or captions you want.”

## 3. Create / transcript editor

1. **The transcript correction tool takes priority over the transcript itself.** A large yellow form sits between the “Transcript” heading and the content, despite being relevant only when correcting a word.  
   **Fix:** Move **Teach spelling** into a compact action above the transcript or reveal it after text selection. Give the transcript the full height of the right column.

2. **The editing workspace is cramped and vertically misaligned.** The large video, waveform and instruction paragraph compete with a narrow transcript; the transcript continues below the viewport with no obvious independent workspace boundary.  
   **Fix:** Use a resizable two-column editor with a `minmax(0, 1fr)` split and independently scrollable transcript. Keep playback and waveform together in a compact sticky panel, and move trimming instructions behind a short **How to trim** disclosure.

## 4. Protect

1. **Consent scope is contradictory on the same person card.** The record says “Scope: appearance,” while the adjacent selector displays “Appearance, voice and words.” It is unclear whether the selector shows the existing permission or a proposed new request.  
   **Fix:** Separate the immutable record from the action: show **Recorded permission: Appearance** as plain text, then label the selector **Scope for a new request** beside **Ask again**.

2. **The declaration repeats its disclaimer and consumes too much space before the people list.** The italic quotation and green status line both repeat that IZWI does not verify ownership.  
   **Fix:** Reduce the card to the declaration, followed by one compact line: **Recorded 20 Nov 2026 · Your declaration; ownership not verified.** Use regular body text rather than a long italic block.

## 5. Publish

1. **“Publish” promises a destination action, but the visible workflow renders a file for manual download.** The fine print later says IZWI does not post for the creator.  
   **Fix:** Rename the stage **Export** or make the distinction explicit at the top: **Render and download. Post it yourself.** Retain a separate posted status as a user-reported record.

2. **Caption controls show an ambiguous, apparently disabled checked box beside “No captions.”** A checked “Burn captions into the video” conflicts with the current selection even if it is technically inactive.  
   **Fix:** When **No captions** is selected, hide or uncheck the burn-in control. Show it only after a caption track is chosen, and make the selected track and output format visible in the render summary.

## 6. Run on

1. **The table presents unscanned estimates as if they were a device compatibility tool.** “Scan first” repeats on every row, while memory figures mix stated requirements and estimates without enough context to compare them safely.  
   **Fix:** Before scanning, replace the repeated pills with one table-level message: **Device not checked**. Label the column **Estimated model memory**, distinguish sourced figures from estimates in each row, and show compatibility only after the check returns enough information.

2. **The page leads with model names and licences before answering the creator’s question: what can I run?** The introductory copy promises a simple device check, but the dense table appears first.  
   **Fix:** Put a compact device-check panel above the catalogue with **Check this device** and an unambiguous **Not checked yet** state. Place model details in an expandable section below the result, including what the check can and cannot determine.

## 7. Public licence listing

1. **The video is visually disconnected from the listing and appears as a black, empty rectangle.** It is narrower than the content column and gives no useful preview before playback.  
   **Fix:** Align the player to the full content width, preserve its actual aspect ratio, and show a representative poster frame with a prominent play button. Provide a visible fallback if the preview cannot load.

2. **The enquiry form arrives before the visitor has enough context to decide whether to enquire.** The page gives a title and a short terms sentence, but no visible clip duration, description or indication of what information the creator needs.  
   **Fix:** Add a compact details block above the form: **duration, available caption languages, permitted use and term**, populated from the listing. Label the form action **Send licence enquiry** and keep the no-payment explanation immediately beside it.

## 8. Guest consent

1. **The requested permission is buried in dense legal-style prose.** Cutting, captioning, translation, publication and withdrawal consequences are compressed into one paragraph; the most consequential limitation is easy to miss.  
   **Fix:** Present the requested uses as a short, readable list, followed by a separate **If you withdraw later** statement in regular body text. Keep the exact recorded scope visible and consistent with the creator’s record.

2. **The first screen does not show how the guest can answer.** The page says the guest can say no, but the visible area is dominated by a large image and the response controls are below the fold or otherwise not visible in the screenshot.  
   **Fix:** Place clearly labelled **Agree** and **Decline** actions after the permission summary and before the large preview, with a link to review where the guest appears. Make both choices equally discoverable and avoid implying that scrolling alone constitutes consent.

## Five highest-impact fixes

1. **Resolve consent scope and make the decision legible.** Separate recorded permission from a new request, expose the requested uses and withdrawal consequence, and make agree/decline actions easy to find.
2. **Clarify what each workflow actually does.** Distinguish rendering and manual posting, rule-based planning and model-backed planning, and unscanned device estimates and measured compatibility.
3. **Rebuild the shared studio hierarchy.** Reduce the height and visual weight of the title and five-stage navigation so the active task gets more of the viewport; keep the active stage and its status unmistakable.
4. **Make the canvas and story card navigable at a glance.** Replace truncated graph nodes and oversized counts with full names, readable relationships and explicit open/review actions.
5. **Give the transcript editor a proper workspace.** Make the transcript and media independently usable, demote the spelling form, and keep the playback and trimming controls together.

This is a screenshot review: contrast, keyboard access, responsive behavior and the actual operation of these controls still need to be checked in the running app.