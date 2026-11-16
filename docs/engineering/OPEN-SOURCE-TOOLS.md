# Tools and reuse plan
Planning inventory checked 16 November 2026. No packages are installed or vendored by this handoff. Select exact versions, check their licences/transitives and produce a lockfile during implementation. Open-source source code does not mean free hosting or permissively licensed model weights.

| Role | Candidate | Licence/status | Decision |
|---|---|---|---|
| Web | Next.js / React / TypeScript | Next.js MIT; check exact dependency licences | Proposed web client |
| Components | shadcn/ui + Tailwind CSS | shadcn/ui MIT; verify selected pieces | Reuse accessible patterns, apply own tokens |
| API | FastAPI | MIT | Proposed orchestration |
| Auth/data | Supabase / Postgres | Supabase repo Apache-2.0; services/components have own terms | Evaluate hosted cost and access rules |
| Queue broker | Valkey | BSD-3-Clause | Candidate rather than assuming Redis versions share a licence |
| Workers | Celery | BSD-style upstream licence; inspect exact release | Validate broker compatibility and retries first |
| Media | FFmpeg | LGPL-2.1-or-later baseline; optional GPL/nonfree components change constraints | Inspect exact build/codecs |
| Transcription | Whisper | MIT code/weights per upstream | Evaluate actual languages/compute |
| Efficient speech | faster-whisper | MIT implementation; CTranslate2/model licences separate | Candidate, not bundled with every alternative |
| Translation | Not selected | Evaluate model weights, commercial terms, quality and hardware | Do not default to a noncommercial research model |
| Local models | Ollama / llama.cpp candidates | Runtime and each model have distinct licences | Later adapter after evaluation |
| Desktop/local | Tauri candidate | Verify exact release/dependencies | Later, not parallel MVP |
| Billing | Payfast candidate | Commercial service/API, not open source | Confirm subscriptions, fees, webhooks and onboarding |
| Email | SMTP provider + templates | Provider service terms | Select when implementing |
| Monitoring | OpenTelemetry-compatible instrumentation candidate | Verify SDK and backend licences | Track job/cost reliability |

Upstream licence sources read during handoff:
- https://raw.githubusercontent.com/vercel/next.js/canary/license.md
- https://raw.githubusercontent.com/shadcn-ui/ui/main/LICENSE.md
- https://raw.githubusercontent.com/fastapi/fastapi/master/LICENSE
- https://raw.githubusercontent.com/supabase/supabase/master/LICENSE
- https://raw.githubusercontent.com/valkey-io/valkey/unstable/COPYING
- https://raw.githubusercontent.com/celery/celery/main/LICENSE
- https://raw.githubusercontent.com/openai/whisper/main/LICENSE
- https://raw.githubusercontent.com/SYSTRAN/faster-whisper/master/LICENSE
- https://ffmpeg.org/legal.html

These moving branch links document the check, not a pinned reproducible bill of materials.
Model alternatives mentioned in the original canvas (Meta models, GPT/Claude/Gemini, Hugging Face) are optional adapters, not confirmed integrations or an instruction to install all of them.
Do not copy a whole editor/commerce kit without confirming fit, licences and maintenance. Use mature modules for identity/billing/processing and build the creator-specific orchestration and review experience.
