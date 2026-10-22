"use client";

import { useTranslations } from "next-intl";
import { useId, useState, useSyncExternalStore } from "react";
import { saveAppearanceAction } from "@/app/actions";
import {
  DARK_PALETTES,
  LIGHT_PALETTES,
  READING_FONTS,
  THEME_MODES,
  themeColors,
  toAppearance,
  type Appearance,
  type DarkPalette,
  type LightPalette,
  type Palette,
  type ReadingFont,
} from "@/lib/appearance";

// The appearance lives on <html>, where the root layout's inline script puts
// it from the account. Every picker reads it from there, so the one in the
// header and the one in Settings stay in step.

const CHANGED = "appearancechange";

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGED, onChange);
  return () => window.removeEventListener(CHANGED, onChange);
}

function shownAppearance(): string {
  return JSON.stringify(toAppearance(document.documentElement.dataset));
}

/** Changes the page at once, before the choice is saved. */
function showAppearance(appearance: Appearance) {
  Object.assign(document.documentElement.dataset, appearance);
  const colors = themeColors(appearance);
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    meta.content = meta.media.includes("dark") ? colors.dark : colors.light;
  }
  window.dispatchEvent(new Event(CHANGED));
}

// One save at a time, in the order they were made, so that clicking through
// the choices quickly leaves the last one saved.
let saving: Promise<void> = Promise.resolve();

function saveInOrder(appearance: Appearance): Promise<void> {
  const save = saving.catch(() => {}).then(() => saveAppearanceAction(appearance));
  saving = save;
  return save;
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
  const t = useTranslations("Appearance.palettes");
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
            <span className="swatch-label">{t(key as LightPalette | DarkPalette)}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** The theme (System, Light or Dark), the colors for light and for dark, and the reading font. */
export function AppearancePicker({ saved }: { saved: Appearance }) {
  const t = useTranslations("Appearance");
  const tCommon = useTranslations("Common");
  const id = useId();
  const appearance = JSON.parse(useSyncExternalStore(subscribe, shownAppearance, () => JSON.stringify(saved))) as Appearance;
  const [failed, setFailed] = useState(false);
  function save(choice: Appearance) {
    saveInOrder(choice).then(
      () => setFailed(false),
      () => setFailed(true),
    );
  }
  function change(update: Partial<Appearance>) {
    const next = { ...appearance, ...update };
    showAppearance(next);
    save(next);
  }
  return (
    <div className="appearance">
      <fieldset className="appearance-group">
        <legend>{t("theme")}</legend>
        <div className="segmented">
          {THEME_MODES.map((mode) => (
            <label key={mode}>
              <input
                type="radio"
                className="visually-hidden"
                name={`${id}-theme`}
                value={mode}
                checked={appearance.theme === mode}
                onChange={() => change({ theme: mode })}
              />
              <span>{t(`themes.${mode}`)}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <Swatches legend={t("lightColors")} name={`${id}-light`} palettes={LIGHT_PALETTES} value={appearance.light} onChange={(light) => change({ light })} />
      <Swatches legend={t("darkColors")} name={`${id}-dark`} palettes={DARK_PALETTES} value={appearance.dark} onChange={(dark) => change({ dark })} />
      <fieldset className="appearance-group">
        <legend>{t("font")}</legend>
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
              <span style={{ fontFamily: font.family }}>{t(`fonts.${key}`)}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <p className="status error" role="status">
        {failed && (
          <>
            {t("saveFailed")}
            <button type="button" className="button small" onClick={() => save(appearance)}>
              {tCommon("tryAgain")}
            </button>
          </>
        )}
      </p>
    </div>
  );
}
