# Coordination (Claude ↔ Codex)
- Branches: Claude works on `production/claude-creative-handoff`. Codex uses its own branch. Neither merges to `main` without the user's yes.
- File ownership: Claude owns `production/{creative,research,design,assets/captures,scripts/capture-app.mjs}` and the process docs. Codex owns `production/remotion/` (or its own studio folder) and `production/assets/audio/`, plus render outputs. To change the other's files, open an issue or leave a note.
- Single source of truth for timing: `creative/STORYBOARD.md` (pitch) and `creative/RECORDING-PACKAGE.md` §3 (radio).
- Manifest: whoever adds an asset adds its row to `asset-manifest.json` in the same commit.
