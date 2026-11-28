# IZWI AI web

The studio: a Next.js app, a Postgres database and one worker that runs FFmpeg and whisper.cpp.

Needs Node 24, FFmpeg on the PATH and a Postgres database. In PowerShell, from this folder:

```powershell
npm ci
npm run setup
```

`setup` creates `.env.local` with fresh secrets and downloads the pinned whisper.cpp build, the Whisper model and the caption font, each checked by SHA-256. It does not install FFmpeg or Postgres. Add `DATABASE_URL` to `.env.local` (names are listed in `.env.example`), then:

```powershell
npm run db:migrate
npm run dev:all
```

The app opens on http://localhost:3187. With `IZWI_STORAGE` unset, media is stored in `storage/`. Tests need no database server: `npm run ci` runs typecheck, lint, tests on in-process PGlite and a production build.

The landing page uses sample content from `src/lib/demo.ts`. The studio under `/app` works on real data. See `../docs/design/FRONTEND.md` for the design.
