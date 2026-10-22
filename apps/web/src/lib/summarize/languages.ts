import { LOCALES, type AppLocale } from "@/i18n/locales";

// Which languages a summary can be translated into. A summary is written in
// its article's language; it can be translated into any of the interface
// languages except its own. Simplified and Traditional Chinese count as one
// language here, so a Chinese summary goes only to English or French, while
// an English one can go to either Chinese.

/** The languages a summary can be translated into: the interface languages. */
export const TRANSLATION_LANGUAGES = LOCALES;
export type TranslationLanguage = AppLocale;

/**
 * How many translations a summary can have. One for now; the data and the
 * reader already handle more.
 */
export const MAX_TRANSLATIONS_PER_SUMMARY = 1;

/**
 * How many times Claude may translate one summary, in all its languages
 * together: retries, asking again after Remove and translating again after a
 * re-summary all count, failed answers included.
 */
export const MAX_TRANSLATION_RUNS_PER_SUMMARY = 3;

export function isTranslationLanguage(value: unknown): value is TranslationLanguage {
  return typeof value === "string" && (TRANSLATION_LANGUAGES as readonly string[]).includes(value);
}

/** A tag's language without its script or region ("zh-Hant-TW" → "zh"), or null for none or a malformed tag. */
export function baseLanguage(tag: string | null | undefined): string | null {
  if (!tag) return null;
  try {
    return new Intl.Locale(tag.trim()).language;
  } catch {
    return null;
  }
}

/** The languages a summary in this language can be translated into, in the interface's order. */
export function translationTargets(summaryLanguage: string | null | undefined): TranslationLanguage[] {
  const source = baseLanguage(summaryLanguage);
  return TRANSLATION_LANGUAGES.filter((target) => baseLanguage(target) !== source);
}
