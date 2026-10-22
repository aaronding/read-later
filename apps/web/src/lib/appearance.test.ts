import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  COLOR_TOKENS,
  DARK_PALETTES,
  DEFAULT_APPEARANCE,
  LIGHT_PALETTES,
  READING_FONTS,
  appearanceCss,
  appearanceScript,
  formatAppearance,
  paletteTokens,
  parseAppearance,
  themeColors,
  type Palette,
} from "./appearance";
import { contrastRatio } from "./color";

describe("parseAppearance", () => {
  it("reads each part of the cookie", () => {
    expect(parseAppearance("dark.sepia.black.literata")).toEqual({
      theme: "dark",
      light: "sepia",
      dark: "black",
      font: "literata",
    });
  });

  it("falls back to the default for a missing or unknown cookie", () => {
    expect(parseAppearance(undefined)).toEqual(DEFAULT_APPEARANCE);
    expect(parseAppearance("")).toEqual(DEFAULT_APPEARANCE);
    expect(parseAppearance("nonsense")).toEqual(DEFAULT_APPEARANCE);
  });

  it("keeps the parts it knows when others are unknown or missing", () => {
    expect(parseAppearance("light.neon.black")).toEqual({ ...DEFAULT_APPEARANCE, theme: "light", dark: "black" });
  });

  it("doesn't take inherited property names for choices", () => {
    expect(parseAppearance("constructor.toString.__proto__.valueOf")).toEqual(DEFAULT_APPEARANCE);
  });

  it("reads back what formatAppearance writes", () => {
    const appearance = { theme: "system", light: "sage", dark: "midnight", font: "source-serif" } as const;
    expect(formatAppearance(appearance)).toBe("system.sage.midnight.source-serif");
    expect(parseAppearance(formatAppearance(appearance))).toEqual(appearance);
  });
});

describe("themeColors", () => {
  it("follows the device in System, and uses one palette in Light or Dark", () => {
    const choice = { light: "sepia", dark: "dusk", font: "classic" } as const;
    expect(themeColors({ ...choice, theme: "system" })).toEqual({ light: "#f4ecd8", dark: "#1c1814" });
    expect(themeColors({ ...choice, theme: "light" })).toEqual({ light: "#f4ecd8", dark: "#f4ecd8" });
    expect(themeColors({ ...choice, theme: "dark" })).toEqual({ light: "#1c1814", dark: "#1c1814" });
  });
});

// WCAG: 4.5:1 for text (AA), 3:1 for the focus ring. Article and summary text
// is held to 7:1 (AAA), since it's what people read for minutes at a time.
describe.each([
  ["light", LIGHT_PALETTES],
  ["dark", DARK_PALETTES],
] as const)("the %s palettes", (scheme, palettes: Record<string, Palette>) => {
  it.each(Object.keys(palettes))("%s is easy to read", (name) => {
    const t = paletteTokens(palettes[name]!, scheme);
    const pairs: [string, string, string, number][] = [
      ["text on the page", t.text, t.bg, 7],
      ["text on cards", t.text, t.surface, 7],
      ["text on code and notices", t.text, t["surface-2"], 7],
      ["text on the selected chip", t.text, t["accent-soft"], 4.5],
      ["secondary text on the page", t.muted, t.bg, 4.5],
      ["secondary text on cards", t.muted, t.surface, 4.5],
      ["secondary text on badges", t.muted, t["surface-2"], 4.5],
      ["links on the page", t.accent, t.bg, 4.5],
      ["links on cards", t.accent, t.surface, 4.5],
      ["accent badges", t.accent, t["accent-soft"], 4.5],
      ["the primary button", t["accent-contrast"], t.accent, 4.5],
      ["the primary button, hovered", t["accent-contrast"], t["accent-hover"], 4.5],
      ["errors on the page", t.danger, t.bg, 4.5],
      ["errors on cards", t.danger, t.surface, 4.5],
      ["error notices", t.danger, t["danger-soft"], 4.5],
      ["warnings on the page", t["warn-text"], t.bg, 4.5],
      ["warning notices", t["warn-text"], t["warn-soft"], 4.5],
      ["the focus ring on the page", t.focus, t.bg, 3],
      ["the focus ring on cards", t.focus, t.surface, 3],
    ];
    for (const [what, foreground, background, minimum] of pairs) {
      expect(contrastRatio(foreground, background), what).toBeGreaterThanOrEqual(minimum);
    }
  });
});

describe("appearanceCss", () => {
  const css = appearanceCss();

  it("has a rule for every palette and font, with the defaults also applying without a choice", () => {
    for (const name of Object.keys(LIGHT_PALETTES)) expect(css).toContain(`[data-light="${name}"]{`);
    for (const name of Object.keys(DARK_PALETTES)) expect(css).toContain(`[data-dark="${name}"]{`);
    for (const name of Object.keys(READING_FONTS)) expect(css).toContain(`[data-font="${name}"]{`);
    expect(css).toContain(`:where(:root),[data-light="${DEFAULT_APPEARANCE.light}"]{`);
    expect(css).toContain(`:where(:root),[data-dark="${DEFAULT_APPEARANCE.dark}"]{`);
    expect(css).toContain(`:where(:root),[data-font="${DEFAULT_APPEARANCE.font}"]{`);
  });

  it("uses the light set by default, and the dark set for Dark and for System on a dark device", () => {
    const rules = css.split("\n");
    const light = rules.find((rule) => rule.startsWith(":root{"));
    const system = rules.find((rule) => rule.startsWith("@media (prefers-color-scheme:dark){:root:not([data-theme=\"light\"]){"));
    const dark = rules.find((rule) => rule.startsWith(':root[data-theme="dark"]{'));
    for (const token of COLOR_TOKENS) {
      expect(light).toContain(`--${token}:var(--light-${token})`);
      expect(system).toContain(`--${token}:var(--dark-${token})`);
      expect(dark).toContain(`--${token}:var(--dark-${token})`);
    }
    expect(light).toContain("color-scheme:light");
    expect(dark).toContain("color-scheme:dark");
  });

  it("only uses font variables that src/app/fonts.ts defines", () => {
    const fontsModule = readFileSync(new URL("../app/fonts.ts", import.meta.url), "utf8");
    const defined = new Set([...fontsModule.matchAll(/variable: "(--font-[a-z-]+)"/g)].map((match) => match[1]));
    const used = Object.values(READING_FONTS).flatMap((font) => [...font.family.matchAll(/var\((--font-[a-z-]+)\)/g)].map((match) => match[1]));
    for (const variable of used) {
      if (variable !== "--font-ui") expect(defined, variable).toContain(variable);
    }
  });
});

describe("appearanceScript", () => {
  it("puts the appearance on <html>", () => {
    const dataset: Record<string, string> = {};
    const appearance = { theme: "dark", light: "sepia", dark: "black", font: "sans" } as const;
    new Function("document", appearanceScript(appearance))({ documentElement: { dataset } });
    expect(dataset).toEqual(appearance);
  });
});
