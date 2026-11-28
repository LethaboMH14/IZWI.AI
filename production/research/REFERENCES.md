# Creative research: reference ads and the initial spec

How this was done: frames pulled with ffmpeg (one every 2 s, plus a 1 fps contact sheet) and audio transcribed locally with openai-whisper `base`. Both reference ads are third-party copyrighted works, so **no frames, audio or transcripts are committed**. The study files live outside the repo, in the session notes folder under `reference-study/`, and the source videos stay in the user's Downloads folder. Below are our own observations only.

## 1. Wimpy, "Lost in Translation (isiZulu)" radio ad (Howard Audio), 30.08 s
- **Format:** a radio spot over a static brand card ("RADIO", logo, "LOST IN TRANSLATION - isiZulu").
- **Structure (from the transcript and timings):** an isiZulu speaker keeps asking a phone voice assistant for something (0–12 s). The assistant keeps answering with generic English web-search replies (around 2.7 s and 10.4 s). The speaker gets more frustrated (12–19 s). A brand voice then answers in isiZulu, with the brand line at the end (19–30 s).
- **What makes it work:** the joke *is* the language gap. A monolingual system fails a fluent speaker, and the brand is the one that "speaks your language." The cast is two voices, with no music bed under the dialogue. The brand payoff takes about the last third (~11 s).
- **Whisper caveat:** Whisper base detected the language as "Swahili" and garbled the isiZulu, which is the same gap IZWI states in its limits. Our transcript is only good enough for timings. Do not quote it as text.
- **What we take:** the 30 s three-act timing (setup ≈ 0–15 s, turn ≈ 15–19 s, brand ≈ 19–30 s), the language-gap joke, and a dry delivery. **What we change:** our joke is on a *human* (Lethabo doesn't speak isiZulu), not on a rival product, and IZWI is not shown as a "magic translator" because translation needs a connected provider.

## 2. LangEase SaaS launch ad (Zelios), 33.1 s
- **Format:** clean motion graphics on near-white, blue gradient accents, floating glass UI cards, kinetic type, a sung music bed, and no voice-over.
- **Beat map (1 frame/s contact sheet):** 0–5 s kinetic type "Turn Books / Audio / Any language · Instantly", with a folder icon; 6–10 s "Just drop and…", a tilted 3D phone tunnel, "Books. Audio. Video. All In One Platform"; 11–15 s a progress bar 79/100 → 99/100 → "Done ✓" with confetti; 16–22 s video cards fanning out, "Multiple Languages", a library UI with a cursor; 23–27 s a list row, then a "Distribute To Youtube" button click; 27–30 s "Translate. Dub. Distribute ✦"; 30–33 s logo lock-up with the URL.
- **What makes it work:** one verb per beat, real-looking UI shown at an angle, a cursor that proves interaction, a progress-to-done payoff, and a three-word tagline before the logo.
- **What we take for the 20 s pitch:** the beat rhythm (about 2 s per beat), UI cards in 3D perspective, a cursor click, and the three-verb lockup in IZWI's language ("Create. Localise. Protect." and so on). **What we must not copy:** their blue palette (we use ivory, amber and charcoal), their claim of instant dubbing, and a "Distribute to YouTube" button. IZWI has no platform posting. It exports and lets you "mark as posted", so our version shows **Export / hand-off package** instead.

## 3. The ChatGPT conversation (initial creative spec)
`https://chatgpt.com/share/6b0a10dc-1c14-83e8-af71-92df99af9170` loaded in the in-app browser on 2026-11-28 with the title "Summarize Repo Solution", but **no messages rendered** without a ChatGPT login (page text: only "This is a copy of a shared ChatGPT chat"). **Not read.** The brief relayed by the coordinating session was used instead. **Action:** if the spec in it differs from `creative/RECORDING-PACKAGE.md`, paste the relevant part into `research/chatgpt-spec.md` and Claude will reconcile the two.

## Prior art and tools for the build (for Codex)
| Tool | Use | Note |
|---|---|---|
| Remotion | 20 s pitch composition | Company licence needed for teams of 4 or more people at a for-profit company. Check remotion.dev/license before shipping commercially (not verified here) |
| ffmpeg | loudness (−16 LUFS stereo for the radio master), muxing | Already on the PC |
| openai-whisper / whisper.cpp | caption timing for English lines | isiZulu is unreliable (see above) |
| Playwright | real app captures | `production/scripts/capture-app.mjs` |
