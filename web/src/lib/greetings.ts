export type GreetingLanguage = { id: string; name: string; text: string; review: "Needs native-speaker review" };

// Standard greetings only. Every phrase remains visibly pending native-speaker review.
export const GREETINGS: readonly GreetingLanguage[] = [
  { id: "zu", name: "isiZulu", text: "Sawubona", review: "Needs native-speaker review" },
  { id: "xh", name: "isiXhosa", text: "Molo", review: "Needs native-speaker review" },
  { id: "af", name: "Afrikaans", text: "Hallo", review: "Needs native-speaker review" },
  { id: "nso", name: "Sepedi", text: "Thobela", review: "Needs native-speaker review" },
  { id: "st", name: "Sesotho", text: "Dumela", review: "Needs native-speaker review" },
  { id: "tn", name: "Setswana", text: "Dumela", review: "Needs native-speaker review" },
  { id: "ts", name: "Xitsonga", text: "Avuxeni", review: "Needs native-speaker review" },
  { id: "ss", name: "siSwati", text: "Sawubona", review: "Needs native-speaker review" },
  { id: "ve", name: "Tshivenda", text: "Ndaa", review: "Needs native-speaker review" },
  { id: "nr", name: "isiNdebele", text: "Lotjhani", review: "Needs native-speaker review" },
  { id: "en", name: "English", text: "Hello", review: "Needs native-speaker review" },
  { id: "sasl", name: "South African Sign Language", text: "Hello", review: "Needs native-speaker review" },
];

export function greetingFor(languages: string[], day = new Date().toISOString().slice(0, 10)): GreetingLanguage {
  const available = GREETINGS.filter((item) => languages.includes(item.id));
  const options = available.length ? available : [GREETINGS.find((item) => item.id === "en")!];
  const seed = [...day].reduce((n, char) => n + char.charCodeAt(0), 0);
  return options[seed % options.length];
}
