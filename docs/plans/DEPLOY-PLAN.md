# Hosting plan: Vercel + Supabase + an always-on worker

Status: **choices made, build on hold** until the A+C session lands its backend work (user, 27 Nov 2026: "Wait for A+C first"). No code has been changed yet.

## 0. Decisions, 27 Nov 2026 (these override the sections below where they differ)

The user chose free tiers only: "R2 + laptop worker", with the worker on Sibusiso's laptop.

| Part | Choice | Free limit / catch |
|---|---|---|
| Web | Vercel Hobby | Non-commercial use only |
| Database | Supabase **Free** Postgres | 500 MB database; the project pauses after 7 days with no use |
| Media | **Cloudflare R2**, private bucket, S3 API | 10 GB-month of Standard storage; no egress fees. A card may be asked for at sign-up (unconfirmed) |
| Worker | `npm run worker` on **Sibusiso's laptop**, pointed at the hosted database and R2 | Jobs wait in the queue while the laptop is off. The UI already shows worker status from `worker_beat` |

What this changes in §4:
- **Supabase Storage is not used.** `storage.ts` gets an `s3` backend (`@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`, Apache-2.0). It is endpoint-agnostic, so Backblaze B2 or MinIO can be swapped in later.
- **Upload:** S3 multipart through presigned part URLs signed by our API: `/api/upload/sign` creates the upload; `/sign-part`, `/complete` and `/finish` follow, with `/finish` running the same checks as today. The browser uses Uppy's `@uppy/aws-s3` (MIT) in `Uploader.tsx`, or a small hand-written part loop. This is resumable, because uploaded parts survive a dropped signal. R2's bucket CORS must allow `PUT` from the Vercel origin and expose the `ETag` header.
- **Media:** a 302 redirect to a presigned R2 `GET` URL (1 hour). CSP `connect-src`, `media-src` and `img-src` add the R2 account endpoint.
- **Worker host:** Railway, Fly.io and the Dockerfile are **dropped for now**. The runbook covers installing ffmpeg and whisper on Sibusiso's laptop (`npm run setup`), the env vars, and `npm run worker`. The worker connects through the Supabase **session pooler (port 5432)**.
- Env: `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` (an R2 token scoped to the one bucket, Object Read & Write) replace the `SUPABASE_*` storage vars, and `IZWI_STORAGE=s3`. The values go only into Vercel's env settings and Sibusiso's `.env.local`.
- Sibusiso's laptop and Vercel share `IZWI_MASTER_KEY` and the R2 token. He receives them through a password manager or another private channel, never in git or chat logs. Criteria moved: X13 (hosted database), A1 (hosted path), P5 (deploy evidence), X16 (Sibusiso can run and redeploy).

## 1. What changes and why

The app today is one machine. It uses SQLite (`better-sqlite3`, synchronous), media on local disk under `web/storage/`, tus uploads written to local disk, and a worker that reads and writes the same disk. Vercel functions have no persistent disk and no shared process, so three things must move:

| Today | Hosted | Local dev (kept working) |
|---|---|---|
| SQLite file, sync `one/all/run/tx` | Supabase Postgres via `pg` (node-postgres) | Any Postgres URL: a local Postgres or a free Supabase dev project. Tests use in-process PGlite |
| Files under `web/storage/` | Supabase Storage, private bucket `media` | Disk backend, same interface (`IZWI_STORAGE=disk`) |
| tus server inside Next (`/api/upload`) | Browser uploads straight to the Supabase tus endpoint with a signed upload token. Next only signs and then finalises | Existing `@tus/server` FileStore path stays for disk mode |
| `/api/media/[id]` streams bytes | Same access checks, then a 302 to a 60-second signed URL (Range works natively) | Streams from disk as now |
| Worker on the laptop | Worker in a Docker container on **Railway** (ffmpeg, whisper.cpp, fonts baked in) | `npm run worker` as now |

## 2. Prior art (verified 27 Nov 2026 with `gh api` and the vendors' docs)

| Candidate | Licence · last push | Decision | Quoted span |
|---|---|---|---|
| `brianc/node-postgres` (`pg` 8.23.1) | MIT · 2026-10-23 | **Use** for app + better-auth (better-auth takes a `pg` Pool directly) | — |
| `porsager/postgres` | Unlicense · 2026-11-23 | Skip: better-auth needs a Kysely adapter for it; one driver is simpler | — |
| `electric-sql/pglite` + `pglite-socket` | Apache-2.0 · 2026-11-27 | **Use PGlite in tests only.** Skip the socket server for dev: "not all use cases are guaranteed to work" with its connection multiplexer, and our web+worker need real concurrent transactions | pglite-socket README |
| `timgit/pg-boss` | MIT · 2026-11-27 | Skip: the existing queue in `jobs.ts` already does leases, idempotency, dependencies and blocked jobs; it ports to Postgres with `FOR UPDATE SKIP LOCKED` in one query | — |
| `kysely-org/kysely`, Drizzle | MIT | Skip: rewriting about 540 raw SQL calls into a builder costs more than porting the SQL | — |
| Supabase Storage resumable uploads | `supabase/storage` Apache-2.0 · 2026-11-27 | **Use** with `tus-js-client` (already a dependency) | "using signed upload tokens … invoking the `createSignedUploadUrl` method … including the returned token in the `x-signature` header of the resumable upload"; chunk size "must be set to 6MB" |
| Supavisor transaction pooler (port 6543) for Vercel | Supabase docs | **Use**, prepared statements off (`pg` only prepares when a statement is named; we never name them) | "Transaction mode does not support prepared statements" |
| Session pooler (port 5432) for the worker | Supabase docs | **Use**: Railway egress is IPv4, and the direct endpoint "is on IPv6" | "Use pooler session mode for application traffic from persistent clients on IPv4-only networks" |

### Worker host

| Host | Price for about 2 GB RAM | Notes |
|---|---|---|
| **Railway (pick)** | Hobby is "$5 / month" including "$5 of monthly usage credits"; then RAM "$10 / GB / month", CPU "$20 / vCPU / month", billed on actual use | Deploys from GitHub with a Dockerfile on every push to `main`, so Sibusiso redeploys by merging. An idle polling worker uses well under 0.5 GB, so cost scales with real renders |
| Fly.io | shared-cpu-2x 512 MB "$4.39 per month" + "$6.00 per GB per month" extra RAM = about $13.39 fixed (my arithmetic from Fly's 2026 pricing update) | Cheapest fixed price; deploys through `flyctl` rather than on push |
| Render | Starter worker 512 MB / 0.5 CPU, $7. Too small for whisper + 1080×1920 renders. 2 GB tier is about $25; whether workers can use it is unclear in Render's own docs | Skip |

Sources: docs.railway.com/pricing, fly.io/pricing-update, render.com/docs/compute-plans.

## 3. Blocking decisions for the user

1. **Supabase plan.** Free caps every file at **50 MB** ("For Free projects, the limit can't exceed 50 MB. On the Pro Plan and up … 500 GB"). A 10-minute 1080p phone video is larger than that. Options: (a) Supabase Pro, $25/month, uploads up to 2 GiB as now; (b) stay Free, set `IZWI_MAX_UPLOAD_BYTES=50MB` hosted, and say so in the uploader. Free projects also pause after a week with no use.
2. **Vercel plan.** Hobby is for non-commercial use. A team demo is fine; once it takes money it needs Pro ($20/member/month).
3. **Railway** Hobby $5/month plus usage beyond the $5 credit.

Nothing is created and no money is spent until the user approves each item in chat.

## 4. Code changes (on branch `deploy/supabase-vercel`)

1. **`db.ts`** becomes async over a `pg` Pool: `one/all/run` return Promises, `run` returns `{ changes }` from `rowCount`, `tx(fn)` checks out one client and runs `BEGIN … COMMIT` with the callback's queries bound to it (AsyncLocalStorage, so nested helpers join the same transaction). `?` placeholders are rewritten to `$n` once per statement string and cached. `int8` is parsed to `number` (millisecond timestamps fit safely). The Pool is `max: 5` on Vercel, with `attachDatabasePool` from `@vercel/functions` so idle clients close when an instance freezes; the worker gets `max: 4`.
2. **Every caller adds `await`.** About 540 calls in 41 files, plus 47 transactions whose callbacks become `async`. It is mechanical, but every function on the path becomes async, including some route helpers and React server components (`app/app/layout.tsx`, `app/app/page.tsx`). TypeScript catches a missing `await` on a value that is used. A floating promise is caught by adding `@typescript-eslint/no-floating-promises` to lint for `src/server` and `worker`.
3. **SQL dialect fixes:** quote better-auth's camelCase columns (`"organizationId"`, `"userId"`, `"createdAt"`); `MAX(0, x)` → `GREATEST`; `lastInsertRowid` → `RETURNING id`; `pragma_table_info` → `information_schema`; `AUTOINCREMENT` → `GENERATED ALWAYS AS IDENTITY`; `json_valid(x)` checks → `pg_input_is_valid(x, 'jsonb')` (Postgres 16+; we check the Supabase version first); `INTEGER` ms timestamps → `BIGINT`. `claim()` becomes `UPDATE … WHERE id = (SELECT … FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`, so two workers never take the same job.
4. **Migrations:** one Postgres baseline, equal to the current `SCHEMA_VERSION`, in `migrations.pg.ts`, then forward-only as now. better-auth tables come from `npx @better-auth/cli migrate` against Postgres, run in `npm run db:migrate`. SQLite history reconciliation (`reconcileStudioHistory`) is not needed on a fresh database.
5. **Storage interface** (`storage.ts`): `put(key, file|stream)`, `getRange`, `signedUrl(key, seconds)`, `materialize(key) → local temp path` (the worker downloads to `/tmp` before ffmpeg runs), `remove(prefix)`. Two backends: `disk` (today's code) and `supabase` (`@supabase/storage-js` with the **service-role key, server and worker only**). The bucket is private and no row-level security policies are opened to `anon`, so the browser can only use tokens we sign.
6. **Upload flow, hosted:** `POST /api/upload/sign` runs today's checks (session, origin, rate limit, project, extension), writes `upload_session`, and returns a signed token for `tus/{ws}/{project}/{uploadId}`. The browser uses tus-js-client against `https://<ref>.storage.supabase.co/storage/v1/upload/resumable` with `x-signature`. Then `POST /api/upload/finish` reads the first 64 bytes (`getRange`), checks the type, moves the file to its final key, inserts the `asset` row and enqueues `probe`, exactly as `onUploadFinish` does now. **This touches `web/src/components/Uploader.tsx` (UI lane):** about 20 lines to choose the endpoint and headers from a `GET /api/upload/config` answer.
7. **Media route:** same token and workspace checks, then a 302 to a short signed URL with `Cache-Control: no-store`. CSP `media-src` and `img-src` add the Supabase storage origin only (`headers.ts`). Downloads use the signed URL's `download=` parameter.
8. **Worker:** Dockerfile `web/worker/Dockerfile` on `node:24-bookworm-slim` with Debian `ffmpeg`, whisper.cpp built at a pinned tag, `ggml-base.bin` checked by sha256, and the fonts. The pipeline swaps `absPath()` for `materialize()` + `put()`. The `worker_beat` heartbeat already exists and feeds the hosted health check.
9. **Hosting origin:** take the two commits on `fix/hosted-origin` (Host-header check when `IZWI_HOSTED=1`), and add `VERCEL_URL` / `VERCEL_BRANCH_URL` to the allowed origins on preview deployments only. `BETTER_AUTH_URL` and the passkey `rpID` follow the production domain; on previews passkeys stay off, because the rpID must match the hostname.
10. **Things that must not run on Vercel:** `@huggingface/transformers` / `onnxruntime-node` (used by `injection.ts`) move behind a dynamic import that only the worker runs, so the function stays under Vercel's 250 MB size limit. `next.config.ts` lists `serverExternalPackages` as needed. `better-sqlite3` leaves the web bundle.

## 4b. Review round 1 (read-only reviewer, verdict REVISE). All items are adopted.

The port is not only an `await` sweep. These are the places where SQLite's single writer and synchronous calls did real work:

1. **Consent ledger** (`ledger.ts:40-55`) used `.immediate()` to read the chain head. Fix: take `pg_advisory_xact_lock` per project inside the transaction, add `UNIQUE (prev_hash)`, and rewrite the append-only triggers (`migrations.ts:347-348`) in plpgsql. `migrateApp` takes an advisory lock as well.
2. **Check-then-insert races:** `enqueue` idempotency (`jobs.ts:26-36`) moves to a partial unique index plus `ON CONFLICT`. `enqueueVoice` (one active job per user, `jobs.ts:43`) moves to a partial unique index.
3. **Type traps:**
   - `budget.ts:53-63` needs `::bigint` casts.
   - Add a parser for `numeric` (OID 1700) as well as `int8`, because `SUM` returns `numeric` (`state.ts:41`, `system/route.ts:15`).
   - `LIKE` becomes `ILIKE` (`actions.ts:166`).
4. **Storage inside a transaction** (`pipeline.ts:367-388`): upload to the unique final key before the transaction and delete it if the transaction fails.
5. **Missed filesystem paths:**
   - Voice transcribe writes `STORAGE/tmp` and buffers up to 10 MB, but Vercel's body limit is 4.5 MB (the reviewer verified this). It moves to a signed upload into storage, then a job.
   - Peaks are read with `readFileSync` (`state.ts`).
   - The package zip (`pipeline.ts:439-471`) moves to the worker temp folder, then `put()`.
   - `removeProjectFiles` becomes a prefix delete.
   - `injection.ts`'s model cache moves to the worker temp folder.
   - `upload.ts`'s top-level `mkdirSync` is made disk-mode only.
   - `system/route.ts` reports worker tools from `worker_beat`, not `existsSync`.
6. **Upload finalisation:** add an idempotent reconciler in the worker for `upload_session` rows older than 10 minutes. Byte counts come from storage metadata, never the client. The bucket's `file_size_limit` equals `IZWI_MAX_UPLOAD_BYTES`.
7. **CSP:** `connect-src` also gains the Supabase storage origin, which the tus PATCH requests need. Signed media URLs last 1 hour, so seeking never hits an expired link. They cannot be revoked, which is acceptable for private previews.
8. **Rate limit behind Vercel:** set `IZWI_TRUST_PROXY=1` and read Vercel's `x-forwarded-for`, never `cf-connecting-ip`, which can be spoofed there.
9. **Assistant on Vercel:** set an explicit `maxDuration`. A hosted function cannot reach a creator's localhost Ollama, so the hosted assistant needs a hosted provider. The UI already says which provider runs.
10. **Previews and better-auth:** add `trustedOrigins` with the preview URL, and set `baseURL` from the request host on preview deployments only. This must be checked against the installed better-auth version before relying on preview sign-up. Otherwise the browser proof runs on the production URL.
11. **§4.10 corrected:** `injection.ts` is imported only by the worker and tests, so nothing needs moving. Check the function size with `VERCEL_ANALYZE_BUILD_OUTPUT=1`.
12. **Tests:** rewrite `tests/helpers/testdb.ts` for Postgres. The ledger, `claim()` and idempotency concurrency tests run against real Postgres (a Supabase dev branch or local Postgres), because PGlite is a single connection. `guard.ts:16` and `worker/index.ts:17` await `appliedVersion()`.

## 5. Environment variables (values go into each platform's settings, never into git)

| Var | Vercel | Railway worker | Local |
|---|---|---|---|
| `DATABASE_URL` | pooler :6543 (transaction) | pooler :5432 (session) | local or dev-project URL |
| `IZWI_STORAGE` | `supabase` | `supabase` | `disk` |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | yes (server only, no `NEXT_PUBLIC_`) | yes | if testing supabase mode |
| `IZWI_MASTER_KEY`, `BETTER_AUTH_SECRET` | new values, generated for hosted | same `IZWI_MASTER_KEY` as Vercel | your own |
| `BETTER_AUTH_URL`, `IZWI_PUBLIC_URL`, `IZWI_HOSTED=1`, `IZWI_CSP_ENFORCE=1` | yes | `IZWI_PUBLIC_URL` | — |
| `IZWI_MAX_UPLOAD_BYTES` | per the plan decision in §3 | — | — |

`.env.example` gains these names with empty values. The hosted master key is new, so no key sealed on a laptop can be opened in the cloud, and the reverse holds too.

## 6. Data migration

None. The hosted database starts empty. Lane C's local database holds sealed provider keys and is **not read, copied or moved**. People sign up again on the hosted site and enter provider keys on the Run on page there.

## 7. Tests and proof

- vitest runs on in-process PGlite (`tests/helpers/testdb.ts`), one fresh database per file. The existing suites must stay green, plus new tests for: `?`→`$n` rewriting, `tx` rollback, a `claim()` race with two clients (on a Supabase dev branch or local Postgres, because PGlite is a single connection), and upload finish refusing mismatched bytes from the storage backend.
- `npm run ci` (tsc, eslint, vitest, build), gitleaks before every commit, one at a time (8 GB RAM).
- Preview deployment, then in the in-app browser: sign up → upload a short `sim_` clip → transcription → render → download → open the consent link at 375 px width. Screenshots go to `design/walkthrough-hosted/`. CRITERIA rows move only with those paths.

## 8. Rollback

- Code: the PR is one revertable merge. After the port, local dev needs Postgres too: SQLite support is removed, not kept beside it, because two dialects would double the testing. Rolling back the code means reverting that merge.
- Hosting: Vercel "Instant Rollback" to the previous deployment; Railway redeploys the previous image; Supabase daily backups (Pro) or a `pg_dump` before each migration (Free).

## 9. Coordination

This rewrites files the A+C session owns (`web/src/server/**`, `web/src/app/api/**`, `web/worker/**`). Rebasing that session's in-flight provider work onto async calls would be painful, so the order is: **A+C lands its open backend work on `main` first → backend file freeze → this port lands as one PR, in about one working day → the freeze lifts.** `Uploader.tsx` (UI lane) gets one small change, which I will flag on PR #15.

## 10. Order of work after sign-off

1. Branch work: db layer + PGlite tests, then the mechanical `await` sweep, then dialect fixes, until `npm run ci` is green on PGlite.
2. Storage interface + upload sign/finish + media redirect, tested in disk mode, then against a Supabase project.
3. Worker Dockerfile; run it locally against Supabase once.
4. (Each with your yes) create the Supabase project + bucket, the Vercel project linked to GitHub, and the Railway service; set env vars in each dashboard.
5. Preview deploy, browser proof, `docs/engineering/DEPLOY.md` runbook, PR to `main`, merge on your yes with CI green.

## Limitations, stated up front

- The reviewer verified the Vercel 4.5 MB request-body limit on Vercel's limits page. Media and voice uploads both bypass Vercel (§4b.5).
- Railway and Render prices come from search summaries of their pricing pages; confirm them in the dashboards before paying.
- `pg_input_is_valid` needs Postgres 16 or later. If the Supabase project runs an older version, the JSON checks are dropped and validated in code instead.
