"use client";

import { useId, useSyncExternalStore } from "react";
import {
  APPEARANCE_COOKIE,
  DARK_PALETTES,
  LIGHT_PALETTES,
  READING_FONTS,
  THEME_MODES,
  formatAppearance,
  parseAppearance,
  themeColors,
  type Appearance,
  type Palette,
  type ReadingFont,
  type ThemeMode,
} from "@/lib/appearance";

// The appearance lives on <html>, where the root layout's inline script puts
// it, and in a cookie for the next visit. Every picker reads it from <html>,
// so the one in the header and the one in Settings stay in step.

const CHANGED = "appearancechange";
const ONE_YEAR = 60 * 60 * 24 * 365;

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGED, onChange);
  return () => window.removeEventListener(CHANGED, onChange);
}

function shownAppearance(): string {
  const { theme, light, dark, font } = document.documentElement.dataset;
  return formatAppearance(parseAppearance(`${theme}.${light}.${dark}.${font}`));
}

/** Changes the page at once, with no request, and remembers the choice in this browser. */
function saveAppearance(appearance: Appearance) {
  Object.assign(document.documentElement.dataset, appearance);
  const colors = themeColors(appearance);
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    meta.content = meta.media.includes("dark") ? colors.dark : colors.light;
  }
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${APPEARANCE_COOKIE}=${formatAppearance(appearance)}; Path=/; Max-Age=${ONE_YEAR}; SameSite=Lax${secure}`;
  window.dispatchEvent(new Event(CHANGED));
}

function Swatches<Name extends string>({
  legend,
  name,
  palettes,
  value,
  onChange,
}: {
  legend: string;
  name: string;
  palettes: Record<Name, Palette>;
  value: Name;
  onChange: (value: Name) => void;
}) {
  return (
    <fieldset className="appearance-group">
      <legend>{legend}</legend>
      <div className="swatches">
        {(Object.entries(palettes) as [Name, Palette][]).map(([key, palette]) => (
          <label key={key} className="swatch-option">
            <input type="radio" className="visually-hidden" name={name} value={key} checked={value === key} onChange={() => onChange(key)} />
            <span className="swatch" style={{ background: palette.bg, color: palette.text }} aria-hidden="true">
              Aa
              <span className="swatch-accent" style={{ background: palette.accent }} />
            </span>
            <span className="swatch-label">{palette.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** The theme (System, Light or Dark), the colors for light and for dark, and the reading font. */
export function AppearancePicker({ saved }: { saved: Appearance }) {
  const id = useId();
  const appearance = parseAppearance(useSyncExternalStore(subscribe, shownAppearance, () => formatAppearance(saved)));
  const change = (update: Partial<Appearance>) => saveAppearance({ ...appearance, ...update });
  return (
    <div className="appearance">
      <fieldset className="appearance-group">
        <legend>Theme</legend>
        <div className="segmented">
          {(Object.entries(THEME_MODES) as [ThemeMode, string][]).map(([mode, label]) => (
            <label key={mode}>
              <input
                type="radio"
                className="visually-hidden"
                name={`${id}-theme`}
                value={mode}
                checked={appearance.theme === mode}
                onChange={() => change({ theme: mode })}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <Swatches legend="Light colors" name={`${id}-light`} palettes={LIGHT_PALETTES} value={appearance.light} onChange={(light) => change({ light })} />
      <Swatches legend="Dark colors" name={`${id}-dark`} palettes={DARK_PALETTES} value={appearance.dark} onChange={(dark) => change({ dark })} />
      <fieldset className="appearance-group">
        <legend>Font for articles and summaries</legend>
        <div className="font-options">
          {(Object.entries(READING_FONTS) as [ReadingFont, (typeof READING_FONTS)[ReadingFont]][]).map(([key, font]) => (
            <label key={key} className="font-option">
              <input
                type="radio"
                className="visually-hidden"
                name={`${id}-font`}
                value={key}
                checked={appearance.font === key}
                onChange={() => change({ font: key })}
              />
              <span style={{ fontFamily: font.family }}>{font.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}
