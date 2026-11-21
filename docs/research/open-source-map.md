# Open-source tool map, one section per IZWI verb

Checked 20–21 Nov 2026. Moves CRITERIA rows X14 (this file), X1, X3, X4, X6, X9, X11, X13.
Reuses the model table in `docs/PLATFORM-PLAN.md`; where that table is now wrong, section 0 says so.
Nothing was installed or run. No model was tested for quality. No key was used.

**How to read it.** Every row has an ID (H1, C1 ...). Cite the ID, not the sentence.
**Source tags:** `[P]` primary page or README fetched and read in full text. `[G]` `gh api`. `[HF]` Hugging Face API or card. `[W]` WebFetch summariser (quote may be paraphrased). `[S]` search snippet only, page not read; treat as a lead. "not verified" means exactly that.
**Calls:** `use now` / `production path` (right answer, blocked on money, access or an approval) / `skip`.
**IZWI is commercial.** A `cc-by-nc` weight is marked SKIP in bold.

---

## 0. Findings that change the plan (F1–F14)

| ID | Finding | Tag |
|---|---|---|
| F1 | **Meta's API is no longer the "Llama API".** Base URL is `https://api.meta.ai/v1`, bearer `MODEL_API_KEY`. Hosted models are Muse Wonder, Spark, Ember, Image, Voice Transcribe, SAM 3.1. No Llama model is listed on its models page. `PLATFORM-PLAN` has `api.llama.com/compat/v1`; that is stale. Not tested with a key. | [P] |
| F2 | **Meta "Contributor mode" trains on your prompts and files.** Use Standard mode only for creator content, or A8/A9 become false. Contributor is not offered on Voice Transcribe, Wonder or Ember. | [P] |
| F3 | **Muse Voice Transcribe lists 25 languages; none is a South African Bantu language, and Afrikaans is absent.** No word timestamps, no confidence. English only is useful. $0.18 per audio hour. | [P] |
| F4 | **A single MIT Whisper-v3-turbo fine-tune covers isiZulu, isiXhosa, Sesotho, Setswana, Xitsonga, isiNdebele, Tshivenda** (`dsfsi-anv/za-anv-multilingual-whisper-v3-turbo`). It was trained on Swivuriso (CC BY 4.0, about 500 h per language for five of them). The card's WER 0.1501 is on its own eval split, not independent. `PLATFORM-PLAN` said only isiZulu and Afrikaans had an open candidate; that is out of date. | [HF][P] |
| F5 | **Omnilingual ASR (Apache-2.0) covers zul, xho, tsn, tso, nso, afr; it does NOT list Sesotho (sot), Venda, Swati or Ndebele** in its language file. | [P] |
| F6 | **Chatterbox is retired** (README, Aug 2026) and has no South African language. `PLATFORM-PLAN` listed it as the dubbing voice. | [P] |
| F7 | **No open TTS with a commercial licence was found for isiZulu, isiXhosa, Sesotho, Setswana or Afrikaans.** Piper has none. MMS-TTS is cc-by-nc. The 11-language SA VITS model is cc-by-nc. | [P][HF] |
| F8 | **The code-switched SA corpus (soap operas) is "Research only".** Usable to evaluate in research, not to train a product model. | [P] |
| F9 | **Swivuriso carries an ethical-use statement against voice cloning.** Do not use it to train TTS or cloning. | [P] |
| F10 | **LTX-Video weights are not Apache.** Code is Apache-2.0; weights have their own licence (free below US$10M annual revenue for the 0.9.6-era licence; LTX-2.x licence text not read). | [P] |
| F11 | **Demucs weights licence is "not clear"** per its own README (MusDB research-only data). Code is MIT. | [P] |
| F12 | **TikTok Research API excludes South African commercial firms** (researchers in US, Europe, Canada, Brazil). Trend data must come from YouTube plus the Google Trends API alpha. | [P] |
| F13 | **Neither Supabase nor Neon has an Africa region.** Nearest are Frankfurt or London. Azure lists South Africa North for Postgres (snippet only). | [P][S] |
| F14 | **OpenCut is mid-rewrite** and cannot be a dependency today. | [P] |

---

## 1. Hear (speech to text for South African languages)

### 1a. Models and services

| ID | Candidate | Licence (code / weights) | Last push or release | Fit and where it loses | Quote | Call |
|---|---|---|---|---|---|---|
| H1 | `dsfsi-anv/za-anv-multilingual-whisper-v3-turbo` https://huggingface.co/dsfsi-anv/za-anv-multilingual-whisper-v3-turbo | MIT / MIT `[HF]` (base-model card licence not read) | HF lastModified 2026-01-21 | Whisper-family, so word probabilities exist for the correction layer. Parameter count and RAM not verified; whisper.cpp lists a `large-v3-turbo` build target; HF-to-ggml conversion not verified. **Loses:** WER 0.1501 and CER 0.0510 are pooled over its own eval, no per-language figure on the card, no English or Afrikaans, hallucinates on silence (card says so). Code-switching with English not measured. | "may generate repetitive text or hallucinations" | **use now** (evaluate first, X1) |
| H2 | Per-language siblings `dsfsi-anv/whisper-large-v3-turbo-anv-{zul,sot,tsn,tso,ven}` | MIT `[HF]` | Oct 2025 | Same data. Paper reports 250 h fine-tunes: zul 22.79, xho 24.15, sot 17.05, tsn 13.26 WER. **Loses:** one model per language, so routing must pick; multilingual H1 may be simpler. | "WER improved from 39.63% at 50 hours to 24.15% at 250 hours" | evaluate against H1 |
| H3 | `uctnlp/omniASR-CTC-300M-v2-Zulu-All-v2` https://huggingface.co/uctnlp/omniASR-CTC-300M-v2-Zulu-All-v2 | Apache-2.0 / Apache-2.0 `[HF]` | HF updated 3 Oct 2026 | 326M params, CTC, so small and fast. **Loses:** isiZulu only. Training mix unspecified ("all isiZulu ASR training data in our mix") so data provenance not verified. No Whisper-style word probabilities, but CTC posteriors work for confidence. | "Best validation WER: **17.75** (step 685,000)." | **use now** as isiZulu contender |
| H4 | Meta Omnilingual ASR https://github.com/facebookresearch/omnilingual-asr | Apache-2.0 / Apache-2.0 `[G][P]` | Repo push 2025-12-30; release 0.2.0 2025-12-22 | 1,600+ languages. 7B LLM variant needs ~17 GiB VRAM, 300M CTC variant is the only one near this PC. **Per-language (7B LLM, from the repo CSV):** afr CER 4.7 (244.7 h), xho 4.9 (598.8 h), tsn 6.7, tso 0.8, nso 5.3 (only 13.3 h), zul 17.9 (633.7 h). Not in language file: sot, ven, ssw, nbl. **Loses:** CER not WER; zul CER 17.9 is weak; fairseq2 stack is awkward on Windows (not verified). | "Omnilingual ASR code and models are released under the Apache 2.0" | **use now** for xho, tsn, tso, nso, afr. Kaggle only. |
| H5 | `openai/whisper-large-v3` https://huggingface.co/openai/whisper-large-v3 | MIT code (`[G]`), Apache-2.0 weights (`[HF]` card says `license: apache-2.0`) | HF lastModified 2024-08-12 | Language tags include af, sn, sw, yo; **no zu, xh, st, tn**. Right choice for Afrikaans and English baseline. **Loses:** nothing for zu/xh/st/tn because it does not claim them. | `license: apache-2.0` | **use now** for en, af only |
| H6 | faster-whisper https://github.com/SYSTRAN/faster-whisper | MIT `[G]` | push 2026-11-12; release v1.2.1 2025-10-31 | `Word.probability` exists in source (`transcribe.py` line 36); `word_timestamps=True` in README. Fits Node via a Python worker. **Loses:** needs CTranslate2 conversion of H1; not verified to work. | "Faster Whisper transcription with CTranslate2" | **use now** (runtime) |
| H7 | whisper.cpp https://github.com/ggml-org/whisper.cpp | MIT `[G]` | push 2026-11-20; release v1.9.5 2026-10-06 | README memory table: large ~3.9 GB, medium ~2.1 GB. CPU-only works. `-ojf` full JSON and per-token probability code exist in `cli.cpp`. Already the project's local worker. **Loses:** converting H1 to ggml not verified. | "Support for CPU-only inference" | **use now** (local runtime) |
| H8 | Lelapa AI Vulavula API https://docs.lelapa.ai/ | Commercial SaaS, closed. Not open source. | Docs modified 14 Jul 2026 | See 1c. **Loses:** price per call; xhosa ASR "Not Available Yet". | "our `zul` (isiZulu) support is code-switched isiZulu." | **production path** and benchmark |
| H9 | Meta Muse Voice Transcribe (`POST https://api.meta.ai/v1/asr/transcribe`) | Commercial API | Docs read 21 Nov 2026 | English only for our use. WAV only, up to 10 min, 32 MB per request. Keyword biasing exists. **Loses:** F3. | "25 evaluated languages with code-switching" | `use now` for English only, optional |
| H10 | **`facebook/mms-1b-all`, `lelapa/InkubaLM-0.4B`, NLLB** | **cc-by-nc-4.0** | from `PLATFORM-PLAN` | Non-commercial. | `license:cc-by-nc-4.0` (InkubaLM tag, `[HF]`) | **SKIP** |

### 1b. Spoken language ID (LID)

| ID | Candidate | Licence | Fit and where it loses | Call |
|---|---|---|---|---|
| L1 | Whisper's own LID | Apache-2.0 | Knows af, not zu/xh/st/tn. Only safe to separate en vs af. | use now, restricted to {en, af} |
| L2 | `speechbrain/lang-id-voxlingua107-ecapa` | Apache-2.0 `[HF]` | Language list includes af, sn, sw; no zu/xh/st/tn in the tags. | skip for Bantu, fine for af |
| L3 | `facebook/mms-lid-4017` | **cc-by-nc-4.0** `[HF]` | Lists zu, xh, af, ts. Non-commercial. | **SKIP** |
| L4 | Omnilingual LLM-ASR with language conditioning (H4) | Apache-2.0 | README table: "ASR with optional language conditioning". Gives per-language scoring but no LID head. | use for scoring |
| L5 | Vulavula LanguageID (beta for zul, eng, sot, afr) `[P]` | Commercial | Beta only. | benchmark only |
| L6 | **Build one**: small classifier on Swivuriso (CC BY 4.0) embeddings, trained on Kaggle | CC BY 4.0 data | Only open path for zu vs xh vs st vs tn. Must be measured. | **production path** (see asr-plan) |

### 1c. Lelapa Vulavula (X1 check) `[P]`

| ID | Fact | Quote |
|---|---|---|
| V1 | Plans: Free 100 calls/month; Dev Pass $9.99 for 1,000; SMME $49 for 10,000; Enterprise 500,000+. Pricing page and docs differ on SMME ($49.99 vs $49). Only successful calls billed. | "Only successful API calls are billed" |
| V2 | Rate limits 60 req/min (Free, Dev), 120 (SMME). | "Limits apply per project." |
| V3 | ASR: isiZulu and South African English production; Sesotho, Afrikaans, African French in beta; **isiXhosa, Setswana, Sepedi, Xitsonga, Swati: not available**. TTS "Coming Soon". Translate zul/sot/afr production; xho beta. | table in `/overview/language-support` |
| V4 | Terms: licensee owns output. Lelapa may use provided data and technical data to improve its service. | "Licensee has rights to any output generated through Software use." |
| V5 | Terms permit commercial or non-commercial use via your own platforms. | "on commercial or non-commercial basis" |
| V6 | Audio length limit per call and SLA: not verified (sync doc lists formats WAV, MP3, FLAC, AAC, OGG, MP4, AIFF, OPUS only). Contract-grade data-use terms: not verified (full terms sit behind the platform). | |

Cost sketch (arithmetic only): one 60-minute episode as 10-minute chunks is 6 calls. Dev Pass 1,000 calls is about 166 hours. Not checked against any per-call duration cap (V6). Call: **benchmark with the free 100 calls on the eval set (account creation is a team action), then decide.**

### 1d. Datasets (training and evaluation)

| ID | Dataset | Licence (exact) | Content | Use in IZWI |
|---|---|---|---|---|
| D1 | Swivuriso / African Next Voices `dsfsi-anv/za-african-next-voices` (gated) https://huggingface.co/datasets/dsfsi-anv/za-african-next-voices | `license:cc-by-4.0` `[HF]`; paper: "adopted the Creative Commons Attribution 4.0 International (CC BY 4.0) license" `[P]` | zul 502.85 h, xho 504.28, sot 503.58, tsn 502.18, tso 500.15, ven 250.89, nbl 251.86. Scripted + unscripted. No Afrikaans, no English. | **Train and eval.** Gated: team must accept terms. **Ethical statement bars voice cloning (F9)** so never TTS. |
| D2 | NCHLT Speech (SADiLaR handles 20.500.12185/275 zul, /278 sot, /279 xho, /281 tsn; others exist) https://repo.sadilar.org/handle/20.500.12185/275 | "Creative Commons Attribution 3.0 Unported License (CC BY 3.0)" `[P]` | ~56 h each, scripted, 2014 | Train/eval. Read speech, so weak for podcasts. |
| D3 | NCHLT Speech II (handle /273) | "Creative Commons Attribution 3.0 South Africa (CC BY 3.0 ZA)" `[P]` | Parliament Hansard aligned audio, 4.34 GB | Train; parliamentary register. |
| D4 | FLEURS `google/fleurs` | `license:cc-by-4.0` `[HF]` | Read speech, zul, xho, afr, nso among 102 languages; ~48 h across 4 SA languages per Swivuriso Table 1 | **Eval only** (read speech, small). |
| D5 | Mozilla Common Voice (zu, xh, af) | CC0 (generally); Zulu v24 datasheet: 203 clips, 0.31 h, 0.02 h validated, 8 speakers; Xhosa v25: 30 clips, 0.04 h `[S]` | Tiny for zu and xh. Afrikaans hours: **not verified**. | Do not plan around it. |
| D6 | Omnilingual ASR corpus `facebook/omnilingual-asr-corpus` | `license:cc-by-4.0` `[HF]` | 348 under-served languages; which SA languages and hours: not verified | Possible extra for nso/tso; check first. |
| D7 | Code-switched soap-opera corpus https://repo.sadilar.org/handle/20.500.12185/545 | "License Research only." `[P]` | 26.9 h, isiZulu/isiXhosa/Setswana/Sesotho with English, spontaneous | **Do not train a product model on it.** Ask Stellenbosch (Thomas Niesler) for a commercial licence. |
| D8 | Lwazi ASR (telephone, 10 languages, ~80 h, CC BY 3.0 per Swivuriso Table 1) | CC BY 3.0 (secondary source) `[P]` | 8 kHz telephone | Low priority. |
| D9 | Vuk'uzenzele (ViXSD, isiXhosa) | Esethu licence: "non-African commercial entities pay licensing fees" `[S]` | 9 h | Terms not read; skip until read. |
| D10 | Creators' own consented clips | Consent record (A9) | The only set that matches real creator audio | **Evaluation set backbone** (asr-plan). |

**Where the real gap is:** there is no open, licensed, spontaneous, English-mixed speech set in any South African language. D7 is the only one and it is research-only. That is why D10 must be built.

---

## 2. Correct (post-ASR correction layer)

| ID | Candidate | Licence | Last push | Fit and where it loses | Quote | Call |
|---|---|---|---|---|---|---|
| C1 | Epitran https://github.com/dmort27/epitran | MIT `[G]` | 2026-10-08 | Rule-based orthography to IPA. README table has `zul-Latn`, `xho-Latn`, `tsn-latn`, `afr-Latn`. **No Sesotho (sot) or Sepedi (nso) map**, so write a small rule table for those (Sesotho is near-phonemic; correctness not verified). | "zul-Latn Zulu" (table row) | **use now** |
| C2 | KenLM https://github.com/kpu/kenlm | LGPL for most code `[P]`; GitHub shows NOASSERTION | 2025-03-30 | N-gram rescoring, CPU, tiny memory. Build on Linux worker or Kaggle; Windows build not verified. LGPL: link dynamically or call as a separate process. **Loses:** stale; no morphology (agglutinative isiZulu has very long word forms, so word n-grams are sparse; use subword or BPE units). | "Most of the code here is licensed under the LGPL." | **use now** (as a process) |
| C3 | pyctcdecode https://github.com/kensho-technologies/pyctcdecode | Apache-2.0 `[G]` | 2023-07-13 (stale) | CTC beam search with KenLM support (from memory, README not read here), meant for CTC models such as H3/H4. **Loses:** unmaintained 3+ years. | | use with care |
| C4 | espeak-ng https://github.com/espeak-ng/espeak-ng | GPL-3.0 `[G]` | 2026-11-19 | Its `languages.md` lists Afrikaans and Setswana; no isiZulu or isiXhosa found. GPL: separate process only. | | skip (C1 covers more) |
| C5 | Phonetisaurus https://github.com/AdolfVonKleist/Phonetisaurus | BSD-3-Clause `[G]` | 2024-06-01 | Needs a pronunciation lexicon we do not have. | | skip |
| C6 | MzansiText `uctnlp/mzansi-text` | `license:odc-by` tag `[HF]`; paper CC BY 4.0 `[P]` | HF modified 12 Nov 2026 | Curated corpus for all 11 SA languages, 3,943,584 train rows. Built from other corpora (Glot500, CulturaX, WURA, Inkuba-Mono, ParaCrawl cited). **Component licences not verified**, so the ODC-By tag may not clear every row. | "An Open Corpus and Decoder-Only Language Model" (title) | **use now for LM and wordlist**, after a licence audit of the sources |
| C7 | The creator's own glossary and transcripts | owned by creator | | Highest-precision source for names and brand words; already built (A10). | | use now |
| C8 | `lelapa/Inkuba-Mono` | not verified | | Lelapa's models are NC; corpus licence not checked | | not verified |

---

## 3. Watch (computer vision)

| ID | Candidate | Licence | Last push | Fit and where it loses | Quote | Call |
|---|---|---|---|---|---|---|
| W1 | PySceneDetect https://github.com/Breakthrough/PySceneDetect | BSD-3-Clause `[G]` | 2026-11-20 | Shot-cut detection, CPU, OpenCV. Fits Python worker. **Loses:** cuts only, no meaning. | "scene cut/transition detection program & library" (GitHub description) | **use now** |
| W2 | OpenCV zoo YuNet face detector https://github.com/opencv/opencv_zoo | Apache-2.0 repo `[G]` (per-model terms not read) | 2026-10-20 | Face-detection models collection; which models, sizes and per-model licences: not read. | | check the YuNet file licence, then use |
| W3 | MediaPipe https://github.com/google-ai-edge/mediapipe | Apache-2.0 `[G]` | 2026-11-20 | Face and pose tasks; web and Python support from memory, not verified here. | | use now after a spike |
| W4 | InsightFace | MIT code, **models "non-commercial research purposes only"** `[P]` | 2026-10-19 | | "available for non-commercial research purposes only" | **SKIP** |
| W5 | Ultralytics YOLO | **AGPL-3.0** `[G]` | 2026-11-20 | Copyleft over a hosted service. | | skip |
| W6 | PaddleOCR https://github.com/PaddlePaddle/PaddleOCR | Apache-2.0 `[G]` | 2026-09-16 | On-screen text. "PP-OCRv6 supports 50 languages". Whether it reads isiZulu diacritics: **not verified** (on-screen text is mostly English in SA video). | "100+ Languages Supported" | use now |
| W7 | Tesseract https://github.com/tesseract-ocr/tesseract | Apache-2.0 `[G]` | 2026-11-20 | CPU fallback. SA language packs not checked. | | fallback |
| W8 | EasyOCR | Apache-2.0 `[G]` | 2026-11-13 | | | alternative |
| W9 | Meta Muse Ember or Spark via API (`https://api.meta.ai/v1`) | Commercial API; Standard mode | docs 21 Nov 2026 | Takes image, video, audio, PDF; API pricing: Ember input $0.10 per 1M tokens, Spark $1.25 in / $4.25 out per 1M, Standard mode. Image limits: 50 images per request, 50 MB inline. Not tested with a key, so quality for scene description unknown. **Loses:** F1/F2; South Africa is not in Meta's restricted-territory list `[P]`. | "processing large collections of images, files, and records" (Ember) | **production path**; satisfies "powered by Meta Models API" if keyed (A2) |
| W10 | Muse Glimmer 30B `meta-models/Muse-Glimmer-30B` | Apache-2.0 weights `[P][HF]` | created 9 Aug 2026 | Image+text. Q4 GGUF ~17 GB. **Does not fit the 8 GB PC.** Kaggle or hosted only. | "weights are released under the Apache License 2.0" | production path (self-host) |
| W11 | SmolVLM2-500M-Video / 2.2B `HuggingFaceTB/...` | Apache-2.0 `[HF]` | 2026-11-12/13 | Small video-capable VLM, plausible on 8 GB. Quality unmeasured. | | **use now** for local scene captions, measure first |
| W12 | Moondream2 | Apache-2.0 `[HF]` | 2026-09-23 | Tiny captioner. | | alternative |
| W13 | Qwen3-VL-2B/8B | Apache-2.0 `[HF]` | Oct 2025 | | | alternative |
| W14 | Qwen2.5-VL-3B | **`qwen-research`** `[HF]` | | Not a plain commercial licence. | | **SKIP** (use 7B Apache instead) |
| W15 | Llama 4 Scout | **`llama4` community licence, gated** `[HF]` | May 2025 | Not hosted on Meta's current models page (F1), so the "Llama 4 vision via the Meta Llama API" plan is **unverified**. | | skip unless a key proves it |
| W16 | TwelveLabs https://www.twelvelabs.io/pricing | Commercial, closed | pricing read 21 Nov 2026 | Free $0 (3 GB storage), Plus $29, Pro $99 per month, Enterprise custom. Video leaves SA. An older pay-as-you-go page lists Marengo $0.042/min `[S]`; plans changed. **Loses:** closed, cost scales with hours, data location not verified. | "Start free. Choose a plan as you grow." | **production path / comparator**, not open source |
| W17 | SAM 3.1 (open weights, also on Meta API) | not verified | | Segmentation by text prompt; useful later for reframing. | | later |

---

## 4. Translate

| ID | Candidate | Licence | Fit and where it loses | Call |
|---|---|---|---|---|
| T1 | `google/madlad400-3b-mt` https://huggingface.co/google/madlad400-3b-mt | **Apache-2.0** (tag `license:apache-2.0` and card line "License: Apache 2.0") `[HF][P]`; HF lastModified 2023-11-27 | **Confirmed.** Tags include af, zu, xh, st, tn, nso, ts, ve, ss, nr, sw, en. 2.94B parameters, so not comfortable on 8 GB; a `gguf` tag exists. **Loses:** old (2023), quality per language unmeasured, and no tests with native speakers. | **use now** on Kaggle or hosted GPU, behind a review screen |
| T2 | Vulavula Translate | Commercial | zul, sot, afr production; xho beta (V3). | production path, benchmark |
| T3 | Muse Spark/Ember translation | Commercial | Not evaluated. | not verified |

**Flag:** a note for `PLATFORM-PLAN`: the tag list shows `nr` for isiNdebele and `ss` for Swati, both covered. Quality is the open question, not coverage.

---

## 5. Voice (TTS and voice cloning with consent)

| ID | Candidate | Licence | Fit and where it loses | Quote | Call |
|---|---|---|---|---|---|
| S1 | Piper voices `rhasspy/piper-voices` | `license:mit` repo card `[HF]` (per-voice licences vary, not checked); original `rhasspy/piper` archived 2025-08-26, successor `OHF-Voice/piper1-gpl` GPL-3.0 `[G]` | Voice folders list: no af, zu, xh, st, tn, and no `en_ZA`. Swahili has one. | (folder listing 20 Nov 2026) | **skip** for SA languages |
| S2 | Chatterbox https://github.com/resemble-ai/chatterbox | MIT `[P]` | 23 languages incl. Swahili; **no SA language**; retired Aug 2026. | "Chatterbox is retired research and is no longer maintained." | skip for SA; MIT archive usable for English cloning only |
| S3 | MMS-TTS `facebook/mms-tts-*` | **cc-by-nc-4.0** `[HF]` | Non-commercial. | `license:cc-by-nc-4.0` | **SKIP** |
| S4 | `guymandude/South-African-TTS-11-Vits` | **cc-by-nc-4.0** `[HF]`, gated | Lists afr, eng, nbl, nso, sot, ssw, tsn, tso. | | **SKIP** |
| S5 | Azure AI Speech (commercial) | Commercial | `af-ZA` (Adri, Willem) and `zu-ZA` (Thando, Themba) voices per Microsoft pages `[S]`; live voice list not read. Cloning needs separate access: not verified. | | **production path**, confirm on live list |
| S6 | Vulavula TTS | Commercial | "Coming Soon" for zul, sot, xho, nso, eng, afr `[P]`. | | watch |
| S7 | Train our own on Kaggle | | **Blocked by data:** Swivuriso forbids it (F9). Other SA speech sets are read ASR corpora not recorded for TTS; consent for voice reuse not verified. | | **limited by access** |

Voice cloning with consent: the consent record (A9) must name the voice, the languages and the uses. No licensed SA-language cloning model exists in this map, so X3 stays `limited by access` for isiXhosa, Sesotho, Setswana; Afrikaans and isiZulu depend on S5.

---

## 6. Music

### 6a. Licensed tracks

| ID | Source | Licence terms | Fit and where it loses | Call |
|---|---|---|---|---|
| M1 | Openverse audio API `https://api.openverse.org/v1/audio/` | Per-track CC licences. Probe with `license_type=commercial` returned Jamendo tracks tagged CC BY 3.0; provider stats list Jamendo (644,709), Wikimedia Commons audio (4,004,378), Freesound (591,899) `[P]` (live API call, anonymous). | Machine-readable licence per track, so the app can store licence and attribution. **Loses:** CC BY needs credit in the video description; quality varies; commercial filter must still be re-checked per track. | **use now** |
| M2 | Pixabay music | Content Licence: may be used in a larger creative work, not redistributed as a standalone file `[S]`; its API docs page covers images and video, music API not verified | Good for a curated pack. **Loses:** no verified music API; YouTube Content ID claims possible `[S]`. | use manually, ask Pixabay about API |
| M3 | Free Music Archive | Per-track licences incl. non-commercial and an FMA personal-use licence `[S]`; API docs not found | Mixed licences are the risk. | use only CC0/CC BY filtered; API not verified |
| M4 | Jamendo | API plans: "Non-Commercial Apps … Up to 35,000" requests/month; commercial apps contact sales `[P]`. Jamendo Licensing sells paid sync licences covering YouTube `[S]` | Licensing catalogue is a real **production path** for premium music. | production path |
| M5 | Freesound (via Openverse) | per-sound CC | effects | use now |

### 6b. Generation, separation, analysis, mixing

| ID | Candidate | Licence | Fit and where it loses | Quote | Call |
|---|---|---|---|---|---|
| M6 | MusicGen (audiocraft) https://github.com/facebookresearch/audiocraft | Code MIT `[G]`; **weights CC-BY-NC 4.0** `[HF][P]` | | "model weights are released under CC-BY-NC 4.0." | **SKIP** for weights |
| M7 | Stable Audio Open `stabilityai/stable-audio-open-1.0` | Stability Community Licence (HF `other stable-audio-community`), gated `[HF]` | Free for small revenue only: "annual revenue of less than US $1,000,000" `[P]` (licence agreement page). Training-data provenance on the card not read. | | acceptable short term, **production path** (re-check at US$1M) |
| M8 | ACE-Step https://github.com/ace-step/ACE-Step | Apache-2.0 repo `[P]`; HF `ACE-Step-v1-3.5B` apache-2.0, `Ace-Step1.5` tagged `mit` `[HF]` | Last push 2026-02-15. Needs a GPU, so Kaggle or hosted. Training-data and copyright statement not verified; the README only has a generic misuse disclaimer. | "This project is licensed under Apache License 2.0" | **use now** for evaluation on Kaggle; label output AI-generated |
| M9 | Demucs https://github.com/adefossez/demucs | MIT code; **weights "not clear"** `[P]`; `facebookresearch/demucs` archived 2024-04-24 | Stem separation. Only for analysis (find vocals, beat), not for shipping stems. | "The license of the weights is not clear" | **use for analysis only** pending legal read |
| M10 | librosa https://github.com/librosa/librosa | ISC `[G]` | Beat tracking, onsets. Python worker. | | **use now** |
| M11 | aubio https://github.com/aubio/aubio | **GPL-3.0** `[G]` | Copyleft; separate process only. librosa covers it. | | skip |
| M12 | FFmpeg `sidechaincompress` (ducking) and `loudnorm` | LGPL baseline per `OPEN-SOURCE-TOOLS.md` (not re-verified here); GPL/nonfree if the build enables them | Both filters exist in the current docs. Recipe from the doc: `[1:a]asplit=2[sc][mix];[0:a][sc]sidechaincompress[compr];[compr][mix]amerge` (voice as the sidechain). Two-pass `loudnorm` for files. | "EBU R128 loudness normalization." | **use now** |

---

## 7. Effects and animate

| ID | Candidate | Licence | Last push | Fit and where it loses | Call |
|---|---|---|---|---|---|
| E1 | FFmpeg filters | as M12 | | Exist in the current filter doc `[P]`: `xfade`, `zoompan`, `drawtext`, `subtitles`, `chromakey`, `lut3d`, `vignette`, `afade`, `acrossfade`, `amix`, `silencedetect`, `showwaves`. Recipes are not yet written or tested here. | **use now** (build the effects library on these) |
| E2 | Motion Canvas https://github.com/motion-canvas/motion-canvas | MIT `[G]` | 2026-07-02 | "A TypeScript library that uses generators to program animations." Fits Node; headless render path not verified. | use for kinetic text and explainers; test render on CI |
| E3 | lottie-web https://github.com/airbnb/lottie-web | MIT `[G]` | 2025-09-01 (14 months stale) | Plays After Effects JSON in the browser. | prefer E4 |
| E4 | dotlottie-web https://github.com/LottieFiles/dotlottie-web | MIT `[G]` | 2026-11-18 | Maintained player. | **use now** |
| E5 | LottieFiles free animations | Lottie Simple License; commercial use allowed; attribution "not required but encouraged"; "shared or modified" files keep the licence `[S]`; each animation may carry its own terms | | store licence per asset | use after per-asset check |
| E6 | Wan2.1 https://github.com/Wan-Video/Wan2.1 | Apache-2.0 code and weights `[P][HF]` | 2026-03-05 | GPU video generation. Wan2.2 also Apache-2.0 on HF. Kaggle or hosted only. | production path; **licence confirmed** |
| E7 | LTX-Video https://github.com/Lightricks/LTX-Video | **Code Apache-2.0; weights separate** `[P]` | 2026-11-02 | 0.9.6-era licence: "entities with annual revenues of at least $10,000,000" need a paid licence; LTX-2.x Community Licence: **not read** | production path; **do not state "Apache-2.0" for weights** |
| E8 | Blender open movies (test media) | **CC BY 3.0**: Big Buck Bunny, Sintel (Durian), Tears of Steel `[P]` | | Real animation and live-action VFX with credit rules. Spring and others: not verified. | **use now** as X10 animation test media; keep credit |

---

## 8. Graph and edit UI

| ID | Candidate | Licence | Last push | Notes | Call |
|---|---|---|---|---|---|
| G1 | xyflow / React Flow https://github.com/xyflow/xyflow | MIT `[G]` | 2026-11-19 | Free; the "remove attribution" feature is a paid subscription `[P]`. **Worth adopting when** users create or rewire edges by dragging, need zoom/pan on large graphs, minimap, or auto-layout. Lane A's plain CSS + SVG is right while the graph is read-mostly and small. | stay SVG now; revisit at X7 graph-editing |
| G2 | OpenCut https://github.com/OpenCut-app/OpenCut | MIT `[G]` | 2026-09-24 | "OpenCut is being rewritten from the ground up." API and plugin system are future items. | skip as dependency; UX reference |

---

## 9. Publish and analytics (official APIs only)

| ID | Item | Verified facts | Quote | Call |
|---|---|---|---|---|
| P1 | YouTube Data API v3 `videos.insert` https://developers.google.com/youtube/v3/docs/videos/insert | Upload up to 256 GB. Default quota: "100 videos.insert calls" per day per project `[P]` (quota page). Unverified API projects are no longer forced private (older text said they were; current reference says not). AI disclosure field `status.containsSyntheticMedia` exists. Audit and quota extension via a form. | "Videos uploaded from unverified API projects are not restricted to private viewing mode." | **production path**; team registers a Google Cloud project and OAuth consent; audit before scale |
| P2 | YouTube Analytics API https://developers.google.com/youtube/analytics | Retrieves viewing stats and popularity metrics for channels and videos; Reporting API for bulk reports. OAuth by the creator. | "retrieve YouTube Analytics data" | production path (X9, C4) |
| P3 | TikTok Content Posting API (Direct Post) | Unaudited clients private only; error `unaudited_client_can_only_post_to_private_accounts`; an audit lifts it. A search snippet says unaudited clients cap at 5 users per 24 h `[S]`. | "All content posted by unaudited clients will be restricted to private viewing mode." | **limited by access** until app approved and audited |
| P4 | Instagram Graph API content publishing | Professional (business or creator) account; Page requirements including Page Publishing Authorization; media on a public URL; limit "100 API-published posts" per 24 h (other Meta pages still say 50; check `content_publishing_limit`); JPEG only for images; page text says Reels and stories not supported while its intro lists reels (inconsistent). | "Instagram accounts are limited to 100 API-published posts" | **limited by access** (Meta app review) |
| P5 | Postiz https://github.com/gitroomhq/postiz-app | AGPL-3.0 `[G]`, push 2026-11-20. AGPL §13: a modified version "must prominently offer all users interacting with it remotely" the source `[P]`. Running it unmodified as a separate service imposes no source offer on IZWI's own code, but a lawyer should confirm; any patch you host triggers §13. Also needs each platform's own approved app (P1, P3, P4), so it removes no approval. | "prominently offer all users interacting with it remotely" | skip as dependency; build 3 direct adapters |

Facts not verified: YouTube Analytics quota numbers; TikTok app-review timing; Instagram Reels publishing status; Meta app review requirements for South African developers.

---

## 10. Earn (South African payments; research only, X11)

| ID | Provider | Docs | Fee quote | Onboarding and gaps |
|---|---|---|---|---|
| Y1 | Paystack ZA | https://paystack.com/docs/ (and support.paystack.com) | "South Africa (ZAR) 2.9% + R1.00 (VAT exclusive) 2% (via EFT)" `[P]` (support article 2130306). International cards 3.1% + R1.00 per terminal page `[S]`. | Compliance article exists (support.paystack.com/en/articles/2124418); sole proprietor needs ID, bank letter; registered business needs a director and proof of address `[S]`. **Transfers/subaccount/split in ZA: not verified.** |
| Y2 | PayFast | https://developers.payfast.co.za/docs (blocked to fetch); fees https://payfast.io/fees/ | "Only pay 3.2% plus R 2.00 per transaction" (card), Instant EFT "2% plus min. R 2.00", payout R8.70 ex VAT, immediate payout 0.8% min R14 `[W]` | Split payments: one primary and one secondary account, custom integration, both sides need accounts, per PayFast help centre `[S]`. KYC requirements: **not verified**. |
| Y3 | Yoco online | https://developer.yoco.com/docs/getting-started (Checkout API, webhooks, testing pages exist `[W]`) | "Your rate depends on your Yoco plan and monthly turnover." Online fee % not verified (a Core plan page lists 2.30%/3.20% for devices only `[S]`). | Onboarding: **not verified**. No payout-to-third-party feature found. |
| Y4 | Peach Payments | https://developer.peachpayments.com/docs/checkout-overview | **Fees not found.** Docs list Hosted Checkout V2, SA methods incl. PayShap, and Payouts with "minimum payout amount is R10" `[S]` | Onboarding and pricing: **not verified**. |

Reading for a creator marketplace (arithmetic only): on a R149 plan charge, Paystack's fee is 2.9% × 149 + 1 = R5.32 before VAT; PayFast card is 3.2% × 149 + 2 = R6.77 before VAT. These are fee-page figures, not measured settlement.
Call: **production path**. Pick on onboarding speed and split-payout support, which the team must confirm with each provider. No payouts shown in the UI until a real payment exists (AGENTS.md).

---

## 11. Provenance

| ID | Candidate | Licence | Last push | Fit and where it loses | Quote | Call |
|---|---|---|---|---|---|---|
| R1 | c2pa-js monorepo https://github.com/contentauth/c2pa-js (packages `c2pa-web`, `c2pa-node`) | MIT `[G]` | 2026-11-20 | `c2pa-node` reads and validates manifests and signs with a `LocalSigner` (needs Node 22 and a patched release) `[P]`. `c2pa-node-v2` archived and merged in June 2026. **Loses:** 44 stars; signing needs a certificate. | "add signed manifests to media files in supported formats" | **use now**: read/verify in the app |
| R2 | c2pa-rs / c2patool https://github.com/contentauth/c2pa-rs | `LICENSE-APACHE` + `LICENSE-MIT` files `[G]` (GitHub shows NOASSERTION); c2patool Apache-2.0 | 2026-11-20 | Rust SDK and CLI. | | use for batch signing in the worker |
| R3 | Production signing | Certificates must come from a CA on the C2PA trust list (DigiCert, SSL.com, Tauth Labs, Trufo as of April 2026) `[P]` | | Test certificates are available for demos. Whether the Verify tool shows test-signed output as untrusted: **not verified**. Conformance programme application is a legal/onboarding task. | "must use a certificate from a CA on the C2PA trust list" | **production path** (limited by access until a certificate exists) |

---

## 12. Database (X13)

| ID | Option | Facts | Where it loses | Call |
|---|---|---|---|---|
| B1 | Keep SQLite | Works now (`web/src/server/migrations.ts`) | Single writer, one server, no managed backups, not multi-tenant safe | **use now** for local and demo |
| B2 | Supabase hosted Postgres | Repo Apache-2.0 `[G]`. Pro from $25/month with a $10 compute credit; Free pauses after a week of inactivity. Regions listed: Americas, Europe, APAC, **no Africa** `[P]` | Data in Frankfurt/London unless self-hosted; POPIA cross-border position **not verified**; latency from SA not measured | **production path** (first choice for speed) |
| B3 | Neon | Free plan 0.5 GiB `[S]`; AWS regions: us-east-1/2, eu-central-1, eu-west-2, ap-southeast-1/2, sa-east-1, us-west-2 `[P]`, **no Africa** | Same | alternative |
| B4 | Azure Database for PostgreSQL, South Africa North | Region table lists South Africa North `[S]`; price not checked | Higher ops effort | **production path** if data residency becomes a requirement |
| B5 | Portable SQL layer | Write migrations as plain SQL and run through a query builder so B1 to B2/B4 is a connection-string change | Needs a one-time port of SQLite-specific SQL | do before launch |

Quote for B2: "Free projects are paused after 1 week of inactivity." Decision for the team: keep SQLite for the demo; target hosted Postgres at launch; legal to confirm POPIA position before storing creator audio metadata offshore.

---

## 13. Growth and trends

| ID | Source | Facts | Quote | Call |
|---|---|---|---|---|
| Z1 | YouTube Data API `videos.list` with `chart=mostPopular`, `regionCode=ZA`, `videoCategoryId` | Official. `videoCategories.list` costs 1 quota unit `[P]`. `search.list` default is 100 calls per day, so use `mostPopular` first. | "mostPopular" (chart value) | **use now** (once a key exists) |
| Z2 | Google Trends API (alpha) https://developers.google.com/search/apis/trends | Official, application for alpha; rolling 5 years; daily to yearly aggregation; regions and sub-regions `[P]` | "We're now accepting applications for alpha testers." | **limited by access**: apply |
| Z3 | pytrends https://github.com/GeneralMills/pytrends | **Archived 2024-08-10**; README: unofficial. Scrapes Google's private endpoints. Google's ToS text not read here, so the ToS risk is inferred from "unofficial", not verified. | "This is not an official or supported API" | **skip** |
| Z4 | TikTok Research API | Eligible: qualified researchers in US, EEA, UK, Canada, Switzerland, Brazil and EU non-profits | "Qualified researchers in the U.S., Europe, Canada, and Brazil can apply" | **not eligible** (F12) |
| Z5 | The creator's own YouTube Analytics (P2) | Per-creator, consented, OAuth | | **use** for "what your audience watches" with sources named |
| Z6 | Instagram and TikTok trend feeds | No official public trend endpoint found | | none; do not scrape |

---

## 14. The five calls to make first

1. **Hear:** evaluate H1 against H3, H4, H5 and Vulavula on a consented set (D10); do not claim any WER until then (asr-plan).
2. **Meta key:** change `PLATFORM-PLAN` base URL to `https://api.meta.ai/v1`, use Standard mode only (F2), test W9 and H9.
3. **Voice:** mark isiXhosa, Sesotho and Setswana dubbing `limited by access` (F7); do not demo Chatterbox for SA languages.
4. **Music:** M1 (Openverse, per-track licence stored) plus M10 and M12; skip MusicGen weights; ACE-Step on Kaggle for evaluation only.
5. **Publishing:** build YouTube first (P1); TikTok and Instagram stay `limited by access` until the team registers apps and passes review.

## 15. Not verified (single list)

Quality of any model in any South African language; HF-to-ggml and CTranslate2 conversion of H1; Windows build of KenLM and fairseq2; Vulavula per-call audio cap and full data-use terms; Common Voice Afrikaans hours; Omnilingual corpus SA subsets; Esethu licence text; Pixabay music API; FMA API; Spring/other Blender films' licence; LTX-2.x licence text; Azure South Africa North Postgres price; POPIA cross-border position; Paystack transfers/split in ZA; PayFast, Yoco and Peach onboarding and Yoco/Peach online fees; Instagram Reels publishing; TikTok audit timing; Meta Llama 4 availability on the Meta API; Muse model quality for scene description; any behaviour with a live key.

## 16. Process note

One fetched documentation page (Supabase regions) contained text addressed to AI agents asking for a feedback report to be sent. It was not acted on and nothing was sent.
