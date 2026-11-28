# Security policy

IZWI AI is a hackathon build by Team Sonar for the NEMISA Discothon demo. It runs locally, and the team is setting up a hosted copy. It is not a supported service.

## Reporting a vulnerability
Please don't open a public issue. Use GitHub's private reporting instead: go to the repository's **Security** tab and choose **Report a vulnerability**. (A repository admin has to switch this on in Settings → Code security. Until they do, contact the repository owner, @LethaboMH14, on GitHub.)

Include the route or file, the steps to reproduce, and what an attacker gains. We'll reply within 3 days during the hackathon week.

## What is in place
Built and covered by tests in `web/tests/`. The review behind it is in [docs/security/SECURITY-REVIEW-2026-11.md](docs/security/SECURITY-REVIEW-2026-11.md).

- **Uploads:** the server decides the file type from an extension allowlist plus the file's first bytes, never from the browser. An HTML file named `.mp4` is refused.
- **Serving stored files:** media plays inline; anything else downloads as a neutral type. Every response is sandboxed by CSP and carries `nosniff` and `Cross-Origin-Resource-Policy: same-origin`.
- **Cross-site requests:** writes need a matching `Origin` or `Sec-Fetch-Site: same-origin`, including resumable uploads.
- **Limits:** JSON bodies are capped at 64 KB and uploads at 2 GiB by default. Public routes, planning, provider tests, uploads, consent answers and enquiries are rate-limited. The limits are stored in Postgres, so they survive a restart.
- **Outbound calls (SSRF):** every provider call goes through one guarded client. It checks the resolved address at connect time and never follows redirects. Cloud metadata and link-local addresses are always refused; private ranges are refused when `IZWI_HOSTED=1`. Error messages are fixed: we never show the provider's response body.
- **Tenants:** worker lookups and idempotency keys are scoped to the workspace.
- **Secrets:** provider keys are sealed with AES-256-GCM (`IZWI_MASTER_KEY`) and unsealed only inside the request that uses them.
- **Consent ledger:** every consent answer is appended to a hash chain and signed with Ed25519. `cd web && npx tsx scripts/verify-ledger.ts` checks the whole chain.
- **Headers:** pages get a per-request nonce CSP, plus Referrer-Policy, Permissions-Policy, COOP and X-Frame-Options; HSTS is added in production over HTTPS. **The CSP is Report-Only** until `IZWI_CSP_ENFORCE=1` is set. `/trust` shows which mode the running server is in.
- **Assistant:** proposals only, a per-request canary, redaction before a provider that may log, and an optional transcript injection check (best effort, off by default).
- **CI:** pull requests run `npm audit`, a gitleaks credential scan and a Semgrep scan.

## Planned, not built yet
- osv-scanner, CodeQL, a software bill of materials and build attestation.
- Logs that redact secrets (pino).
- `docs/business/SSDLC.md`.

## Rotating `IZWI_MASTER_KEY`
The master key seals provider keys and derives the ledger's signing key.

1. Before you rotate it, note the old ledger public key. `npx tsx scripts/verify-ledger.ts` prints it.
2. Set the new key.
3. Re-enter each provider key on the Run on page, so it is sealed again with the new key.
4. Add the old public key to `IZWI_LEDGER_OLD_KEYS` (comma-separated hex), so older ledger entries still verify.
