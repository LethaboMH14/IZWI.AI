# Handoff to Codex: exact steps
1. `git fetch origin && git checkout -b production/codex-studio origin/production/claude-creative-handoff`
2. Read `creative/STORYBOARD.md` (10 shots, frame ranges at 30 fps, 600 frames) and `design/tokens.json`. Use Fraunces display type and only the ivory/amber/ink palette.
3. Build a Remotion composition `IzwiPitch` 1920×1080@30, 600 frames. Shots 4–10 can be built now from `assets/captures/izwi_capture_home_16x9.png` and type. Shots 1–3 use placeholder cards until recordings arrive (then match names in `RECORDING-PACKAGE.md` §5).
4. Label shot 5 "Concept" unless a real assistant screen capture is added. Add the small print from STORYBOARD to frames 375–600.
5. Radio: cut lines L01–L10 to the cue table in `RECORDING-PACKAGE.md` §3. Compose an original 3-note sonic logo (no reference-ad samples). Master to −16 LUFS, 30.0 s exactly. Export `izwi_radio_30s_master.wav`.
6. Add every output to `asset-manifest.json` with status. Do not commit recordings of people or keys. Run gitleaks before committing.
7. A different model reviews the render against `qa/CHECKLIST.md` before anything ships.
