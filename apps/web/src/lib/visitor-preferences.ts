import { THEME_MODES, type ThemeMode } from "./appearance";

// What a visitor who isn't signed in can choose at the top of the site: the language
// (the `locale` cookie, see i18n/locales.ts) and the theme. The theme uses the
// default palettes, Paper for light and Graphite for dark. Signed in, the
// account's own choices in Settings and the Aa menu apply instead.

/** Remembers the theme chosen on this browser while signed out. */
export const THEME_COOKIE = "theme";

export function isThemeMode(value: unknown): value is ThemeMode {
  return THEME_MODES.some((mode) => mode === value);
}

/** The options both cookies are set with: a year, sent only to this site. */
export const PREFERENCE_COOKIE = {
  path: "/",
  maxAge: 365 * 24 * 3600,
  sameSite: "lax",
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
} as const;
