# Deploy and run IZWI AI

This runbook is for the team (Sibusiso first). It covers running IZWI AI locally, running the worker for the hosted site, redeploying, and what to do when something breaks. Plan and reasons: `docs/plans/DEPLOY-PLAN.md`.

## What runs where

| Part | Where | Cost | Notes |
|---|---|---|---|
| Web app | Vercel project `izwi-ai`, team "Lethabo's projects" (Hobby) | free | https://izwi-ai-six.vercel.app. Every push to `main` deploys to production. Hobby is non-commercial. |
| Database | Supabase project `izwi-ai` (London, `eu-west-2`, Free) | free | Postgres 17. A Free project **pauses after 7 days without use**. Unpause it in the Supabase dashboard. |
| Media | Cloudflare R2 bucket `izwi-media` (private) | free up to 10 GB-month | Browsers only get presigned links. CORS allows `https://izwi-ai-six.vercel.app` only. |
| Worker (ffmpeg + whisper) | A team laptop running `npm run worker` | free | Uploads, transcription and renders **wait in the queue until a worker is running**. The studio shows the worker status. |

## Secrets: where they live

Never put a secret in git, chat, an issue or a screenshot. Each one lives in **Vercel → izwi-ai → Settings → Environment Variables** (as type Secret) and, where a laptop needs it, in that laptop's `web/.env.local`, which is gitignored.

| Name | Vercel | Worker laptop | What it is |
|---|---|---|---|
| `DATABASE_URL` | yes (transaction pooler, port **6543**) | yes (session pooler, port **5432**) | Supabase → izwi-ai → Connect. The password is reset in Project Settings → Database. |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | yes | yes | R2 API token "izwi-ai-vercel-and-worker" (Object Read & Write, bucket `izwi-media`). |
| `IZWI_MASTER_KEY` | yes | yes, **the same value** | Seals provider keys. If it changes, stored provider keys can no longer be opened. |
| `BETTER_AUTH_SECRET` | yes | no | Signs sessions. |

Non-secret settings already in Vercel (Production): `IZWI_STORAGE=s3`, `NEXT_PUBLIC_IZWI_UPLOAD=s3`, `S3_BUCKET=izwi-media`, `S3_REGION=auto`, `S3_ENDPOINT=https://c8cca49344815935f42e4f9214b7bbfe.r2.cloudflarestorage.com`, `IZWI_HOSTED=1`, `IZWI_TRUST_PROXY=1`, `IZWI_DB_POOL_MAX=3`, `IZWI_CSP_ENFORCE=1`, `BETTER_AUTH_URL` and `IZWI_PUBLIC_URL` (both `https://izwi-ai-six.vercel.app`).

**Rotate after the hackathon:** reset the Supabase DB password, roll the R2 token, and set a new `BETTER_AUTH_SECRET` (this signs everyone out). Keep `IZWI_MASTER_KEY` unless you are ready for people to re-enter their provider keys.

## Run the worker for the hosted site (Sibusiso's laptop)

Windows, Node 24, Git. In PowerShell:

```powershell
git clone https://github.com/LethaboMH14/IZWI.AI.git
cd IZWI.AI\web
npm ci
npm run setup
```

`npm run setup` downloads the pinned whisper.cpp, the Whisper model, ffmpeg and the caption font, each checked by SHA-256. It is safe to re-run.

Then create `web\.env.local` (it is gitignored) with:

```
DATABASE_URL=<Supabase session pooler, port 5432>
IZWI_STORAGE=s3
S3_BUCKET=izwi-media
S3_REGION=auto
S3_ENDPOINT=https://c8cca49344815935f42e4f9214b7bbfe.r2.cloudflarestorage.com
S3_ACCESS_KEY_ID=<from Lethabo, privately>
S3_SECRET_ACCESS_KEY=<from Lethabo, privately>
IZWI_MASTER_KEY=<same value as in Vercel, from Lethabo, privately>
IZWI_PUBLIC_URL=https://izwi-ai-six.vercel.app
```

Start it, and leave the window open while the team is working:

```powershell
npm run worker
```

It prints `worker … ready · ffmpeg … · whisper …`. While it runs, the hosted studio shows the worker as online and queued jobs start. Ctrl+C stops it cleanly; a job it was running goes back to the queue.

## Run everything locally (development)

Local development uses Postgres too; SQLite was removed. Either point `DATABASE_URL` at a **separate** free Supabase dev project, or at a local Postgres. Do not develop against the production database.

```powershell
cd web
npm ci
npm run setup
npm run db:migrate
npm run dev:all
```

The app opens on http://localhost:3187. With `IZWI_STORAGE` unset, media is stored on disk under `web\storage\`, and uploads use tus as before.

Tests need no database: they run on in-process PGlite. On a machine with 8 GB of RAM, run them one file at a time:

```powershell
npx vitest run --no-file-parallelism
```

## Redeploy

- **Normal:** merge a PR into `main`. CI ("Lane A checks") must be green first. Vercel builds and deploys in about 2 minutes.
- **After changing a Vercel setting:** Vercel → izwi-ai → Deployments → the latest one → ⋯ → **Redeploy**. Settings only reach new deployments.
- **Database change:** add a new entry at the end of `MIGRATIONS` in `web/src/server/migrations.ts` (forward-only), then run `npm run db:migrate` with the production `DATABASE_URL` in your `.env.local` **before** merging. Migrations take an advisory lock, so running them twice is safe.
- **Roll back:** Vercel → Deployments → a previous good one → ⋯ → **Promote to production** (instant). A database migration is not undone by this. Restore a Supabase backup if a migration went wrong.

## When something breaks

| Symptom | Likely cause | Fix |
|---|---|---|
| Uploads stay "queued" | No worker running | Start `npm run worker` on a laptop |
| Every page or API returns 500 | Supabase paused (Free, 7 days idle) or a wrong `DATABASE_URL` | Unpause in Supabase; check the Vercel logs |
| Upload fails at 0% | R2 CORS, or the site is served from a domain other than `izwi-ai-six.vercel.app` | Add the domain to the bucket's CORS policy in Cloudflare |
| Video won't play or download | Wrong R2 token or `S3_ENDPOINT` | Check the R2 settings in Vercel; redeploy |
| Sign-in loops | `BETTER_AUTH_URL` doesn't match the address in the browser | Make both the same origin |
| Worker says "The database needs migrating" | A migration has not been run | `npm run db:migrate` |

## What is checked and what is not (28 Nov 2026)

- Checked: CI green on PR #16 (typecheck, lint, 190 tests, build, gitleaks, semgrep); production migrated to schema version 9; the production deploy succeeded; `/` → 200, `/api/auth/ok` → 200, `/app` → redirect to sign-in.
- Not yet checked on the hosted site: sign-up, an upload through R2, transcription and render through a laptop worker, download, and the consent link at phone width. Record the result here once done.
