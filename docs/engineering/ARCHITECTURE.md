# Proposed architecture
Status: design, not implemented or deployed.

## Boundaries
- Web client: Next.js/React/TypeScript candidate, light component system and resumable upload UI.
- Identity/project metadata: Supabase Auth/Postgres candidate, tenant-scoped records and storage policies.
- Private object storage: source media, proxies and rendered exports; signed short-lived URLs and retention.
- API/orchestration: FastAPI candidate; validates permissions, budgets and job inputs; never trusts client approval flags.
- Job execution: durable Postgres job record plus queue/broker and isolated media workers; Valkey/Celery candidates require an integration spike.
- Media: FFmpeg for inspected trim/proxy/caption/render operations. Do not interpolate user input into shell commands.
- Speech/translation: provider adapter, transcription candidate Whisper/faster-whisper, independently selected translation model; language-specific evaluation and explicit review.
- Billing: provider adapter, entitlements and usage ledger; Payfast candidate is commercial, not OSS.
- Intelligence: consented platform metrics via approved APIs, later.
- Local execution: optional Tauri/local worker/BYOK later; benchmark devices and packaging first.

## Core flow
Authenticated project → private resumable upload → media inspection/proxy → budget reservation → transcription/suggestions → editable revisions → language review → export job → downloadable MP4/SRT.
Each step records status and an actionable failure. Retries reuse idempotency keys, do not duplicate charge, and preserve edits. A broker is not the source of truth.

## Suggested entities
Workspace, Membership, Project, Asset, MediaProbe, Clip, CaptionTrack, CaptionSegment, Review, ConsentRecord, CollaborationAgreement, Job, UsageReservation, UsageLedgerEntry, Export, ProviderConnection.
Later: PublishingJob, LicenceRequest, StoreListing, Order and payout references.
Use workspace_id everywhere relevant, referential constraints, immutable usage events and server-side access checks.
Statuses:
Job queued → running → succeeded/failed/cancelled.
Caption draft → in_review → approved/revision_requested.
Publishing prepared → connected → scheduled → published/failed; these are distinct.
Consent requested → recorded/rejected/revoked; a declaration is not proof of ownership.

## Candidate API surface
POST /projects; POST /projects/{id}/uploads; POST /projects/{id}/jobs
GET /jobs/{id}; PATCH /clips/{id}; PATCH /caption-tracks/{id}
POST /caption-tracks/{id}/reviews; POST /projects/{id}/exports
GET /exports/{id}; DELETE /assets/{id}
These routes are design suggestions; schema, authorisation and contracts must be implemented and tested.

## Security and operational acceptance
Private-by-default media; tenant isolation; signed links; server-held secrets; deletion/retention; backups and restore checks; file/container size and duration limits; sandboxed media processing; URL-fetch allowlists if remote imports exist; explicit scopes for publish actions; webhook signature verification, replay defence and idempotent entitlements.
Keep BYOK keys out of logs and browsers; choose encryption/retention deliberately. Do not silently upload local-only media.
Observe cost/source minute, acceptance/correction rate, render failure/retry rate and time-to-first-export without logging caption text or private media by default.

## First implementation decision
One working cloud workflow before multi-provider/local orchestration. Supabase hosted vs self-hosted, queue compatibility, translation model, actual deployment and resource limits remain technical decisions to resolve, not installed infrastructure.
