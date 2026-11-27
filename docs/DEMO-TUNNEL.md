# Demo tunnel runbook: studio and consent over a named tunnel

**Status (26 Nov 2026): planned. No tunnel has been created or run.** `cloudflared` was not installed on the demo laptop when this was written. What was tested is listed under [What has been checked](#what-has-been-checked). A named Cloudflare tunnel is still an assumption.

**Setup chosen on 26 Nov: studio and consent hostnames.** The consent-only setup is kept as the [fallback](#fallback-consent-only).

**Go/no-go: Fri 27 Nov, 14:00.** If the checklist below isn't passing by then, use the fallback.

## What the team needs first

- A Cloudflare account with a domain (zone) added to it. The account owner signs in; nobody shares credentials. Buying a domain is a purchase and needs the account owner's yes.
- Cloudflare Zero Trust turned on for that account, for the Access application in front of the studio.
- `cloudflared` on the demo laptop, installed by the person running it from Cloudflare's official release.
- A build that includes the origin fix in `web/src/server/http.ts` that ships with this runbook. **Without it, this setup refuses the app's own writes** (a new project, an upload, the guest's answer), although sign-in still works.
- `npm run db:migrate` already run.

## What this setup changes

| | |
|---|---|
| Public hostnames | `studio.<team-zone>` (behind Cloudflare Access) and `consent.<team-zone>` (open to the guest) |
| Where the studio opens | Only `https://studio.<team-zone>`. Writes from `localhost` are refused in this mode |
| Sign-in | Cloudflare Access first, then the app's own sign-in |
| Passkey | Tied to the hostname: register a new one on `studio.<team-zone>` |
| Local Ollama | Refused: hosted mode blocks private provider addresses. The offline path needs the fallback setup |

## Set up (once)

Run these as the account owner. `login` opens a browser.

```powershell
cloudflared tunnel login
```

```powershell
cloudflared tunnel create izwi-demo
```

```powershell
cloudflared tunnel route dns izwi-demo studio.<team-zone>
```

```powershell
cloudflared tunnel route dns izwi-demo consent.<team-zone>
```

Then, before the tunnel ever runs, create a self-hosted Access application in Cloudflare Zero Trust for the whole of `studio.<team-zone>`, with a policy that allows only the team's own email addresses. Note its audience (AUD) tag and the team name. Don't put Access on the consent hostname: guests have no account.

Copy [cloudflared.example.yml](../deploy/tunnel/cloudflared.example.yml) to a file outside the repo, for example `C:\Users\<operator>\.cloudflared\izwi-demo.yml`, and fill in every `<placeholder>`. Never commit the filled-in file or the credentials JSON.

```powershell
cloudflared tunnel --config "$env:USERPROFILE\.cloudflared\izwi-demo.yml" ingress validate
```

## Run (each session)

Set the variables in each terminal. They override `web/.env.local` without editing it.

Terminal 1, the app, bound to loopback so only the tunnel and this laptop can reach it. Run from `web/`:

```powershell
$env:IZWI_HOSTED = "1"; $env:IZWI_TRUST_PROXY = "1"; $env:IZWI_PROVIDER_TRIAL = "0"; $env:BETTER_AUTH_URL = "https://studio.<team-zone>"; $env:IZWI_PUBLIC_URL = "https://consent.<team-zone>"; npm run build; if ($?) { npm run start -- -H 127.0.0.1 }
```

Terminal 2, the worker, from `web/`:

```powershell
$env:IZWI_HOSTED = "1"; $env:IZWI_PROVIDER_TRIAL = "0"; $env:BETTER_AUTH_URL = "https://studio.<team-zone>"; $env:IZWI_PUBLIC_URL = "https://consent.<team-zone>"; npm run worker
```

Terminal 3, the tunnel:

```powershell
cloudflared tunnel --config "$env:USERPROFILE\.cloudflared\izwi-demo.yml" run izwi-demo
```

Set any demo flags the same way, in both of the first two terminals (for example `IZWI_FLAG_ASSISTANT` and `IZWI_FLAG_INJECTION`).

**Provider trial mode.** [demo.env.example](../deploy/tunnel/demo.env.example) turns it on with an empty policy. Until someone writes `IZWI_PROVIDER_TRIAL_RULES`, that refuses provider connection tests and translation, so a newly entered key can't pass its test and the assistant only uses keys that have passed. The commands above leave it off, so spending is limited only by the app's assistant budget and the provider's own limits: use a free tier or a capped key. The assistant's chat replies don't pass through the trial policy either way. To keep trial mode on instead, follow the [README](../deploy/tunnel/README.md) and write the rules first.

**First session on the hostname:** open `https://studio.<team-zone>`, pass Access, sign in with email and password, then open **Run on** and press **Add a passkey**. Sign out and back in with it before the demo.

**Consent links keep the address they were made with.** A link created before `IZWI_PUBLIC_URL` changed still points at the old address and is shown only once. Press **Ask again** on the person in Protect to get a new link and QR code. Do this after every demo reset too.

## Checklist (a person does this)

For the phone rows: mobile data on, Wi-Fi off. Do them once on an Android phone and once on an iPhone.

| Step | Expected | Android | iPhone |
|---|---|---|---|
| Scan the QR code from the studio | The consent page opens over HTTPS, with no certificate warning and no Access sign-in | | |
| Read the page | The guest's name, the scope and the English statement show; nothing is cut off | | |
| Play **See where you appear** | The preview plays and the time ranges jump to the right place | | |
| Type the name and press **Yes, I agree** | "You said yes." The studio shows Granted. Note the seconds from tap to studio update | | |
| Press **Withdraw my yes** | "You withdrew your yes." The studio shows it | | |
| Open `https://consent.<team-zone>/sign-in` | 404, not a sign-in page | | |
| Open `https://consent.<team-zone>/api/projects` | 404 | | |

| Step on the studio hostname | Expected | Result |
|---|---|---|
| Open `https://studio.<team-zone>` in a private window | Cloudflare Access sign-in, not the app | |
| Pass Access as someone not on the list | Refused by Access | |
| Sign in on the demo laptop with the passkey | The studio opens | |
| Upload a short recording | It uploads, and the transcript appears | |
| Ask the assistant for a change and approve it | The reply arrives through the tunnel and the change applies | |

Record the results and the timings in the QA report with the date, device and network.

Known and harmless: tapping the IZWI AI logo on the consent page, and the browser's request for a tab icon, return 404 through the tunnel, because neither address is on the allowlist.

## Fallback: consent only

Use this if Access, the studio hostname or the passkey isn't working by the go/no-go. Only the consent page is public; the studio stays on the laptop. It needs no Access application and works without the origin fix. Switching takes a restart, so practise it on Saturday.

1. Stop the tunnel, the app and the worker, and close those terminals so their variables don't carry over.
2. Copy [cloudflared.consent-only.example.yml](../deploy/tunnel/cloudflared.consent-only.example.yml) to a second config file and fill it in.
3. Start the app, from `web/`:

```powershell
$env:IZWI_PUBLIC_URL = "https://consent.<team-zone>"; $env:BETTER_AUTH_URL = "http://localhost:3187"; $env:IZWI_TRUST_PROXY = "1"; npm run build; if ($?) { npm run start -- -H 127.0.0.1 }
```

4. Start the worker (`npm run worker` with the same `IZWI_PUBLIC_URL`) and run the tunnel with the second config.
5. Open the studio at `http://localhost:3187`, not at `127.0.0.1`. A passkey saved on the studio hostname won't work here: sign in with email and password, or add a passkey on `localhost` beforehand. Press **Ask again** for a new consent link.

Plan v4 also says to sign the laptop in before the demo and to run consent on a team phone on a hotspot:

- **If the tunnel works but venue Wi-Fi doesn't,** put the laptop and the team phone on a mobile hotspot and run the tunnel as above.
- **If there is no tunnel at all,** put both on the same hotspot, find the laptop's address on it with `ipconfig`, then start the app and worker with `IZWI_PUBLIC_URL` set to `http://<laptop-address>:3187`, `IZWI_TRUST_PROXY` unset, and `-H 0.0.0.0` instead of `-H 127.0.0.1`. The trade-off: every device on that hotspot can then reach the whole app, including sign-up, over plain HTTP. Use only the team's own hotspot, share its password with nobody else, and stop the app afterwards. Windows may ask whether to allow Node.js through the firewall; the laptop's owner decides.

## Stop and roll back

Stop the tunnel with Ctrl+C, then the app and the worker. Close those terminals so the variables don't carry over. Nothing in the repo or `web/.env.local` changed.

## What has been checked

On 26 Nov, requests shaped like a tunnel's (public `Host` header, `X-Forwarded-Proto`, `Cf-Connecting-Ip`) were sent to a production build on `127.0.0.1` with scratch data. This is an emulation: no Cloudflare service was involved.

**This setup, before the fix** (PR #10's build, whose origin check is the same as `main`'s): sign-up worked, passkey options named the studio hostname and the session cookie was `Secure`, but creating a project got 403 "Request host is not configured." Next.js builds a route's `request.url` from the address the server listens on, not from the `Host` header, and hosted mode compared that address with the configured hostnames. The fix reads the `Host` header in hosted mode.

**This setup, with the fix** (a build of `main` plus the fix, on a copy of the demo data):

| Check | Result |
|---|---|
| Sign in, create a project and upload 1.5 MB on the studio hostname | Passed; the upload address came back relative |
| **Ask again** | Passed; the link used the consent hostname |
| Guest page, preview bytes and yes on the consent hostname | Passed |
| Held render | Released 55 ms after the guest's request started (read from project data), ready after 43.2 s. One run |
| A foreign `Origin`, the other hostname's `Origin`, a missing `Origin`, an unknown `Host` | Each got 403 |
| A write from `localhost` in this mode | 403, as intended |
| A provider call with the example trial settings (checked in code, nothing sent) | Refused: "The hosted trial has no valid provider policy." |

**Consent-only fallback** (PR #10's build): sign-in and project creation on `localhost`, the guest page with its 11 static files, yes and withdraw on the consent hostname all passed; a foreign `Origin` got 403.

**Not checked:** a real tunnel, DNS, Cloudflare Access, that `cloudflared` forwards the public `Host` header as assumed, a passkey sign-in on a real hostname, the assistant through a tunnel, any real phone, and the hotspot fallback.
