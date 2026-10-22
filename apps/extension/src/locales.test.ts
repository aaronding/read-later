import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_LOCALE, readCatalogues, withBrand } from "../locales.mjs";
import { manifest } from "../manifest.mjs";

type Catalogue = Record<string, { message: string; placeholders?: Record<string, { content: string }> }>;

const catalogues = readCatalogues() as Record<string, Catalogue>;
const english = catalogues[DEFAULT_LOCALE]!;
const read = (file: string) => readFileSync(new URL(file, import.meta.url), "utf8");
const found = (text: string, pattern: RegExp) => [...text.matchAll(pattern)].map((match) => match[1]!);
const placeholders = (message: string) => found(message, /\$(\w+)\$/g).map((name) => name.toLowerCase()).sort();

/** The lang attribute each folder's catalogue gives the options page: the web app's language tags. */
const LANGUAGES: Record<string, string> = { en: "en", fr: "fr", zh_CN: "zh-Hans", zh_TW: "zh-Hant" };

describe("the catalogues", () => {
  it("include English, and each names its language", () => {
    expect(Object.keys(catalogues)).toContain(DEFAULT_LOCALE);
    for (const [folder, catalogue] of Object.entries(catalogues)) {
      expect(catalogue.locale?.message, folder).toBe(LANGUAGES[folder]);
    }
  });

  it("translate only English messages, keeping their placeholders", () => {
    for (const [folder, catalogue] of Object.entries(catalogues)) {
      for (const [name, entry] of Object.entries(catalogue)) {
        const where = `${folder}: ${name}`;
        expect(english, where).toHaveProperty(name);
        expect(entry.message.trim(), where).not.toBe("");
        expect(placeholders(entry.message), where).toEqual(placeholders(english[name]!.message));
        for (const placeholder of placeholders(entry.message)) {
          expect(entry.placeholders?.[placeholder]?.content, where).toBe(english[name]!.placeholders![placeholder]!.content);
        }
        // {app} is the only name the build fills in.
        expect(found(entry.message, /\{(\w+)\}/g).filter((word) => word !== "app"), where).toEqual([]);
        expect(found(entry.message, /<(\w+)>/g), where).toEqual(found(english[name]!.message, /<(\w+)>/g));
      }
    }
  });

  it("are complete, so no message falls back to English", () => {
    for (const [folder, catalogue] of Object.entries(catalogues)) {
      expect(Object.keys(catalogue).sort(), folder).toEqual(Object.keys(english).sort());
    }
  });

  it("have every message the extension uses, and only those", () => {
    const sources = readdirSync(new URL(".", import.meta.url)).filter((file) => /(?<!\.test)\.ts$/.test(file));
    const info = { name: "Read Later", shortName: "Read Later", version: "1.0" };
    const used = new Set([
      ...sources.flatMap((file) => found(read(file), /getMessage\("(\w+)"/g)),
      ...found(read("../static/options.html"), /data-i18n(?:-\w+)?="(\w+)"/g),
      ...(["chrome", "firefox"] as const).flatMap((target) =>
        found(JSON.stringify(manifest(target, info)), /__MSG_(\w+)__/g),
      ),
    ]);
    expect([...used].filter((name) => !(name in english))).toEqual([]);
    expect(Object.keys(english).filter((name) => !used.has(name))).toEqual([]);
    // Browsers ignore case in message names, and allow only these characters.
    expect(new Set(Object.keys(english).map((name) => name.toLowerCase())).size).toBe(Object.keys(english).length);
    for (const name of Object.keys(english)) expect(name).toMatch(/^[A-Za-z0-9_]+$/);
  });
});

describe("withBrand", () => {
  it("puts the product name in every message", () => {
    const branded = withBrand(english, "Gist Later") as Catalogue;
    expect(Object.keys(branded)).toEqual(Object.keys(english));
    expect(Object.values(branded).filter((entry) => entry.message.includes("{app}"))).toEqual([]);
    expect(branded.contextMenuTitle).toEqual({ ...english.contextMenuTitle, message: "Save link to Gist Later" });
    expect(branded.badgeTitle!.message).toBe("Gist Later: $MESSAGE$");
  });

  it("keeps a $ in the name from starting a placeholder", () => {
    expect(withBrand({ saved: { message: "Saved to {app}" } }, "Cash$Later")).toEqual({
      saved: { message: "Saved to Cash$$Later" },
    });
  });
});
