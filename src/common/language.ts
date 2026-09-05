// Shared language helpers. The app supports one UI language per user, stored on
// the user document as `language` = { <code>: <displayName> } (legacy shape),
// e.g. { sv: "Svenska" }. `languageCode()` pulls the code out of that object.
//
// Supported UI languages (ISO 639-1). Email/UI copy is added per language over
// time; codes without copy yet fall back to Swedish at render time.
export const SUPPORTED_LANGS = [
  "sv",
  "en",
  "nb",
  "pl",
  "et",
  "uk",
  "ru",
  "fi",
  "lt",
  "lv",
] as const;

export type LangCode = (typeof SUPPORTED_LANGS)[number];

// Extract the stored code from a user's `language` object, defaulting to
// Swedish (the product's home market). Accepts the legacy { code: name } shape
// or a bare code string.
export function languageCode(
  language?: Record<string, unknown> | string | null,
): string {
  if (!language) return "sv";
  if (typeof language === "string") return language || "sv";
  return Object.keys(language)[0] || "sv";
}
