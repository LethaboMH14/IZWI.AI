# Spatial Canvas recovery

Status: partial. Existing Canvas supports selection, multi-select Render/Keep/Drop/Ask AI controls and keyboard scene selection. This change adds a direct “Bring back” control for dropped scenes on desktop and phone, behind `IZWI_FLAG_SPATIAL_RESTORE=0`. Restoring sets the scene back to suggested so the creator can decide whether to keep it.

Focused checks: `web/tests/spatial-layout.test.ts`. A real-project browser pass for pointer/finger dragging, keyboard actions and the full render path still needs an authenticated Postgres-backed app and project fixture. No screenshot was captured.