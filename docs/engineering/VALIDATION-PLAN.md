# Validation plan for the future application
No application tests have run: there is no application implementation yet. The handoff verification scripts only check committed artefacts and arithmetic.

| Area | Meaningful check before pilot |
|---|---|
| Tenant isolation | Creator B cannot list, retrieve, edit, export or delete Creator A's media, including guessed IDs and signed-link expiry |
| Uploads | Resume an interrupted supported file; reject corrupt, oversized, overly long or unsupported input; enforce declared limits server-side |
| Media execution | Treat filenames, subtitle content and metadata as untrusted; enforce CPU/memory/time limits; confirm worker containment |
| Editable state | Change cuts/captions, retry failed tasks, reload project and confirm the user's edits remain |
| Language quality | Native reviewers score meaning, timing, names, idioms and code-switching on consented representative samples |
| Review | A translation remains draft without explicit authorised approval; revoked consent blocks the relevant future action |
| Jobs | Retry delivery, duplicate queue events, cancellation and worker crash without duplicate exports or charges |
| Usage | Reserve credits before work, reconcile completion/failure exactly once and show a clear exhausted-budget state |
| Billing | Use sandbox fixtures for signature, replay, duplicate events, out-of-order updates and refunds before live money |
| Publishing | Expired/revoked token and unsupported scopes produce honest status, not a published-success badge |
| Privacy | Retention/deletion removes the intended source, proxy and export records; logs exclude private captions and keys |
| Export | Validate duration, aspect ratio, caption alignment and MP4/SRT playback on supported clients |
| Accessibility | Keyboard completion, focus visibility, labelled actions and contrast on the actual light amber UI |
| Cost/capacity | Measure cost per completed task including retries; exercise simultaneous fully used subscriptions under a fixed budget |

Record real measurements, sample definitions and failures. Do not convert a demo screenshot or unit-test pass into claims about translation quality, customer demand or production security.
