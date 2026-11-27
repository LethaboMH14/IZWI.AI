# QA report, 26 November 2026

Measured results only. Each number says which build it came from and how many runs it is. Anything not listed here as measured should be read as unmeasured.

## Builds

| Name here | Commit | State on 26 Nov, 20:45 SAST |
|---|---|---|
| `main` | `6eb0185` | Merged |
| PR #10, freeze fixes | `783af21` | Open, not reviewed |
| PR #11, tunnel fix | `b047783` | Open, not reviewed |
| PR #12, demo reset (documents only) | `c9a00e7` | Open, not reviewed |

Most browser and timing results below come from a PR #10 production build, which is not on `main`.

## Test machine

Windows 11, Intel Core i7-1265U (10 cores, 12 threads), 15 GB RAM, Node 24.20.0, FFmpeg 9.0.2. Everything ran on one laptop over `127.0.0.1` or `localhost`. Other programs were running and load was not controlled. Media is synthetic.

## Automated checks (GitHub Actions)

| Build | Tests passed | Test files | Test run time | Gitleaks | Semgrep (74 rules) | `npm audit --omit=dev` |
|---|---|---|---|---|---|---|
| `main` | 176 | 24 | 32.1 s | no leaks | 0 findings | 0 vulnerabilities |
| PR #10 | 184 | 24 | 33.0 s | no leaks | 0 findings | 0 vulnerabilities |
| PR #11 | 180 | 24 | 32.3 s | no leaks | 0 findings | 0 vulnerabilities |
| PR #12 | 176 | 24 | 33.2 s | no leaks | 0 findings | 0 vulnerabilities |

Each run also passed the build and the criteria, handoff and financial checks. PR #10 and PR #11 have not been tested merged together.

## Consent

PR #10 build, a fictional guest, the guest's request sent from the same machine.

| Measure | Result | Runs |
|---|---|---|
| Guest's yes until the studio's Protect tab shows **Granted** | median 970 ms; 197 to 1341 ms | 6 |
| Server's answer to the guest's yes | 20 to 100 ms | 6 |
| Guest's yes until the project data shows granted (read directly, not on screen) | 51, 55 and 81 ms | 3 |

The screen figure was read from the page's own content. While a request is unanswered the studio asks for updates every 1.5 s, which explains most of the spread. The guest's request was sent from the studio page itself, in the built-in browser with its pane not on display (the page reported itself visible and its timers ran on time). A hidden tab stops updating until it is visible again, and when nothing is pending the interval is 10 s. A real phone and network will add time that was not measured.

## Rendering

A 34.9 s clip to 1080×1920, no captions.

| Measure | Result | Runs |
|---|---|---|
| Render requested until ready | median 50.0 s; 44.3 to 56.8 s | 5 in a row |
| Worker time for the same five renders | median 49.1 s; 43.1 to 55.8 s | 5 |
| Guest's yes until a held render is ready | 32.2, 43.2 and 48.3 s | 1 each, three separate runs |

The three held-render runs used different server modes on different copies of the demo data, so they show a range and not a comparison.

## Provenance and ledger

On the five renders above (PR #10 build):

- `scripts/verify-provenance.ts` printed `OK IZWI signed provenance (not C2PA)` for all five.
- A copy of one render with one byte added failed: `MP4 SHA-256 does not match the signed envelope.`
- `scripts/verify-ledger.ts` reported the consent ledger ok, 6 entries.

## Assistant

| Measure | Result | Runs |
|---|---|---|
| Full reply, local Ollama `llama3.1:8b` | 94.9 s | 1 |
| Full reply, local Ollama `qwen3:1.7b` (earlier walkthrough, `design/walkthrough-laneC.md`) | about 60 to 70 s | recorded there |
| Hosted provider: first token and full turn | **Not measured.** No provider key had been entered | 0 |

The local models are too slow for a live demo on this laptop.

## Prompt-injection check

PR #10 build with `IZWI_FLAG_INJECTION=1`, a synthetic recording with one spoken planted instruction.

- 25 transcript lines scanned after transcription; 1 flagged, the planted one (score 1.0000).
- Upload finished until the scan finished: 22.8 s (one run).
- The assistant reply showed "1 transcript line held back: possible instruction", created no proposal and changed no clip. One run, local model.
- `/trust` reported the check as on.
- Two hand-picked sentences scored 1.0000 (an instruction) and 0.0000 (ordinary speech).

This is not an accuracy measurement. The classifier is English-only. **A line edited after transcription is not scanned again**, so the assistant receives it unchecked.

## Content security policy, enforced

PR #10 build, `IZWI_CSP_ENFORCE=1`, desktop-width browser. A deliberately blocked image was logged first, to show that violations would be seen.

Walked: the sign-in page (with a failed sign-in), home, the studio list, a project's Canvas, Create (preview playback, Review room, AI story), Localise, Protect (new consent link and QR code), Publish (held render, render, hand-off package) and Earn tabs, the assistant panel opened, Run on, Extensions, Team, the consent page (preview and yes), a review page, `/trust` (reported the policy as on) and an upload.

- One kind of violation: `script-src eval`, from the Zod library testing whether it may build code from text. The attempt is inside a `try`, so it was blocked and the pages kept working.
- Not walked: creating an account and onboarding, a licence listing page, passkeys, the microphone, a live assistant reply, phone width.
- Also seen in the console, cause not identified: one React hydration error (#418) and one 404.

The default is still Report-Only.

## Demo reset

- The snapshot and restore blocks (PR #12) behaved as written on scratch folders: they refused while the app ran, refused to overwrite, moved the replaced storage aside and refused a missing snapshot.
- Not run against the live storage folder, and the screens after a restore were not checked.

## Tunnel

Emulated only: requests carrying a public `Host` header were sent to the app on `127.0.0.1`. No Cloudflare or other tunnel service was used.

- On the PR #10 build in hosted mode, whose origin check is the same as `main`'s, creating a project got 403 "Request host is not configured."
- With PR #11's fix, a signed-in flow passed (sign-in, new project, 1.5 MB upload, new consent link, guest page, preview and yes), and requests with a foreign, mismatched or missing `Origin`, or an unknown `Host`, got 403.

## Not measured

Hosted assistant timings; any real phone; any real tunnel, domain or Access policy; passkey sign-in; microphone dictation; translation quality; speech accuracy (X1); accessibility or Lighthouse scores; load or concurrency; penetration testing; a restore over the live data; any use by a creator outside the team.
