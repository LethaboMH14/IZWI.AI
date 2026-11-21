# ASR plan: measure, route, correct, fine-tune (X1)

Written 21 Nov 2026. Status: **plan, nothing measured.** No WER in this file is an IZWI result. IDs in brackets (H1, D7, V3 ...) point to rows in `open-source-map.md`. Training and heavy inference run on Kaggle only; this PC reads, writes code and submits.

## A. What is already established (cite by ID)
| ID | Claim | Source row |
|---|---|---|
| A1 | The only open spontaneous, English-mixed SA speech set is research-only. Product training on it is not allowed. | D7 |
| A2 | Swivuriso (CC BY 4.0, gated) gives about 500 h each for zul, xho, sot, tsn, tso and 250 h for ven, nbl. It has no Afrikaans and no English. It bars voice cloning. | D1, F9 |
| A3 | An MIT Whisper-v3-turbo fine-tune of Swivuriso already covers 7 languages. Its 0.1501 WER is on its own split. | H1, F4 |
| A4 | Omnilingual covers zul, xho, tsn, tso, nso, afr; not sot, ven, ssw, nbl. Its zul CER is 17.9 (7B LLM). | H4, F5 |
| A5 | Whisper large-v3 lists af but not zu, xh, st, tn. | H5 |
| A6 | Vulavula ASR: zul and eng production, sot and afr beta, xho/tsn/nso/tso/ssw not available. Its zul is code-switched. | V3 |
| A7 | Meta Muse Voice Transcribe: no SA language, no word timestamps, no confidence. | H9, F3 |
| A8 | Word-level probability is available from faster-whisper and whisper.cpp; CTC models give frame posteriors. | H6, H7 |

## B. Evaluation set (build this before any claim; doctrine 3)
1. **Source (B1).** Real creator clips with recorded consent scoped "evaluation only". Consent is separate from training consent (A9). Public clips are excluded.
2. **Cells (B2).** Language (en, af, zul, xho, sot, tsn, nso, tso) × register (monologue, two-speaker podcast, noisy outdoor/phone) × code-switch (none, English with one Bantu language, two Bantu languages). Empty cells are reported as empty, not filled.
3. **Transcripts (B3).** Two native speakers per clip, independently; a third adjudicates disagreements. Report inter-annotator CER. One written spelling guide per language (for example isiZulu conjunctive writing, English words kept in English spelling) is frozen before annotation.
4. **Tags (B4).** Every word is tagged by language (annotators), so code-switch metrics can be computed by code, not by hand.
5. **Splits (B5).** Dev set (tune thresholds, router, correction) and a **sealed test set** (touched once per comparison). Split by speaker and by episode so no speaker appears in both. Files listed in a manifest with md5; the manifest is committed, the audio is not.
6. **Size (B6).** Not guessed. Pilot first: at least 200 utterances per cell with data, measure the standard deviation of per-utterance WER, then size the test set from that by script. The pilot only decides the size, it is not reported as a result.

## C. Metrics and the three gates
| ID | Rule |
|---|---|
| Q1 | One normaliser (`normalise.py`, versioned, sorted rules) for reference and hypothesis: case, punctuation, numbers as spoken, diacritics kept. Every system sees the same one. |
| Q2 | **WER** and **CER** per utterance, by script (jiwer-style edit distance), never by the model. Corpus WER is reported next to the per-utterance mean. |
| Q3 | **Code-switch error:** (a) mixed error rate over all tokens; (b) **language-span error**: share of annotated language spans whose words are recognised in the wrong language or script; (c) **English-token recall** inside Bantu speech. |
| Q4 | A beats B only if all three pass on the sealed test set: **Mann-Whitney U p < 0.05**; **bootstrap 95% CI** of the mean per-utterance WER difference excludes 0 (10,000 resamples, fixed seed, sorted data); **Cliff's delta reported**. Any gate fails → "no significant difference". |
| Q5 | Limitation stated up front: both systems score the same utterances, so a paired test is more powerful than Mann-Whitney. The doctrine gate is kept as the floor; the paired bootstrap supplies the CI. Results are per cell, with n shown; no pooling to hide a weak cell. |
| Q6 | Determinism: sorted file lists, seeded bootstrap, pinned model revisions (hash), output hashes recorded. |

## D. Routing design
Input → probe (`ffprobe` duration, sample rate; VAD segmentation) → **declared language** from the creator (default) → candidate list → run → confidence check → fallback → log.

| Route (hypothesis, to be tested) | Primary | Fallback / comparator |
|---|---|---|
| en | H5 whisper-large-v3 local | H9 Muse Voice Transcribe (cloud, WAV ≤10 min, $0.18/h) |
| af | H5 (card lists af) | H4 Omnilingual (afr CER 4.7 reported) |
| zul, xho, sot, tsn, tso, nbl, ven | H1 multilingual SA Whisper | H3 (zul), H4 (xho, tsn, tso), Vulavula (zul, sot) |
| nso | H4 Omnilingual (only 13.3 training hours, so the reported CER 5.3 needs checking) | none |
| ssw (Swati) and others | **none open; limited by access** | Vulavula translate lists ssw, ASR does not |
| code-switched Bantu-English | H1 with the Bantu language declared | Vulavula `zul`; compare on Q3 |

Rules: (R1) creator can override the language per file; (R2) LID is only used to separate en/af/Bantu-family (L1) until the L6 classifier is built and tested; (R3) the confidence thresholds for fallback are fitted on the dev set, not guessed; (R4) every decision and model hash is stored with the transcript; (R5) cloud routes send audio off-device only after the creator picks "Your key" or "IZWI cloud" on the Run-on screen; (R6) Meta calls use Standard mode only (F2).

## E. Correction layer
Order, each step measured against "no correction" with Q4 before it ships:
1. **Word confidence.** Whisper `word.probability` (H6/H7) or CTC posteriors (H3/H4). Words below a dev-set threshold are "uncertain". Muse and Vulavula Sesotho give none, so they bypass this step.
2. **Phonetic candidates.** For each uncertain word, candidates from a **South African lexicon**: creator glossary (map C7) + wordlist from MzansiText after the licence audit (map C6) + names. Matching on orthographic edit distance and on Epitran IPA (map C1; zul, xho, tsn, afr). **Gap:** no Epitran map for sot and nso; a small rule table must be written and checked by a native speaker.
3. **KenLM rescoring.** N-gram model (map C2) trained on subword units (isiZulu words are long, so word n-grams are sparse) from the lexicon corpus plus the creator's approved transcripts. For CTC models, beam search with the LM; for Whisper, rescore an N-best list (support for returning N-best in the runtimes is not verified).
4. **Creator confirms.** Suggestions are shown with the original and the reason; nothing is auto-replaced unless the creator accepted that exact correction before (glossary, A10). Accepted corrections feed the glossary only; they do not enter training without the A9 opt-in.
Ship rule: if the layer does not pass Q4 on the sealed test set, it ships as suggest-only, labelled unproven.

## F. Kaggle fine-tune candidates and data licences
Kaggle limits: about 30 GPU hours per week, 12-hour sessions, per search snippets (not primary; check the account page).

| ID | Run | Data and licence | Risk |
|---|---|---|---|
| K1 | Continue H1 (Whisper-v3-turbo) per cell that tests weak | Swivuriso CC BY 4.0 (D1) + NCHLT CC BY 3.0 (D2, D3) + consented creator clips with training opt-in (D10) | Gated dataset needs the team's acceptance; attribution required; Swivuriso ethical use clause |
| K2 | Fine-tune `omniASR-CTC-300M/1B` for **sot** (not in Omnilingual's language file) | D1 sot 503.58 h | fairseq2 recipe; sot absent from base list, so zero-shot start is unknown |
| K3 | Per-language Whisper-v3-turbo at 250 h as the control for K1 | D1; paper baselines: zul 22.79, xho 24.15, sot 17.05, tsn 13.26 WER (1 epoch) | Baselines are on Swivuriso test, not creator audio |
| K4 | English-with-Bantu code-switching | Open licensed data: **none** (D7 research-only). Options: request a commercial licence from Stellenbosch; or collect consented creator data (D10) | `limited by access` until one of those exists |
| K5 | LID classifier (L6) | D1 (CC BY 4.0) | Must be measured on creator audio |
Excluded: MMS-1B-all and any `cc-by-nc` base (H10); Common Voice for zu/xh (too small, D5); Esethu-licensed ViXSD until its terms are read (D9).

## G. Vulavula check (X1)
1. Team creates the account (account creation is a team action, not mine). Free plan: 100 calls per month (V1).
2. Run up to 100 sealed-test-set clips (zul, eng, sot, afr) through `POST /v1/transcribe/sync`; xho/tsn/nso/tso are not offered (V3).
3. Score with the same normaliser and gates (Q1–Q4). Record per-call audio cap and latency (V6, not yet known).
4. Read the full Terms of Service on the platform. The public text lets Lelapa use "technical information and related data" to improve its service (V4); ask in writing whether audio is retained or used for training.
5. Price: Dev Pass $9.99 per 1,000 calls; SMME $49 per 10,000 (V1). Cost per audio hour depends on the cap in step 3.
6. Decision: if Vulavula beats H1 on zul under Q4 and the data terms are acceptable, offer it as an optional "bring your own key" route and as a premium path. Otherwise leave it as a benchmark. Never send a creator's audio without their choice on the Run-on screen (R5).

## H. Not verified (carry to the criteria gap)
Quality of every model on creator audio; H1 conversion to ggml or CTranslate2; N-best from the runtimes; Kaggle quota (secondary sources only); Vulavula audio cap and data retention; MzansiText component licences; Epitran quality for isiZulu; any consent wording reviewed by a lawyer.

## I. Order of work
1. Consent form and evaluation-set manifest (B1–B5). 2. `web/scripts/asr_eval.py` with the normaliser and Q2–Q6, tested on a tiny fixture before any real run. 3. Kaggle notebook scoring H1, H3, H4, H5 on dev. 4. Vulavula run (G). 5. Fit router thresholds on dev, then one sealed-test comparison. 6. Correction layer, gated by Q4. 7. Fine-tunes (K1–K5) only for cells that test weak.
