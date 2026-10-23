import { contrastRatio, mixColors } from "./color";

// How articles look: the theme (System, Light or Dark), the colors for light
// and for dark, so that System switches between two palettes the reader
// likes, and the font for articles and summaries. The rest of the app keeps
// the device's own font. The choice is kept in the reader's account (see
// docs/decisions.md).

// The names shown for the themes, palettes and fonts are in the Appearance messages.
export const THEME_MODES = ["system", "light", "dark"] as const;
export type ThemeMode = (typeof THEME_MODES)[number];

/** The four colors a palette chooses. Every other shade is mixed from them. */
export interface Palette {
  /** The page. */
  bg: string;
  /** Cards, inputs and buttons. */
  surface: string;
  text: string;
  /** Links, the primary button and highlights. */
  accent: string;
}

export const LIGHT_PALETTES = {
  paper: { bg: "#fbfaf7", surface: "#ffffff", text: "#1d1f1e", accent: "#2b2723" },
  white: { bg: "#ffffff", surface: "#ffffff", text: "#1a1c1e", accent: "#2b2723" },
  sepia: { bg: "#f4ecd8", surface: "#fbf6ea", text: "#3d2f1f", accent: "#8f4d1c" },
  sage: { bg: "#e3ebd9", surface: "#eef4e8", text: "#1f2b20", accent: "#2d6a43" },
  mist: { bg: "#eef0f3", surface: "#f8f9fb", text: "#1c2128", accent: "#2b5aa8" },
} as const satisfies Record<string, Palette>;

export const DARK_PALETTES = {
  graphite: { bg: "#16171a", surface: "#1f2024", text: "#e8e6e1", accent: "#e3d8c1" },
  black: { bg: "#000000", surface: "#121314", text: "#d6d6d3", accent: "#d9ceb7" },
  slate: { bg: "#22272e", surface: "#2a3038", text: "#cdd5df", accent: "#74baff" },
  midnight: { bg: "#0e1726", surface: "#162135", text: "#d8e1ee", accent: "#7fb0ff" },
  dusk: { bg: "#1c1814", surface: "#26201a", text: "#e8dcc8", accent: "#e0a35e" },
} as const satisfies Record<string, Palette>;

const CJK_SERIF = `"Songti SC", "Noto Serif CJK SC", "Source Han Serif SC"`;
// Traditional Chinese draws many characters differently, so its text uses these.
const CJK_SERIF_TRADITIONAL = `"Songti TC", "Noto Serif CJK TC", "Source Han Serif TC"`;
const TRADITIONAL_CHINESE = ":is(:lang(zh-Hant),:lang(zh-TW),:lang(zh-HK),:lang(zh-MO))";

/**
 * Fonts for articles and summaries. Classic and Sans are fonts each device
 * already has (Sans is the app's own). The others are served by the app
 * (src/app/fonts.ts), and a browser downloads one only once it is chosen.
 * Chinese, Japanese and Korean text falls back to the device's fonts.
 */
export const READING_FONTS = {
  classic: { family: `"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, ${CJK_SERIF}, serif` },
  literata: { family: `var(--font-literata), ${CJK_SERIF}, serif` },
  "source-serif": { family: `var(--font-source-serif), ${CJK_SERIF}, serif` },
  merriweather: { family: `var(--font-merriweather), ${CJK_SERIF}, serif` },
  sans: { family: "var(--font-ui)" },
  atkinson: { family: "var(--font-atkinson), var(--font-ui)" },
} as const satisfies Record<string, { family: string }>;

export type LightPalette = keyof typeof LIGHT_PALETTES;
export type DarkPalette = keyof typeof DARK_PALETTES;
export type ReadingFont = keyof typeof READING_FONTS;

export interface Appearance {
  theme: ThemeMode;
  light: LightPalette;
  dark: DarkPalette;
  font: ReadingFont;
}

export const DEFAULT_APPEARANCE: Appearance = { theme: "system", light: "paper", dark: "graphite", font: "classic" };

function isKey<T extends object>(record: T, key: unknown): key is Extract<keyof T, string> {
  return typeof key === "string" && Object.hasOwn(record, key);
}

/**
 * An appearance from values that were stored or sent, so may be anything.
 * Each one that is unknown or missing falls back to the default, so a choice
 * that no longer exists doesn't undo the others.
 */
export function toAppearance(values: Partial<Record<keyof Appearance, unknown>> | null | undefined): Appearance {
  const { theme, light, dark, font } = values ?? {};
  return {
    theme: THEME_MODES.find((mode) => mode === theme) ?? DEFAULT_APPEARANCE.theme,
    light: isKey(LIGHT_PALETTES, light) ? light : DEFAULT_APPEARANCE.light,
    dark: isKey(DARK_PALETTES, dark) ? dark : DEFAULT_APPEARANCE.dark,
    font: isKey(READING_FONTS, font) ? font : DEFAULT_APPEARANCE.font,
  };
}

/** The page color, for the browser's own bars, when the device is in light mode and in dark mode. */
export function themeColors({ theme, light, dark }: Appearance): { light: string; dark: string } {
  const lightBg = LIGHT_PALETTES[light].bg;
  const darkBg = DARK_PALETTES[dark].bg;
  if (theme === "light") return { light: lightBg, dark: lightBg };
  if (theme === "dark") return { light: darkBg, dark: darkBg };
  return { light: lightBg, dark: darkBg };
}

type Scheme = "light" | "dark";

/** The color variables that globals.css uses, such as `var(--muted)`. */
export const COLOR_TOKENS = [
  "bg",
  "surface",
  "surface-2",
  "text",
  "muted",
  "border",
  "accent",
  "accent-hover",
  "accent-contrast",
  "accent-soft",
  "danger",
  "danger-soft",
  "warn-text",
  "warn-soft",
  "focus",
] as const;
export type ColorToken = (typeof COLOR_TOKENS)[number];

// Colors that mean the same thing in every palette. Their backgrounds are
// mixed into each palette's own card color.
const SCHEME_COLORS = {
  light: { danger: "#b42318", warn: "#7a4a00", focus: "#1f6feb" },
  dark: { danger: "#ff8a80", warn: "#f5c46b", focus: "#6ea8fe" },
};
const AMBER = "#f0a52c";

/** Every color token for a palette in a scheme, with the other shades mixed from its four colors. */
export function paletteTokens(palette: Palette, scheme: Scheme): Record<ColorToken, string> {
  const { bg, surface, text, accent } = palette;
  const { danger, warn, focus } = SCHEME_COLORS[scheme];
  const light = scheme === "light";
  return {
    bg,
    surface,
    "surface-2": mixColors(text, bg, light ? 0.05 : 0.07),
    text,
    muted: mixColors(text, bg, light ? 0.72 : 0.68),
    border: mixColors(text, bg, light ? 0.13 : 0.16),
    accent,
    // Hovering moves the accent toward the text, or, for an accent as dark or as
    // light as the text itself (the default palettes' ink and bone), toward the
    // page, so the change still shows.
    "accent-hover":
      contrastRatio(accent, text) < 1.3 ? mixColors(bg, accent, 0.18) : mixColors(text, accent, light ? 0.22 : 0.25),
    // Text on the accent, such as the primary button's: white or the page
    // color, whichever stands out more.
    "accent-contrast": contrastRatio("#ffffff", accent) >= contrastRatio(bg, accent) ? "#ffffff" : bg,
    "accent-soft": mixColors(accent, surface, light ? 0.12 : 0.16),
    danger,
    "danger-soft": mixColors(danger, surface, light ? 0.1 : 0.14),
    "warn-text": warn,
    "warn-soft": mixColors(AMBER, surface, 0.16),
    focus,
  };
}

const SHADOWS = { light: "0 1px 2px rgb(0 0 0 / 0.04), 0 2px 8px rgb(0 0 0 / 0.04)", dark: "none" };

/** A rule for each choice, chosen by a `data-*` attribute on <html>. The default also applies without one. */
function choiceRules(attribute: string, choices: Record<string, string>, fallback: string): string[] {
  // :where() adds no specificity, so the default yields to any other choice.
  return Object.entries(choices).map(
    ([name, declarations]) => `${name === fallback ? ":where(:root)," : ""}[data-${attribute}="${name}"]{${declarations}}`,
  );
}

function paletteRules(scheme: Scheme, palettes: Record<string, Palette>, fallback: string): string[] {
  const choices = Object.fromEntries(
    Object.entries(palettes).map(([name, palette]) => [
      name,
      Object.entries(paletteTokens(palette, scheme))
        .map(([token, value]) => `--${scheme}-${token}:${value}`)
        .join(";"),
    ]),
  );
  return choiceRules(scheme, choices, fallback);
}

function useScheme(scheme: Scheme): string {
  const variables = COLOR_TOKENS.map((token) => `--${token}:var(--${scheme}-${token})`);
  return [`color-scheme:${scheme}`, `--shadow:${SHADOWS[scheme]}`, ...variables].join(";");
}

/**
 * The style sheet behind the choices. Each palette defines its tokens as
 * `--light-*` or `--dark-*` variables, and the page uses the light set
 * unless the theme is Dark, or System on a device in dark mode. The font
 * sets `--font-read`.
 */
export function appearanceCss(): string {
  const fonts = Object.fromEntries(Object.entries(READING_FONTS).map(([name, font]) => [name, `--font-read:${font.family}`]));
  // The same fonts for Traditional Chinese text, in the interface or in an
  // article, with its own fonts for the Chinese characters. Declared on that
  // text itself, so --font-ui there (globals.css) is the Traditional one too.
  const traditional = Object.entries(READING_FONTS).map(([name, font]) => {
    const scopes = [`[data-font="${name}"]`, ...(name === DEFAULT_APPEARANCE.font ? [":where(:root)"] : [])];
    const selector = scopes.flatMap((scope) => [`${scope}${TRADITIONAL_CHINESE}`, `${scope} ${TRADITIONAL_CHINESE}`]).join(",");
    return `${selector}{--font-read:${font.family.replace(CJK_SERIF, CJK_SERIF_TRADITIONAL)}}`;
  });
  return [
    ...paletteRules("light", LIGHT_PALETTES, DEFAULT_APPEARANCE.light),
    ...paletteRules("dark", DARK_PALETTES, DEFAULT_APPEARANCE.dark),
    `:root{${useScheme("light")}}`,
    `@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){${useScheme("dark")}}}`,
    `:root[data-theme="dark"]{${useScheme("dark")}}`,
    ...choiceRules("font", fonts, DEFAULT_APPEARANCE.font),
    ...traditional,
  ].join("\n");
}

/**
 * The inline script that puts the appearance on <html> before the page is
 * first painted, so it never flashes the wrong colors or font. React doesn't
 * render these attributes itself; if it did, a refresh that was already
 * under way could undo a change the reader had just made.
 */
export function appearanceScript(appearance: Appearance): string {
  const { theme, light, dark, font } = appearance;
  return `Object.assign(document.documentElement.dataset,${JSON.stringify({ theme, light, dark, font })})`;
}
