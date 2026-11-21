# IZWI AI web: design prototype

Next.js app that holds the interface designs. **Sample data only.** Nothing is sent, stored, uploaded or charged.

```sh
npm install
npm run dev
```

Start at `/design`. See `../docs/design/FRONTEND.md` for the concept, screens, references and known weak points.

- `src/lib/demo.ts`: all sample content shown on screen
- `src/components/Strand.tsx`: the 3D voice strand (Three.js)
- `src/components/Studio.tsx`: the five stage screens
- `src/app/globals.css`: tokens and landing styles; `src/app/app.css`: every other screen
