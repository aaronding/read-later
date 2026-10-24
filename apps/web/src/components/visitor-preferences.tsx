"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { setVisitorLocaleAction, setVisitorThemeAction } from "@/app/actions";
import { HTML_LANG, LOCALES, LOCALE_NAMES, LOCALE_SHORT_NAMES, isLocale, type AppLocale } from "@/i18n/locales";
import { THEME_MODES, type ThemeMode } from "@/lib/appearance";
import { ChevronIcon, GlobeIcon, MoonIcon, SunIcon, SystemThemeIcon } from "./icons";

const THEME_ICONS: Record<ThemeMode, () => React.ReactNode> = { system: SystemThemeIcon, light: SunIcon, dark: MoonIcon };

/**
 * The language and theme pickers at the top of the site, for visitors who
 * aren't signed in. The language starts as the browser's, or English.
 */
export function VisitorPreferences({ locale, theme: saved }: { locale: AppLocale; theme: ThemeMode }) {
  const t = useTranslations("Common");
  const tAppearance = useTranslations("Appearance");
  const [pending, startTransition] = useTransition();
  const [theme, setTheme] = useState(saved);
  const [current, setCurrent] = useState(locale);
  return (
    <div className="visitor-preferences">
      {/* The chosen language is shown as text, so the control is as wide as
          it; the list itself is the browser's own, laid invisibly over it. */}
      <label className="language-picker">
        <GlobeIcon />
        <span aria-hidden="true" lang={HTML_LANG[current]}>
          {LOCALE_SHORT_NAMES[current]}
        </span>
        <ChevronIcon />
        <span className="visually-hidden">{t("language")}</span>
        <select
          value={current}
          disabled={pending}
          onChange={(event) => {
            const value = event.target.value;
            if (!isLocale(value)) return;
            setCurrent(value);
            startTransition(() => setVisitorLocaleAction(value));
          }}
        >
          {LOCALES.map((option) => (
            <option key={option} value={option} lang={HTML_LANG[option]}>
              {LOCALE_NAMES[option]}
            </option>
          ))}
        </select>
      </label>
      <div className="theme-picker" role="group" aria-label={tAppearance("theme")}>
        {THEME_MODES.map((mode) => {
          const ModeIcon = THEME_ICONS[mode];
          return (
            <button
              key={mode}
              type="button"
              aria-pressed={theme === mode}
              aria-label={tAppearance(`themes.${mode}`)}
              title={tAppearance(`themes.${mode}`)}
              onClick={() => {
                // Shown at once; the cookie keeps it for the next page.
                setTheme(mode);
                document.documentElement.dataset.theme = mode;
                void setVisitorThemeAction(mode);
              }}
            >
              <ModeIcon />
            </button>
          );
        })}
      </div>
    </div>
  );
}
