# Transcript injection classifier (Lane C5)

**Status: implemented behind `IZWI_FLAG_INJECTION=1`; best-effort signal only.** It does not establish that a line is safe, detect every attack, or replace the assistant's untrusted-transcript boundary and approval controls. Classification runs in the worker after transcription, in batches of at most 40 lines, at queue priority 0. The model is loaded lazily and cached under ignored `web/storage/models/`.

## Spike gate

The spike ran on Node **v24.18.0** with Ollama `qwen3:4b` loaded at the same time (`ollama ps` showed it resident). It scored 40 synthetic English transcript lines: 20 ordinary South African podcast lines and 20 planted injection attempts.

| Model | Revision | Licence | ONNX size | Use in spike |
|---|---|---|---:|---|
| [ProtectAI DeBERTa v3 base prompt-injection v2](https://huggingface.co/protectai/deberta-v3-base-prompt-injection-v2) | `90c9989b1a342275dd0d1a95aad283c04e075671` | Apache-2.0 | 738,563,188 bytes (`onnx/model.onnx`) | Primary; loaded and scored all 40 lines |
| [OGL-Mini](https://huggingface.co/devsdaddy/ogl-mini) | `5ebab1cd00d154baa380886ebfa4f4047dcea945` | MIT | 2,930,575 bytes (`ogl-mini.int8.onnx`; card reports 2.79 MB) | Smallest permissive ONNX candidate found; custom hybrid/runtime format, not loaded |
| [SecureLayer7 promptpurify](https://huggingface.co/Securelayer7/promptpurify) | `bcf64687ce4bed090971d5ac098c79598dfec773` | MIT | 14,275,815 bytes (`model.int8.onnx`) | Another small candidate; custom ONNX runner, not loaded |
| [Horizon Labs Prompt Injection Guard Small](https://huggingface.co/Horizon-Labs/prompt-injection-guard-small) | `f29d6c05f3b53d6ca8d9fdd7ec52502628ff16e2` | Apache-2.0 | 268,409,234 bytes (`onnx/model_quantized.onnx`) | Smaller Transformers.js-compatible fallback; not needed after primary passed |

ProtectAI's model card states: **“Language(s) (NLP): English”** and, under Limitations, **“It does not detect jailbreak attacks or handle non-English prompts”**. This is an English-only detector; it is not validated for isiZulu, Setswana, code-switching or other South African languages. The model card also says the project is archived and no longer maintained. [Read the pinned card](https://huggingface.co/protectai/deberta-v3-base-prompt-injection-v2/blob/90c9989b1a342275dd0d1a95aad283c04e075671/README.md).

The runtime uses `@huggingface/transformers` **4.3.2**, checked with `npm view`, under **Apache-2.0**. Its ONNX Runtime native install script is explicitly allowed so local inference can initialize.

The smallest candidate card describes the INT8 artifact as **“2.79MB — simplified model from same 110k data”**; its card lists `en`, `ru`, `fr`, `de` and `es` and says **“RU/EN primary.”** Its INT8 file is marked for browser WASM in the card, and the repository does not expose the tokenizer/config pair used by Transformers.js. It is therefore recorded as the smallest verified permissive ONNX candidate, not treated as a drop-in runtime fallback. [Read the pinned card](https://huggingface.co/devsdaddy/ogl-mini/blob/5ebab1cd00d154baa380886ebfa4f4047dcea945/README.md).

The 14.3 MB MIT [SecureLayer7 promptpurify](https://huggingface.co/Securelayer7/promptpurify) candidate is also ONNX, but uses its own `promptpurify/l5` interface over `onnxruntime-node`; it likewise has no Transformers.js model config. Its card says **“The model is English-strongest.”** [Read the pinned card](https://huggingface.co/Securelayer7/promptpurify/blob/bcf64687ce4bed090971d5ac098c79598dfec773/README.md).

Prompt Guard's Llama-licensed weights were not selected: the [Hugging Face card](https://huggingface.co/meta-llama/Prompt-Guard-86M) declares `llama3.1`, which is not an OSI-approved licence. The [OSI FAQ](https://opensource.org/ai/faq) also lists Llama among examples that do not pass its open-source criteria.

The spike result for ProtectAI was **PASS**: peak Node RSS **785.3 MB** (below 1.5 GB) and median inference **164.94 ms per line** (below 300 ms). The script's `injectionPredictions` field counted top-label injection predictions over the combined 40-line set; it is not an accuracy metric. These are synthetic plumbing/performance results, not a representative safety evaluation.

## Runtime behavior

- `IZWI_FLAG_INJECTION` defaults to `0`. When enabled, the worker queues a scan after the source transcript has been written; the job depends on the transcription job succeeding.
- `injection_scan` scores at most 40 lines per run and queues the next batch at priority `0`, behind already queued higher-priority work. The model is only imported when a non-empty batch needs scoring.
- Each row in `line_injection_scan` stores the line ID, SHA-256 of the exact text, pinned model revision, injection score, `flagged`/`clear` status and scan timestamp. A changed line has a stale hash and is therefore unscanned; existing assistant behavior ignores that stale result and remains unchanged.
- The assistant's existing threshold is 0.7. A matching scan above that threshold is excluded from assistant context. This classifier is a best-effort filter: false positives and false negatives remain possible.

## Reproduction

From `web/`, with `qwen3:4b` loaded in Ollama:

```powershell
node scripts/injection-spike.mjs protectai
```

The optional `small` selector targets the pinned Horizon Labs quantized model. Model weights stay in ignored storage and are not part of the repository.
