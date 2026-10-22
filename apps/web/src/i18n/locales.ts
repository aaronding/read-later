// The interface languages. Traditional Chinese follows Taiwan's usage.
// Summaries are a separate matter: they are written in each article's own
// language.

export const LOCALES = ["en", "fr", "zh-Hans", "zh-Hant"] as const;
export type AppLocale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: AppLocale = "en";

/** Remembers the chosen language on this browser, for pages seen signed out. */
export const LOCALE_COOKIE = "locale";

/**
 * The lang attribute for pages in each language. The region makes browsers
 * use Taiwan's character forms and screen readers a Taiwan voice.
 */
export const HTML_LANG: Record<AppLocale, string> = { en: "en", fr: "fr", "zh-Hans": "zh-Hans", "zh-Hant": "zh-Hant-TW" };

/** Each language's name in that language, for the language picker. */
export const LOCALE_NAMES: Record<AppLocale, string> = {
  en: "English",
  fr: "Français",
  "zh-Hans": "简体中文",
  "zh-Hant": "繁體中文（台灣）",
};

export function isLocale(value: unknown): value is AppLocale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/**
 * The interface language for a BCP 47 tag, if there is one: fr-CA becomes fr,
 * zh, zh-CN and zh-SG become zh-Hans, and zh-TW, zh-HK and zh-MO become
 * zh-Hant (the script is inferred from the region when the tag has none).
 */
export function toSupportedLocale(tag: string): AppLocale | undefined {
  let locale: Intl.Locale;
  try {
    locale = new Intl.Locale(tag.trim()).maximize();
  } catch {
    return undefined;
  }
  if (locale.language === "zh") return locale.script === "Hant" ? "zh-Hant" : "zh-Hans";
  return isLocale(locale.language) ? locale.language : undefined;
}

/** A user's saved language, else the request's preferred one, else English. */
export function preferredLocale(saved: AppLocale | null | undefined, acceptLanguage: string | null | undefined): AppLocale {
  return saved ?? localeFromAcceptLanguage(acceptLanguage) ?? DEFAULT_LOCALE;
}

/** The first supported language in an Accept-Language header, by preference. */
export function localeFromAcceptLanguage(header: string | null | undefined): AppLocale | undefined {
  if (!header) return undefined;
  const ranked = header
    .split(",")
    .map((part, index) => {
      const [tag = "", ...params] = part.split(";").map((piece) => piece.trim());
      const q = params.find((param) => param.startsWith("q="));
      const weight = q ? Number(q.slice(2)) : 1;
      return { tag, weight: Number.isFinite(weight) ? weight : 0, index };
    })
    .filter((entry) => entry.tag && entry.tag !== "*" && entry.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.index - b.index);
  for (const { tag } of ranked) {
    const locale = toSupportedLocale(tag);
    if (locale) return locale;
  }
  return undefined;
}
