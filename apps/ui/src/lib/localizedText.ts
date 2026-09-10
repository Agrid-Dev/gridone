/**
 * A text with a mandatory default and optional per-language translations,
 * as drivers declare it (attribute labels and descriptions, presentation
 * texts). Resolution: exact tag → base language → default.
 */
export type LocalizedText = {
  default: string;
  translations?: Record<string, string> | null;
};

export function localize(text: LocalizedText, language: string): string {
  const translations = text.translations;
  if (!translations) return text.default;
  const base = language.split("-")[0];
  return translations[language] ?? translations[base] ?? text.default;
}
