# Consent page strings

Every string the guest sees on the consent page (`/c/<token>`). English is complete. isiZulu and Setswana are empty on purpose.

How to fill this in:
1. A Zulu or Tswana speaker on the team writes each cell. Keep `{names}` in curly braces and `**bold**` markers exactly as in English.
2. A second person checks the whole column.
3. Copy the checked text into `web/src/lib/consent-i18n.ts` (`zu` or `tn`) and only then set `reviewed: true`. Until then the language stays hidden from guests.

Rules:
- The legal statement the guest agrees to (`consentStatement` in `web/src/server/rights.ts`) is always shown and recorded in English. `statementNote` tells the guest that in their language.
- A reviewed language must have every key. The page throws on a gap instead of mixing languages.
- When a reviewed non-English language is shown, the page adds "Written by Team Sonar".
- No machine translation without a human check.

| Key | English | isiZulu | Setswana |
|---|---|---|---|
| `topLabel` | Permission request |  |  |
| `headline` | {creator} is asking for your permission |  |  |
| `introRole` | You are **{person}**, listed as **{role}**. Nothing happens until you answer, and you can say no. |  |  |
| `intro` | You are **{person}**. Nothing happens until you answer, and you can say no. |  |  |
| `whatTitle` | What you are agreeing to |  |  |
| `whatLead` | {what} in this recording may be: |  |  |
| `scopeAppearance` | Your appearance, voice and words |  |  |
| `scopeVoice` | Your voice |  |  |
| `scopeLikeness` | Your face and likeness |  |  |
| `scopeUnknown` | What the statement below describes |  |  |
| `useClips` | cut into clips |  |  |
| `useCaptioned` | captioned or translated |  |  |
| `usePublished` | published by the creator |  |  |
| `withdrawNote` | **If you withdraw later:** anything already published stays published. |  |  |
| `statementLabel` | Exact recorded statement |  |  |
| `statementNote` | The statement below is in English. The English statement is what is recorded when you answer. |  |  |
| `answerTitle` | Your answer |  |  |
| `statusRequested` | Waiting for your answer |  |  |
| `statusGranted` | You said yes |  |  |
| `statusDeclined` | You said no |  |  |
| `statusRevoked` | You withdrew your yes |  |  |
| `doneGranted` | You said yes. |  |  |
| `doneDeclined` | You said no. |  |  |
| `doneRevoked` | You withdrew your yes. |  |  |
| `recordedAs` | Recorded as **{by}** on {when}. |  |  |
| `afterRevoke` | Clips that were already published stay published. Anything not yet published is held. |  |  |
| `afterGrant` | You can withdraw this later using this same link. |  |  |
| `afterDecline` | {creator} has been told. |  |  |
| `answeredBy` | {answer} as **{by}** on {when}. |  |  |
| `answeredOn` | {answer} on {when}. |  |  |
| `nameLabel` | Type your name to answer, yes or no |  |  |
| `nameHint` | Type: **{person}** |  |  |
| `nameError` | Type your name as shown above: {person} |  |  |
| `linkStopped` | This link has just stopped working. Ask the creator for a new one. |  |  |
| `sendFailed` | That did not go through. Try again. |  |  |
| `sending` | Sending… |  |  |
| `yes` | Yes, I agree |  |  |
| `no` | No |  |  |
| `withdraw` | Withdraw my yes |  |  |
| `seeWhere` | See where you appear |  |  |
| `whereTitle` | Where you appear |  |  |
| `noPreview` | There is no preview to watch yet. You can ask {creator} to show you before you answer. |  |  |
| `wholeRecording` | {creator} says you appear in **the whole recording**. Watch as much as you like. |  |  |
| `part` | Part {n} |  |  |
| `range` | {start} to {end} |  |  |
| `notMarked` | {creator} has not marked where you appear yet. Ask them before you answer. |  |  |
| `recordsNote` | **What IZWI records:** the name you type, the time you answer, and the kind of browser you used. It is kept with this project so {creator} can show you agreed. |  |  |
| `legalNote` | This is a record of your answer, not a legal contract and not legal advice. If you are unsure, ask {creator} or someone you trust before you answer. |  |  |
| `languageLabel` | Language |  |  |
| `writtenBy` | Written by Team Sonar |  |  |

