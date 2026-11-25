# Lane A build log · 25 November 2026

Integration checkout: `integration/lane-a` based on local merge `317c1e6` of PRs #4 and #5, with Lane A edits in the working tree. Original Studio changes remain in their own checkout.

| Area | Implementation | Evidence and gate |
| --- | --- | --- |
| SQLite migrations | Reconciles clean, earlier hardening, and Studio schema histories. Preserves the existing storyboard script and pricing fields. | `web/tests/migration-history.test.ts` exercises the three histories and verifies repeat runs. Isolated database migrated to v4. |
| Rights and isolation | Scopes media and listing access to the intended output. Final render commit checks the current rights and lease. | `web/tests/access-consent.test.ts` covers consent, workspace isolation and public listing access. Hosted browser checks pending. |
| Render | Two-pass loudness measurement, attempt-specific render keys and cleanup. | `web/scripts/a3-loudness-check.ts` measured −14.0 LUFS and −9.74 dBTP on a synthetic five-second render. See real-media check below for separate evidence. |
| Hosted model routing | Exact HTTPS endpoint and model rules, request and cost reservations before outbound calls, capped prompt and output, recorded usage if supplied. | `web/tests/provider-trial.test.ts`. Five live hosted routes pending. No credits purchased or spent. |
| Hosted access | Separate Studio and consent origins, Access validation at the connector, narrow guest ingress. | `deploy/tunnel/README.md`. Named tunnel, DNS, Access and public verification pending. No public URL issued. |
| Security and submission | CI workflow, data-use policy, threat model, SSDLC and seven portal technology answers. | `.github/workflows/lane-a.yml`, `docs/DATA-USE.md`, `docs/security/THREAT-MODEL.md`, `docs/business/SSDLC.md`. Repository documentation is drafted and remote CI is pending. |
| Automated checks | TypeScript, ESLint, 74 automated tests, runtime npm audit, and webpack production build passed locally. | Tunnel ingress validated with placeholder hostnames. Gitleaks found no matches in `web/src`. A broad local scan included ignored folders and did not pass. Remote CI and its tracked-source scan are pending. |

## Real-media fixtures

The 40-second local QA excerpt and frame come from the DigitalTippingPoint.com interview with Christine Strobl, directed by Paul Donahue (CC BY-SA 2.5). Source licence and attribution are recorded on the [Wikimedia Commons file page](https://commons.wikimedia.org/wiki/File:2004-interview.with.Christine.Strobl.ogv). Derivatives are for isolated QA and are excluded from Git. The local editing declaration is a QA check using the public licence. Public hosting, model uploads of identifiable footage, and separate rights clearance have their own acceptance criteria.

- Authenticated HTTP sign-up, workspace and project creation, resumable upload, and prompt approval succeeded. Probe, proxy, Whisper transcription and clip selection completed. That first run forced English and produced eight caption lines. The production browser used automatic language detection and showed German, so the first render is processing evidence only.
- The authenticated readback hit a local development timeout. The render resumed through server actions against the same project and worker. It was blocked before declaration and completed after declaration. FFprobe verified H.264/AAC, 1080 × 1920, 28.400 s and 6,536,004 bytes. FFmpeg measured −14.0 LUFS and approximately −1.5 dBTP. The output, poster and report are in the ignored `web/.scratch/lane-a-fixtures/` folder.
- The Ollama connection test and direct generation check timed out. The successful run used Whisper locally and rule-based planning. Hosted model testing and full browser acceptance are open.
- Production browser verified the sign-in redirect, account creation, onboarding, real-media upload, transcript, prompt approval, keeping a clip and the declaration hold. Automatic approval review rejected recording a rights attestation for the separate browser fixture, so that browser export was left held.

## Release gate

Lane A is open. Obtain the named tunnel and team-owned DNS, configure the five providers through Run on, and verify the exact production build from authenticated and unauthenticated browser sessions. Verify real example exports, hosted model usage and limits, and team review of the portal evidence. Lane C follows Lane A acceptance, then B, then D.
