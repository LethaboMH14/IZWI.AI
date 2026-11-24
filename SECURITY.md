# Security policy

IZWI AI is a hackathon build by Team Sonar. It runs on one laptop for the NEMISA Discothon demo. It is not a hosted service yet.

## Reporting a vulnerability
Please don't open a public issue. Use GitHub's private reporting instead: go to the repository's **Security** tab and choose **Report a vulnerability**. (A repository admin has to switch this on in Settings → Code security. Until they do, contact the repository owner, @LethaboMH14, on GitHub.)

Include the route or file, the steps to reproduce, and what an attacker gains. We'll reply within 3 days during the hackathon week.

## What is in place
Built and covered by tests in `web/tests/`. The review behind it is in [docs/security/SECURITY-REVIEW-2026-11.md](docs/security/SECURITY-REVIEW-2026-11.md).

- **Uploads:** the server decides the file type from an extension allowlist plus the file's first bytes, never from the browser. An HTML file named `.mp4` is refused.
- **Serving stored files:** media plays inline; anything else downloads as a neutral type. Every response is sandboxed by CSP and carries `nosniff` and `Cross-Origin-Resource-Policy: same-origin`.
- **Cross-site requests:** writes need a matching `Origin` or `Sec-Fetch-Site: same-origin`, including resumable uploads.
- **Limits:** JSON bodies are capped at 64 KB and uploads at 2 GiB by default. Public routes, planning, provider tests, uploads, consent answers and enquiries are rate-limited. The limits are stored in SQLite, so they survive a restart.
- **Outbound calls (SSRF):** every provider call goes through one guarded client. It checks the resolved address at connect time and never follows redirects. Cloud metadata and link-local addresses are always refused; private ranges are refused when `IZWI_HOSTED=1`. Error messages are fixed: we never show the provider's response body.
- **Tenants:** worker lookups and idempotency keys are scoped to the workspace.
- **Secrets:** provider keys are sealed with AES-256-GCM (`IZWI_MASTER_KEY`) and unsealed only inside the request that uses them.
- **Consent ledger:** every consent answer is appended to a hash chain and signed with Ed25519. `cd web && npx tsx scripts/verify-ledger.ts` checks the whole chain.
- **Headers:** pages get a per-request nonce CSP, plus Referrer-Policy, Permissions-Policy, COOP and X-Frame-Options; HSTS is added in production over HTTPS. **The CSP is Report-Only** until `IZWI_CSP_ENFORCE=1` is set. Plan v3 says to enforce it by Wed 26 Nov 12:00.

## Planned, not built yet
- The security CI workflow: npm audit, osv-scanner, gitleaks, Semgrep, CodeQL, SBOM and build attestation. It waits for the foundation-CI PR.
- The studio assistant's prompt-injection defences (Lane C).
- Logs that redact secrets (pino).
- `docs/business/SSDLC.md` and `docs/DATA-USE.md`.

## Rotating `IZWI_MASTER_KEY`
The master key seals provider keys and derives the ledger's signing key.

1. Before you rotate it, note the old ledger public key. `npx tsx scripts/verify-ledger.ts` prints it.
2. Set the new key.
3. Re-enter each provider key on the Run on page, so it is sealed again with the new key.
4. Add the old public key to `IZWI_LEDGER_OLD_KEYS` (comma-separated hex), so older ledger entries still verify.
