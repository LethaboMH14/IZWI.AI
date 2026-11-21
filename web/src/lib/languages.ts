// Languages IZWI can be asked for, and which open model lists each one.
// whisper: language tag on openai/whisper-large-v3 (Apache-2.0); the local whisper.cpp base model covers the same list less accurately.
// madlad: language tag on google/madlad400-3b-mt (Apache-2.0). Listed is not the same as evaluated.
export type Lang = { code: string; name: string; whisper: boolean; madlad: boolean; region: string };

export const LANGUAGES: Lang[] = [
  { code: "en", name: "English", whisper: true, madlad: true, region: "Global" },
  { code: "zu", name: "isiZulu", whisper: false, madlad: true, region: "South Africa" },
  { code: "xh", name: "isiXhosa", whisper: false, madlad: true, region: "South Africa" },
  { code: "st", name: "Sesotho", whisper: false, madlad: true, region: "South Africa" },
  { code: "tn", name: "Setswana", whisper: false, madlad: true, region: "South Africa" },
  { code: "af", name: "Afrikaans", whisper: true, madlad: true, region: "South Africa" },
  { code: "nso", name: "Sepedi", whisper: false, madlad: true, region: "South Africa" },
  { code: "ts", name: "Xitsonga", whisper: false, madlad: true, region: "South Africa" },
  { code: "ve", name: "Tshivenda", whisper: false, madlad: true, region: "South Africa" },
  { code: "ss", name: "siSwati", whisper: false, madlad: true, region: "South Africa" },
  { code: "nr", name: "isiNdebele", whisper: false, madlad: true, region: "South Africa" },
  { code: "sw", name: "Kiswahili", whisper: true, madlad: true, region: "East Africa" },
  { code: "am", name: "Amharic", whisper: true, madlad: true, region: "East Africa" },
  { code: "so", name: "Somali", whisper: true, madlad: true, region: "East Africa" },
  { code: "yo", name: "Yoruba", whisper: true, madlad: true, region: "West Africa" },
  { code: "ha", name: "Hausa", whisper: true, madlad: true, region: "West Africa" },
  { code: "ig", name: "Igbo", whisper: false, madlad: true, region: "West Africa" },
  { code: "sn", name: "chiShona", whisper: true, madlad: true, region: "Southern Africa" },
  { code: "fr", name: "French", whisper: true, madlad: true, region: "Global" },
  { code: "pt", name: "Portuguese", whisper: true, madlad: true, region: "Global" },
  { code: "ar", name: "Arabic", whisper: true, madlad: true, region: "Global" },
  { code: "es", name: "Spanish", whisper: true, madlad: true, region: "Global" },
  { code: "hi", name: "Hindi", whisper: true, madlad: true, region: "Global" },
];

export const langName = (code: string) => LANGUAGES.find((l) => l.code === code)?.name ?? code.toUpperCase();
