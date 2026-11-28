# Settings: Connections

**Status: partial.** The server-gated Connections screen groups local, online free-tier and paid model options. It reuses the existing Run on provider API and key manager, which seals keys on the server and tests connections before they are used. Advanced device, worker and passkey controls remain on Run on.

Enable with `IZWI_FLAG_CONNECTIONS=1` in `web/.env.local` and restart the app. The default is off. Provider account creation, provider terms, account quotas, and model prices remain outside IZWI. The displayed cost wording does not promise free access or a specific account allowance.

Local Ollama is treated as Private only when configured at a loopback address; that label cannot prove the local service does not forward requests. whisper.cpp runs through the local worker. Hosted provider privacy follows the existing classes: Meta Model API is Standard, while Groq, Gemini, OpenRouter and AI/ML API are May log. Check the provider's current terms before sending sensitive text.

The task-route panel refreshes after a provider is added. Provider role switches for Find clips and Transcribe were removed because those tasks do not currently use those selections. Existing saved values are ignored by the screen. The assistant's paid-model budget needs an approved model price, `IZWI_USD_ZAR` greater than zero, and `IZWI_ASSISTANT_DAILY_CENTS` greater than zero; the default daily cents limit is zero. Set these server-side and restart the app. A free-tier marker is a workspace owner's assertion, not a check of the provider's remaining quota.

The Settings shell includes Preferences, Languages and Account as planned tabs; those sections are not implemented here. Run on remains available at `/app/engine`.
