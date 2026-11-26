> **Seed given to MiroFish, kept as run. Two errors, corrected in [RUN.md](RUN.md):** the consent page is English-only (the isiZulu and Setswana drafts are empty; there is no Sesotho or Afrikaans), and PR #7 had already merged. Do not cite this file as project status.

# IZWI AI: status brief for the simulation (26 November 2026)

## What IZWI AI is
IZWI AI ("izwi" means "voice" in isiZulu) is a creative workspace for South African independent creators: podcasters, YouTubers, short-form creators, educators, musicians, filmmakers, animators, small studios and agencies. The slogan is "One Voice. Every Language. Every Market." The five pillars are Create, Localise, Protect, Publish and Earn. The product loop: the creator says what they want, IZWI shows a plan naming the tool for each step and what needs a human yes, the creator approves, and the jobs run.

## The team and the event
Team Sonar is two people: Lethabo (repo owner and reviewer) and Sibusiso (builder). Much of the code and planning was written with AI coding agents (Claude Code), under an evidence-gated process: a CRITERIA.md file where a claim can only be marked done with a real evidence path. They are competing in the NEMISA Discothon hackathon (challenge: "Creative Industries and AI-Powered Content Creation"), with the presentation on Sunday 29 November 2026 at 13:15.

Judging criteria and points: innovativeness 10, diverse team 10, submission 5, business model 5, cybersecurity 5 (35 in total).

Timeline: feature freeze Thursday 26 November 18:00. Friday 27: real Android and iPhone test pass, QA and security reports. Saturday 28: three rehearsals from a tagged build. Sunday 29: no changes; presentation.

## What is implemented now (verified on the builder's laptop)
- A Next.js 16 web app with SQLite, a job worker, whisper.cpp speech-to-text and FFmpeg rendering, running end to end: upload, transcript, suggested clips with reasons, a consent gate that holds a render until the people in it consent, a 9:16 vertical render with word-by-word captions, and a hand-off zip (SRT, VTT, EDL, OTIO, renders, record sheet).
- Security hardening merged: server-side upload type checks, a nonce Content Security Policy, CSRF origin checks, body and media limits, rate limits, an SSRF guard on all outbound AI-provider calls, tenant isolation tests, a signed hash-chained consent ledger, a threat model and security review documents.
- In review (pull request #7, not yet merged): a streaming studio assistant. It proposes actions (keep, drop or trim a clip, request consent, draft titles) that only run after the creator approves. It routes by privacy class (OpenRouter free models "may log" with redaction of phone numbers, SA ID numbers and names; Meta "standard"; local Ollama "private") and never falls back across privacy classes without asking. Transcript lines pass a prompt-injection classifier (ProtectAI DeBERTa, English-only) and a canary token. A live consent handshake by QR code lets a person consent on their own phone in English, isiZulu, Sesotho or Afrikaans. Each render gets a signed provenance sidecar file.
- 164 automated tests, typecheck, lint and build pass in CI.

## Known gaps on the assistant pull request
1. No Undo for an applied assistant proposal.
2. Lines flagged as prompt injection are silently left out instead of being badged in the interface.
3. The assistant kill switch only hides the panel; the server route ignores it, and switching it needs a rebuild.
4. Creating a proposal is not written to the audit log (only approvals are).

## Not built yet (planned)
- 3D "Story Room" landing scene and Rights map (design mockups still awaiting the owner's sign-off; 2D fallback planned).
- Brand refresh, splash screen and transitions.
- /pricing page with an enforced Free tier and live usage meter; /trust page with security evidence.
- Translation into South African languages (no provider key connected; candidate model MADLAD-400 is untested by native speakers).
- isiZulu speech recognition (candidate model not wired), dubbing, animation, platform publishing, storefront and payments.
- Real creator testing: the plan calls for three real creators; none has been recorded yet. Naledi, the persona, is fictional.

## Business model (proposals, not validated)
Free R0, Creator R149 a month, Studio R499 a month, Agency R1499 a month. Fixed costs are assumed at R85000 a month. Creator-only break-even would need 686 paying subscribers before other variable costs. Six-month targets: 800 registered, 300 first usable exports, 55 paid subscriptions. No revenue, users or partnerships exist yet. Bring-your-own-key and local models are meant to keep inference costs off IZWI.

## Demo plan (about 6 minutes)
Story Room splash, passkey sign-in over a Cloudflare tunnel, a typed prompt ("three TikTok clips and isiZulu draft captions") streamed by the assistant with approval, a planted prompt injection being badged, a judge scanning a QR code and consenting on their own phone in isiZulu so the held clip renders, a provenance check on /trust, and the /pricing page. An offline path runs on local Ollama.

## Main risks the team knows about
- The tunnel and passkey path is untested on real phones and mobile data.
- OpenRouter's free tier allows only 50 requests a day without a $10 top-up.
- The injection classifier is a 739 MB download that has dropped once.
- Two people, four planned lanes, one day before freeze.
