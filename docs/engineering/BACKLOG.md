# Implementation backlog
All items are unimplemented unless explicitly checked in future commits.

## 0. Validate the expensive and uncertain parts
- [ ] Observe 20 creators, their devices, tools, spending and bottlenecks.
- [ ] Benchmark transcription/translation with native reviewers, code-switching and noise.
- [ ] Measure compute, storage, transfer, rendering and retries per completed task.
- [ ] Select exact commercially compatible model(s), versions and FFmpeg build.
- [ ] Define retention, acceptable input limits and a realistic development budget.
Deliverable: measured technical spike and revised allowances; do not advertise all-language/local-hardware support.

## 1. First vertical slice
- [ ] Create web/API/worker skeletons with pinned dependencies.
- [ ] Auth, workspace isolation, project creation and private asset storage.
- [ ] Resumable upload, media probing, proxy preview and file limits.
- [ ] Clip suggestions with user-editable boundaries and source-caption corrections.
- [ ] Draft translation and explicit review workflow for an evaluated pair.
- [ ] Idempotent MP4/SRT export and retry/cancel handling.
- [ ] Usage reservation/ledger, spending caps and clear allowance UI.
Exit: one user completes the entire journey with edits preserved; two tenants cannot access each other's media.

## 2. Trust, distribution and retention
- [ ] Creator declaration and collaborator/consent records with revocation.
- [ ] Approved publishing provider spike: scopes, review, refresh, expiry and revocation.
- [ ] Preserve manual export fallback.
- [ ] Privacy-conscious activation/reuse analytics and useful job alerts.
- [ ] Billing sandbox: verified webhook, replay, entitlement and refund cases.
Exit: real connected state is distinct from mock/ready status; no double charge on retries.

## 3. Earn and intelligence
- [ ] Licensing enquiries and storefront requirements before marketplace code.
- [ ] Validate payment split/payout/onboarding requirements and commission disclosures.
- [ ] Connected metrics; explain data freshness and missing permissions.
- [ ] Measured language expansion and consented dubbing.
Exit: supported commercial workflow with documented fees and responsibilities.

## 4. Hybrid/local and scale
- [ ] Benchmark supported hardware and BYOK/local privacy behaviour.
- [ ] Optional desktop packaging and update strategy.
- [ ] Queue concurrency/load tests, quotas and restore drills.
- [ ] Studio/agency permissions, multi-client boundaries and institutional onboarding.

## Pilot targets
800 registered; 300 activated by useful export; 55 paid; 30% activated return within 30 days; 300 monthly exports; five repeat studios. These are goals, not acceptance tests for product correctness or existing traction.
