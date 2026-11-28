# Secure software development lifecycle (SSDLC)

**Status:** Lane A evidence and operating proposal, prepared 25 November 2026. This repository document is not proof that the competition portal contains the same text. The source profile records “Security (SSDLC) ✅ Filled in”, but the actual portal SSDLC response was not supplied. Reconcile the portal copy before claiming that this document matches it.

## Scope and evidence labels

This lifecycle applies to the current IZWI AI web and worker code in `web/` and the local demo described in `docs/BUILD-STATUS.md`. “Verified” below means evidence is recorded in `docs/security/SECURITY-REVIEW-2026-11.md`; it does not mean production readiness. “Planned” means a proposed control or capability without implementation evidence. Portal statements are proposed text unless the team confirms they were submitted.

## Lifecycle gates

| Stage | Required practice | Current evidence / status |
|---|---|---|
| Plan | Define data classes, purpose, actors, trust boundaries, access, retention and deletion before adding a flow. Threat-model uploads, workspaces, guest links, provider calls and generated actions. | Threat model in `docs/security/THREAT-MODEL.md`; retention/deletion needs a product decision before production. |
| Design | Keep authentication and authorization in server write paths. Restrict provider egress; keep secrets server-side. Treat media, transcripts, prompts and provider responses as untrusted. Use typed intents and bounded, reviewable actions. | Origin checks, role checks, SSRF controls and typed planner are implemented and reviewed; see security review. Model-backed planning remains optional and is not the authority for execution. |
| Build | Validate input at boundaries; cap body, file, duration and processing time; avoid shell interpolation; pin downloaded engines/models and verify checksums. Never put keys, private media or customer data in source control, chat or public fixtures. | Input and media guards are partly verified. ffmpeg has a six-hour ceiling; secret-log redaction and some download/build controls remain open. |
| Review | Review each change for data exposure, tenant isolation, authorization, consent, secrets, supply chain, model/tool boundaries and failure handling. Require focused tests for security-sensitive behavior. | Lane A review records `npm run ci` passing (5 test files, 58 tests), selected HTTP checks and ledger verification on a database copy. Two-tenant route-level tests remain planned. |
| Release | Record the exact revision, checks performed, unresolved risks, operator and rollback path. Enforce CSP only after checking the signed-in flows. Do not expose the local demo through a tunnel until the allowlist and authentication path are verified. | CSP is Report-Only; tunnel config is written but no tunnel is set up; no production release is claimed. |
| Operate | Review logs for secrets and personal data, keep consequential actions auditable, respond to incidents, rotate exposed credentials, and support access revocation and deletion under a documented retention policy. | Consent and selected workspace actions have an append-only signed ledger. Secret-log redaction, incident runbook, retention schedule and deletion lifecycle are open. |

## Security and privacy commitments

- Collect and process creator media only for the requested project workflow. Do not use private creator content or voice recordings to train or fine-tune shared models without separate, explicit authorization.
- Keep user approval in front of consequential creative actions. Model output is a proposal; server code validates supported typed steps, workspace access, required consent and resource limits.
- Do not treat a creator declaration as legal proof of ownership. A consent record documents an answer; it does not independently verify identity, authority or legal rights.
- Explain provider data handling before a provider call. Provider retention, residency and training terms are not established by the current code and must be checked provider by provider.
- Report only the evidence layer actually checked. A passing local CI run or a synthetic recording does not establish browser, production, security certification, user or learning outcomes.

## Open release gates

1. Enforce CSP only after signed-in page review under enforcement mode.
2. Add HTTP-level cross-workspace isolation tests and verify link expiry/revocation through route handlers.
3. Redact secrets and personal data from application logs; review error and debug paths.
4. Complete and run the security CI checks recorded in the security review.
5. Decide retention, deletion, export and incident-response procedures; test deletion through media, database and backup paths.
6. Verify the exact provider terms and data region before sending sensitive content; provide an opt-in and a provider-specific explanation.
7. Verify tunnel access controls and sign-in before any external demo access.

## Competition judging evidence map

This maps the seven technology headings in the supplied team profile to the branch evidence and honest claim boundary. The profile's seven response fields were blank in the supplied copy, so the following are portal-ready proposals, not evidence that the answers were submitted.

| Profile heading | Evidence to cite | Safe answer / boundary |
|---|---|---|
| 1. Frontend and User Interface | `web/package.json`, `docs/BUILD-STATUS.md` | “Next.js and React provide the web application; TypeScript and Zod support typed interfaces and validation. The current screens are not all wired to the backend, as recorded in the build status.” Avoid saying the complete user-facing app is integrated. |
| 2. Backend and Data Infrastructure | `web/src/server/`, `web/src/server/db.ts`, `web/src/server/jobs.ts`, `docs/BUILD-STATUS.md` | “A Node.js/Next.js server, Postgres database and worker queue implement the demo workflow. Authentication and resumable-upload routes are written; production hosting, durable cloud storage and complete HTTP integration coverage are not established.” |
| 3. Artificial Intelligence and Model Orchestration | `web/src/server/providers.ts`, `web/src/server/planner.ts`, `docs/research/open-source-map.md` | “The application has an OpenAI-compatible provider adapter and optional model-assisted planning when a workspace connects a provider. The tested fallback is rule-based planning. No connected Meta API key or live provider quality test is evidenced; describe Meta as a researched option, not the current primary runtime.” |
| 4. Video, Audio and Multilingual Processing | `web/src/server/media.ts`, `web/src/server/render.ts`, `docs/BUILD-STATUS.md` | “The synthetic demo uses ffmpeg and whisper.cpp for media processing, transcription, captions and vertical clip rendering. Translation requires a provider; South African language coverage, dubbing and production quality remain unvalidated or planned.” |
| 5. Agentic AI and Creator Intelligence | `web/src/server/planner.ts`, `web/tests/planner-publish.test.ts` | “The planner turns a request into typed workflow steps; deterministic code validates and queues supported work after explicit approval. It is not an autonomous general agent. Audience analytics and growth recommendations are planned and require connected platform data.” |
| 6. Distribution, Intellectual Property and Monetisation | `web/src/components/studio/PublishTab.tsx`, `web/src/server/ledger.ts`, `web/src/server/public.ts`, `docs/PRODUCT.md` | “The current scope prepares exports and records declarations, consent and licensing enquiries. Platform publishing, C2PA provenance, storefront transactions and payments are not implemented. Records do not certify rights.” |
| 7. Cybersecurity and Development | `SECURITY.md`, `docs/security/THREAT-MODEL.md`, `docs/security/SECURITY-REVIEW-2026-11.md` | “The code includes workspace scoping, same-origin write checks, rate limits, bounded inputs, SSRF defenses, encrypted provider keys and a signed consent ledger. The review records passing local CI and selected checks. CSP enforcement, complete route-level tenant tests, production operations and independent certification remain open.” |

## Portal status and submission discrepancy

The profile says SSDLC is filled in, while the repository's prior criteria record says the portal checkbox was filled but its text was unavailable and asks for a local SSDLC document. The portal's actual SSDLC wording was not provided in the evidence bundle. Preserve this as a discrepancy; do not state that this file is a portal copy or silently replace the submitted text. Likewise, the seven technology headings are present but their answer fields are empty in the supplied profile. A team member with portal access should reconcile and paste these answers, then retain a dated export or screenshot as evidence.

### Judging criteria supported

| Criterion | Contribution | Evidence status |
|---|---|---|
| Product | Defines security and data-handling gates for the creator workflow. | Documented process; production controls remain open as listed. |
| Creativity | Describes typed, approval-gated model assistance rather than unbounded execution. | Planner code and tests exist; optional live model execution is not evidenced. |
| Usability | Calls for clear provider, consent, failure and deletion explanations. | Some consent/error flows exist; retention/deletion UX is open. |
| Sustainability | Identifies provider, storage and operational checks before release. | Costs and provider terms are not yet measured for production. |
| Impact | Limits claims about creator outcomes, rights and language quality to evidence. | No user outcome or language-quality study is claimed. |
| Presentation | Supplies seven concise technology answers with concrete evidence paths. | Draft only; portal content and judge review are unverified. |
| Intelligence | Keeps models inside typed schemas and human approval; tracks model/data boundaries. | Rule planner verified; connected-model behavior is not live-validated. |
