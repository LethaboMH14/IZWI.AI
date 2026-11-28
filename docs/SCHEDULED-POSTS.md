# Scheduled posts and manual export

Status: limited by access. Behind `IZWI_FLAG_SCHEDULED_POSTS=0`, a creator can prepare a post package for a finished render with platform, title, description, tags and a planned Africa/Johannesburg time. A stored Pass policy check is required, or a Review finding must be explicitly acknowledged. The downloadable record is labelled `manual_export`; it is not a Scheduled or Posted result. IZWI does not currently connect platform accounts or call any posting API.

Before real scheduling/posting, the team must register and configure YouTube Data API, TikTok Content Posting API, and Meta Graph API apps, complete platform review/scopes, set OAuth client IDs/secrets and redirect URIs, and review token storage/rotation. No OAuth environment names or credentials have been invented. Posting worker, retry safety and platform confirmation remain unbuilt until those approvals exist.

Focused checks: `web/tests/scheduled-posts.test.ts`, `web/tests/api-routes.test.ts`. Playwright uses a stand-in server and needs a local ready render fixture for the screen.