# Provider presets and price evidence

Checked against provider documentation on 2026-11-26. Preset addresses are fixed in the server; only OpenAI-compatible custom providers accept an edited URL. Provider keys are sent as `Authorization: Bearer` inside `sdkFetch`. The models endpoint itself is still guarded by the same SSRF checks.

| Preset base URL | Status | Official evidence: endpoint, auth and quoted span |
|---|---|---|
| `https://api.groq.com/openai/v1` | Verified | [Groq models](https://console.groq.com/docs/models): endpoint `/openai/v1/models`; quote: “`Authorization: Bearer $GROQ_API_KEY`”. Also lists GPT OSS prices below. |
| `https://generativelanguage.googleapis.com/v1beta/openai/` | Verified | [Gemini API OpenAI compatibility](https://ai.google.dev/gemini-api/docs/openai): “`base_url="https://generativelanguage.googleapis.com/v1beta/openai/"`”; REST example uses `Authorization: Bearer`. Google AI Developer support documents `GET https://generativelanguage.googleapis.com/v1beta/openai/models` with Bearer auth [here](https://discuss.ai.google.dev/t/what-is-the-correct-way-to-list-the-available-models-using-the-api/88842/8). |
| `https://api.aimlapi.com/v1` | Verified | [AI/ML API model catalogue](https://docs.aimlapi.com/api-references/service-endpoints/complete-model-list): quote `GET https://api.aimlapi.com/v1/models?include=pricing`; pricing span: “With `?include=pricing`, each model carries a `pricing` block.” [SDK auth docs](https://docs.aimlapi.com/quickstart/supported-sdks): “Our API authorization is based on a Bearer token.” |
| `https://api.meta.ai/v1` | Verified | [Meta Model API reference](https://dev.meta.ai/docs/api-reference): “Base URL `https://api.meta.ai/v1`”; “Auth header `Authorization: Bearer $MODEL_API_KEY`”; resource list includes `GET /v1/models`. Standard mode only. |
| `https://openrouter.ai/api/v1` | Verified | [OpenRouter models API](https://openrouter.ai/docs/api/api-reference/models/get-models): quote `GET /api/v1/models` with `Authorization: Bearer <token>`; response includes `pricing.prompt` and `pricing.completion`. |
| `http://127.0.0.1:11434/v1` | Verified | [Ollama OpenAI compatibility](https://docs.ollama.com/api/openai-compatibility): local server quote `base_url='http://localhost:11434/v1/'`; its endpoint list explicitly includes `/v1/models`. “The client requires an API key value, but Ollama ignores it.” IZWI does not invent or send a placeholder key. |

AI/ML API also documents a public model catalogue without a key; IZWI calls the documented `/v1/models?include=pricing` path using the configured preset. Its response is not assumed to use OpenRouter's price shape. Gemini's OpenAI-compatible endpoint uses bearer auth; native Gemini endpoints use a different auth scheme and are not used here. The supplied price and free-tier state remain estimates/settings, never provider-account verification.

## Price inputs and cost tags

Static prices are USD per million tokens and carry the provider URL and review date in `PRICE_PER_MTOK`:

| Model | Input / output USD per million | Official quote |
|---|---:|---|
| `openai/gpt-oss-120b` | $0.15 / $0.60 | [Groq model pricing](https://console.groq.com/docs/models): “$0.15 input $0.60 output”. |
| `openai/gpt-oss-20b` | $0.075 / $0.30 | [Groq model pricing](https://console.groq.com/docs/models): “$0.075 input $0.30 output”. |

OpenRouter returns live prompt and completion prices in USD per token; they are used directly and are not copied into the static table. Models with no returned or reviewed price are **Unknown** and cannot be budgeted. The typical-turn estimate uses 1,500 prompt and 400 completion tokens. Tags are based on the estimate: Free at zero, Cheap below R0.01, Moderate from R0.01 to below R0.10, Expensive at R0.10 or more. This categorization is a product display choice, not a provider quotation. When `IZWI_USD_ZAR` and its `IZWI_USD_ZAR_ASOF` date are set, estimates show Rand and that date; otherwise the UI shows USD only and the Rand category remains Unknown. No exchange rate is supplied by default.

## Routing and privacy

Owner/admin task routes select a tested provider and model for chat, plan, translate or clips. An unset route preserves the existing role-based provider choice. The server derives privacy: loopback Ollama is Private, the Meta host is Standard, and all other providers are May log. Free-tier zero-budget treatment is an owner-marked workspace assertion; token limits still apply.

## Evidence boundary

Docs, preset values, model-list parser fixtures, and local tests do not establish that a user's key works, that a particular model is available to their account, that a free allowance remains, or that a provider will retain no submitted content. Provider terms and availability may change; price evidence should be rechecked before price-sensitive release decisions.
