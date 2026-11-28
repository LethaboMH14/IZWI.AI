// Runtime kill switches. Read on every request, so switching a feature off needs only a restart, never a rebuild.
// Server-only names (no NEXT_PUBLIC_), so the value is never inlined into a client bundle.

// The studio assistant: the panel, its chat route and its voice route. On only when set to "1".
// NEXT_PUBLIC_IZWI_FLAG_ASSISTANT is the old build-time name and is read only when IZWI_FLAG_ASSISTANT is unset,
// so an existing .env.local keeps working while IZWI_FLAG_ASSISTANT=0 always wins.
export function assistantEnabled(): boolean {
  return (process.env.IZWI_FLAG_ASSISTANT ?? process.env.NEXT_PUBLIC_IZWI_FLAG_ASSISTANT) === "1";
}

export function connectionsEnabled(): boolean {
  return process.env.IZWI_FLAG_CONNECTIONS === "1";
}

export function preferencesEnabled(): boolean {
  return process.env.IZWI_FLAG_PREFERENCES === "1";
}

export function languagesEnabled(): boolean {
  return process.env.IZWI_FLAG_LANGUAGES === "1";
}
