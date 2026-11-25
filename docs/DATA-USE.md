# Data use and model-training boundary

**Status:** Evidence-based policy proposal for the current IZWI AI MVP, 25 November 2026. This is not a legal opinion, provider contract, privacy notice or proof that production controls are complete.

## Data classes and purpose

| Data | Intended use | Current boundary |
|---|---|---|
| Account and workspace records | Sign-in, membership, roles and project access. | Stored in the local SQLite demo; authentication and role checks are implemented in code, but the complete user-facing flows are not all exercised over HTTP. |
| Uploaded media and derived audio/video | Transcribe, find requested clips, render and export the creator's project. | Processed by the local worker in the demo. Private media must not be added to public fixtures, logs, prompts or source control. |
| Transcripts, captions, instructions and project metadata | Execute the requested workflow and show editable results. | Workspace-scoped in server functions. A connected AI provider may receive the prompt/context needed for that requested action; exact provider retention and training terms require separate verification. |
| Provider credentials | Authenticate a creator-selected provider call. | Stored sealed at rest and unsealed for a call. Never return the key to the browser or log its value. Rotation is required if exposure is suspected. |
| Consent answers and review records | Record the submitted choice and govern the gated action. | Stored in an append-only, signed ledger. This documents an answer and does not prove identity, legal ownership or authority. |
| Public-link and enquiry data | Support token-based consent/review and licensing enquiries. | Links are purpose-scoped, revocable and time limited in code; contact details are personal data and must be access-limited and retained only as needed. A full retention schedule is still open. |
| Platform analytics | Future recommendations based on a creator-authorized connection. | Not currently connected. No audience behavior is collected by the current implementation. |

## Training and inference commitments

- The project does not claim to train a foundation model from scratch.
- Private creator media, transcripts, prompts, voice samples and analytics are not approved as shared-model training data by default.
- Any future task-specific fine-tuning requires a separate opt-in that names the dataset, purpose, model, retention and withdrawal limits. The team must verify data rights and dataset licence before use; a licence or consent record alone may not establish every necessary right.
- The supplied team profile says private content will not automatically be used to train shared models. This is a project commitment, not a verified guarantee about an external provider. Before each provider integration, verify its current terms, account mode, retention, region and training settings, and disclose them to the creator.
- Inference is distinct from training: a requested provider call may process media or text to return an output. Do not imply that content stays on-device when it leaves the device for a hosted provider.
- Personal style preferences may be stored as project/workspace data. Do not describe that storage as model training.
- No live provider key or provider-specific retention test was available for this documentation task. Provider behavior is therefore **not verified**.

## Consent, access, retention and deletion

1. Explain the requested processing and external provider boundary before upload or provider use.
2. Ask separately for collaborator/voice permissions where needed; make the relevant action wait when a required approval is missing.
3. Scope reads and writes to the active workspace and enforce role checks on the server.
4. Use purpose-specific, expiring links; allow revocation and record consequential consent or review changes.
5. Set and publish retention and deletion periods before production. Deletion must cover originals, derivatives, exports, indexes, logs and backup expiry; those complete procedures are not yet evidenced.
6. Keep synthetic media clearly named (for example `sim_...`) and separate from real creator data.

## Current evidence and gaps

- Implemented/reviewed: provider-key encryption, workspace-scoped server access, consent token hashing and expiry, append-only consent ledger, request limits and media validation. See `docs/security/THREAT-MODEL.md` and `docs/security/SECURITY-REVIEW-2026-11.md`.
- Planned/open: provider-specific retention controls and disclosure, log redaction, complete HTTP-level tenant tests, retention/deletion lifecycle, incident response and connected analytics.
- This repository's review ran local CI and selected HTTP checks; it did not verify a production deployment, external provider, end-user consent comprehension or deletion from backups.
