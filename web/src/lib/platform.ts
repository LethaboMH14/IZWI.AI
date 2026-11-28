// Data for the wider product: who makes what, which markets and languages, which engines, which connectors.
// Model facts were read from Hugging Face model cards and GitHub on 17 Nov 2026 (see docs/PLATFORM-PLAN.md).
// "found" means an openly licensed model lists the language. It does not mean IZWI has evaluated it.

export type Maker = { id: string; name: string; brings: string; gets: string[]; pain: string };
export const makers: Maker[] = [
  { id: "podcast", name: "Podcast", brings: "A long recording", gets: ["Short clips", "Captions in other languages", "Audiogram", "Episode notes"], pain: "Hours of scrubbing to find three good minutes." },
  { id: "video", name: "YouTube and short video", brings: "Raw footage", gets: ["Vertical, square and wide cuts", "Translated captions", "Dubbed version", "Thumbnail text"], pain: "One video, five platforms, five manual re-edits." },
  { id: "lesson", name: "Lessons and courses", brings: "A recorded class or slides", gets: ["Chaptered lesson", "Captions learners can read in their language", "Quiz from the transcript", "Low-data audio version"], pain: "Learners who do not study in English are left behind." },
  { id: "music", name: "Music", brings: "A track or performance", gets: ["Lyric video", "Translated lyric captions", "Teasers per platform", "Split sheet for collaborators"], pain: "Splits and permissions live in WhatsApp chats." },
  { id: "film", name: "Film and documentary", brings: "A cut or dailies", gets: ["Review links with timed notes", "Subtitle files per market", "Festival and broadcaster deliverables", "Consent and release records"], pain: "Notes arrive by voice note with no timecode." },
  { id: "animation", name: "Animation and AI story", brings: "A script or an idea", gets: ["Scene breakdown with timing", "Storyboard frames", "Voice track in several languages", "Animated scenes"], pain: "A storyboard costs days before anyone sees motion." },
  { id: "client", name: "Client work", brings: "A brief and assets", gets: ["Client review room", "Versions per market", "Approval record", "Invoice-ready delivery pack"], pain: "Approvals get lost between email, WhatsApp and Drive." },
];

// Coverage of the two openly licensed models picked for listening and translating.
// whisper = language tag present on openai/whisper-large-v3 (Apache-2.0).
// uct = isiZulu fine-tunes of Meta Omnilingual ASR published by uctnlp (Apache-2.0).
// madlad = language tag present on google/madlad400-3b-mt (Apache-2.0).
export type Language = { name: string; code: string; hear: "whisper" | "uct" | "none"; translate: boolean };
export type Market = { id: string; name: string; city: string; lon: number; lat: number; langs: Language[] };

const L = (name: string, code: string, hear: Language["hear"], translate = true): Language => ({ name, code, hear, translate });

export const home = { city: "Johannesburg", lon: 28.05, lat: -26.2 };
export const markets: Market[] = [
  { id: "za", name: "South Africa", city: "Johannesburg", lon: 28.05, lat: -26.2, langs: [L("isiZulu", "zu", "uct"), L("isiXhosa", "xh", "none"), L("Sesotho", "st", "none"), L("Setswana", "tn", "none"), L("Afrikaans", "af", "whisper"), L("Sepedi", "nso", "none"), L("Xitsonga", "ts", "none"), L("Tshivenda", "ve", "none"), L("siSwati", "ss", "none")] },
  { id: "ea", name: "East Africa", city: "Nairobi", lon: 36.82, lat: -1.29, langs: [L("Kiswahili", "sw", "whisper"), L("Amharic", "am", "whisper"), L("Somali", "so", "whisper")] },
  { id: "ng", name: "Nigeria and West Africa", city: "Lagos", lon: 3.38, lat: 6.52, langs: [L("Yoruba", "yo", "whisper"), L("Hausa", "ha", "whisper"), L("Igbo", "ig", "none")] },
  { id: "fr", name: "French-speaking markets", city: "Dakar", lon: -17.47, lat: 14.72, langs: [L("French", "fr", "whisper"), L("Lingala", "ln", "whisper")] },
  { id: "pt", name: "Portuguese-speaking markets", city: "São Paulo", lon: -46.63, lat: -23.55, langs: [L("Portuguese", "pt", "whisper")] },
  { id: "ar", name: "North Africa and Middle East", city: "Cairo", lon: 31.24, lat: 30.04, langs: [L("Arabic", "ar", "whisper")] },
  { id: "es", name: "Spanish-speaking markets", city: "Mexico City", lon: -99.13, lat: 19.43, langs: [L("Spanish", "es", "whisper")] },
  { id: "in", name: "India", city: "Mumbai", lon: 72.88, lat: 19.08, langs: [L("Hindi", "hi", "whisper"), L("Tamil", "ta", "whisper")] },
  { id: "en", name: "Global English", city: "London", lon: -0.13, lat: 51.51, langs: [L("English", "en", "whisper")] },
];

export const hearLabel: Record<Language["hear"], string> = {
  whisper: "Whisper large-v3",
  uct: "UCT isiZulu speech model",
  none: "No open model confirmed",
};

// Engines. needGb for Whisper is the "Required VRAM" column of the Whisper README.
// For the others it is estimated in code from the parameter count on the model card.
export type Engine = { id: string; job: string; name: string; licence: string; paramsM?: number; needGb?: number; note: string };
export const engines: Engine[] = [
  { id: "w-tiny", job: "Hear", name: "Whisper tiny", licence: "MIT", paramsM: 39, needGb: 1, note: "Fast draft transcript. Lowest accuracy." },
  { id: "w-small", job: "Hear", name: "Whisper small", licence: "MIT", paramsM: 244, needGb: 2, note: "Good balance for a laptop." },
  { id: "w-medium", job: "Hear", name: "Whisper medium", licence: "MIT", paramsM: 769, needGb: 5, note: "Better with accents and noise." },
  { id: "w-large", job: "Hear", name: "Whisper large-v3", licence: "Apache-2.0", paramsM: 1550, needGb: 10, note: "Best open accuracy. Needs a real graphics card." },
  { id: "uct-zu", job: "Hear isiZulu", name: "omniASR 300M isiZulu (UCT)", licence: "Apache-2.0", paramsM: 300, note: "Fine-tuned for isiZulu. Not yet evaluated by IZWI." },
  { id: "madlad", job: "Translate", name: "MADLAD-400 3B", licence: "Apache-2.0", paramsM: 2940, note: "Lists all nine South African languages above and the global ones." },
  { id: "chat", job: "Plan and review", name: "A 3B open chat model, 4-bit", licence: "Per model", paramsM: 3200, note: "Plans from your prompt when a chat key or Ollama is connected. IZWI does not run it inside the browser yet." },
];

// Rough memory need when the card gives no figure: parameters x bytes per weight, plus 20% working room.
export function estimateGb(e: Engine): number {
  if (e.needGb) return e.needGb;
  const bytesPerWeight = e.id === "chat" ? 0.5 : 2; // 4-bit vs half precision
  return Math.round((((e.paramsM ?? 0) * 1e6 * bytesPerWeight) / 1e9) * 1.2 * 10) / 10;
}

// "wired" names a part the system can verify at run time (the Extensions page checks it against /api/system and
// /api/providers). Parts without it keep the honest label written here.
export type Wired = "ffmpeg" | "whisper" | "tus" | "storage" | "auth" | "openai_compat" | "madlad_endpoint" | "asr_endpoint";
export type Connector = { group: string; name: string; does: string; licence: string; state: "in use" | "next" | "planned" | "check licence"; wired?: Wired; hosted?: boolean };
export const connectors: Connector[] = [
  { group: "Edit", name: "FFmpeg", does: "Trim, resize, burn captions, render", licence: "LGPL baseline", state: "next", wired: "ffmpeg" },
  { group: "Edit", name: "OpenCut", does: "Timeline editor in the browser", licence: "MIT", state: "next" },
  { group: "Edit", name: "wavesurfer.js", does: "Real waveforms from your audio", licence: "BSD-3-Clause", state: "next" },
  { group: "Hear", name: "whisper.cpp", does: "Transcription on this computer", licence: "MIT", state: "next", wired: "whisper" },
  { group: "Hear", name: "Speech endpoint", does: "Your own transcription service, added as a key", licence: "Your provider's terms", state: "next", wired: "asr_endpoint" },
  { group: "Hear", name: "WhisperX", does: "Word-level timing for captions", licence: "BSD-2-Clause", state: "planned" },
  { group: "Translate", name: "MADLAD-400 endpoint", does: "Translation across 400+ languages from an endpoint you deploy", licence: "Apache-2.0", state: "next", wired: "madlad_endpoint" },
  { group: "Translate", name: "OpenAI-compatible chat API", does: "AI/ML API, Meta Llama API, Ollama, vLLM: plan and translate", licence: "Your provider's terms", state: "next", wired: "openai_compat" },
  { group: "Voice", name: "Chatterbox", does: "Dubbing voices", licence: "MIT", state: "planned" },
  { group: "Animate", name: "Wan 2.1 and LTX-Video", does: "Script to animated scenes", licence: "Apache-2.0", state: "planned" },
  { group: "Animate", name: "ComfyUI", does: "Runs the video models as a separate service", licence: "GPL-3.0", state: "planned" },
  { group: "Run local", name: "Ollama and llama.cpp", does: "Open chat models on this computer, added as a key with no key", licence: "MIT", state: "next" },
  { group: "Run local", name: "llmfit", does: "Checks which models your hardware can run", licence: "MIT", state: "planned" },
  { group: "Run local", name: "Tauri", does: "Desktop app for offline work", licence: "Apache-2.0", state: "planned" },
  { group: "Upload", name: "tus (tus-js-client)", does: "Uploads that resume after a dropped signal", licence: "MIT", state: "in use", wired: "tus" },
  { group: "Account", name: "better-auth", does: "Sign-in, passkeys, workspaces and invitations", licence: "MIT", state: "in use", wired: "auth" },
  { group: "Account", name: "Postgres and private media storage", does: "Your data in Postgres; your files on this server or in a private bucket", licence: "PostgreSQL Licence", state: "in use", wired: "storage" },
  { group: "Account", name: "Supabase", does: "Hosted sign-in, data and private storage", licence: "Apache-2.0", state: "planned", hosted: true },
  { group: "Publish", name: "Postiz", does: "Schedule to social platforms", licence: "AGPL-3.0", state: "planned" },
  { group: "Protect", name: "c2pa-js", does: "Content credentials inside the exported file", licence: "MIT", state: "planned" },
  { group: "Automate", name: "Activepieces", does: "If this, then that, across your tools", licence: "Custom", state: "check licence" },
  { group: "Dashboard", name: "Metabase", does: "Audience and usage dashboards", licence: "Custom", state: "check licence" },
  { group: "Chat", name: "Open WebUI", does: "A ready chat surface for local models", licence: "Custom", state: "check licence" },
];

// Turns a plain request into steps without any model. Deliberately simple and predictable.
export type Step = { verb: string; what: string; tool: string; runs: string; gate?: string };
const allLangs = markets.flatMap((m) => m.langs);

export function planFromPrompt(prompt: string): { steps: Step[]; langs: Language[]; understood: boolean } {
  const p = prompt.toLowerCase();
  const steps: Step[] = [];
  const langs = allLangs.filter((l, i, a) => a.findIndex((x) => x.code === l.code) === i && l.code !== "en" && p.includes(l.name.toLowerCase().replace(/^isi|^se|^si|^xi|^tshi|^ki/, "").slice(0, 5)));
  const count = ({ one: 1, two: 2, three: 3, four: 4, five: 5 } as Record<string, number>)[(p.match(/\b(one|two|three|four|five)\b/) ?? [])[1] ?? ""] ?? Number((p.match(/\b(\d)\b/) ?? [])[1] ?? 0);
  const wantsClips = /clip|short|reel|tiktok|cut/.test(p);
  const wantsDub = /dub|voice/.test(p);
  const wantsCaptions = /caption|subtitle|translate/.test(p) || langs.length > 0;
  const wantsStory = /storyboard|animat|scene/.test(p);
  const wantsPublish = /publish|post|schedule|upload to/.test(p);

  if (wantsClips || wantsCaptions || wantsDub) steps.push({ verb: "Hear", what: "Transcribe the source with word timing", tool: "whisper.cpp", runs: "This device" });
  if (wantsClips) steps.push({ verb: "Cut", what: `Suggest ${count || 3} clips and say why each was chosen`, tool: "Chat model + FFmpeg", runs: "This device" });
  for (const l of langs) {
    if (l.translate) steps.push({ verb: "Translate", what: `Draft ${l.name} captions`, tool: "MADLAD-400", runs: "Your key or cloud", gate: `Stays a draft until a speaker of ${l.name} approves it` });
    if (wantsDub) steps.push({ verb: "Dub", what: `${l.name} voice track`, tool: "Chatterbox", runs: "Cloud GPU", gate: "Planned. Needs the speaker's recorded consent to use their voice" });
  }
  if (wantsStory) steps.push({ verb: "Storyboard", what: "Break the script into timed scenes", tool: "Chat model", runs: "This device" }, { verb: "Animate", what: "Generate a moving frame per scene", tool: "Wan 2.1 via ComfyUI", runs: "Cloud GPU", gate: "Planned. Needs a GPU service" });
  if (wantsPublish) steps.push({ verb: "Publish", what: "Prepare posts for connected platforms", tool: "Postiz", runs: "Cloud", gate: "Planned. Nothing posts without a connected account and your yes" });
  if (steps.length) steps.push({ verb: "Record", what: "Attach consent and a content credential to each export", tool: "c2pa-js", runs: "This device", gate: "Blocked for anyone who has not said yes" });
  return { steps, langs, understood: steps.length > 0 };
}
