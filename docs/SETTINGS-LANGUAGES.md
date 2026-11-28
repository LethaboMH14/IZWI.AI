# Creator greeting languages

Status: partial. With `IZWI_FLAG_LANGUAGES=1`, Settings offers a Languages tab for the 11 South African spoken official languages plus South African Sign Language and English. The creator's choices are stored per user, and Home chooses one standard greeting from that selection per day. All greeting strings are in `web/src/lib/greetings.ts` and marked “Needs native-speaker review”; no other UI is translated. Consent and rights screens remain English-only.

Checks: `web/tests/languages.test.ts`, `web/e2e/settings-languages.spec.ts`. The browser test needs a local authenticated owner session and app on `127.0.0.1:4300`; screenshots have not yet been captured.