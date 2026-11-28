# Settings Preferences

Status: partial. The Preferences screen is gated by `IZWI_FLAG_PREFERENCES=0` and stores per-user appearance choices in the `user_preferences` table. It supports the approved appearance, warm paper and high contrast; curated amber, terracotta, forest and ocean accents; self-hosted project font pairings; larger text; reduced motion; live preview; and an explicit save.

`npm run ci` and `npm run test:e2e:preferences` are the verification paths. The Playwright test requires an authenticated owner storage state in `IZWI_E2E_OWNER_STATE` and an app on `127.0.0.1:4300` with Preferences enabled. Screenshots are only committed after that browser run. No browser screenshots have been produced yet because this worktree has no authenticated state or configured Postgres app.