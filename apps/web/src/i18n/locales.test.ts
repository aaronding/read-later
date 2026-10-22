import { describe, expect, it } from "vitest";
import { localeFromAcceptLanguage, preferredLocale, toSupportedLocale } from "./locales";
import { loadMessages } from "./messages";

describe("toSupportedLocale", () => {
  it("maps regional and script variants to the interface languages", () => {
    expect(toSupportedLocale("en-GB")).toBe("en");
    expect(toSupportedLocale("fr-CA")).toBe("fr");
    expect(toSupportedLocale("zh")).toBe("zh-Hans");
    expect(toSupportedLocale("zh-CN")).toBe("zh-Hans");
    expect(toSupportedLocale("zh-SG")).toBe("zh-Hans");
    expect(toSupportedLocale("zh-Hans")).toBe("zh-Hans");
    expect(toSupportedLocale("zh-TW")).toBe("zh-Hant");
    expect(toSupportedLocale("zh-HK")).toBe("zh-Hant");
    expect(toSupportedLocale("zh-Hant")).toBe("zh-Hant");
  });

  it("has nothing for other languages or malformed tags", () => {
    expect(toSupportedLocale("de")).toBeUndefined();
    expect(toSupportedLocale("ja-JP")).toBeUndefined();
    expect(toSupportedLocale("not a tag")).toBeUndefined();
    expect(toSupportedLocale("")).toBeUndefined();
  });
});

describe("localeFromAcceptLanguage", () => {
  it("takes the most preferred supported language", () => {
    expect(localeFromAcceptLanguage("de-DE,de;q=0.9,fr-CA;q=0.5,en;q=0.3")).toBe("fr");
    expect(localeFromAcceptLanguage("zh-TW,zh;q=0.9,en-US;q=0.8")).toBe("zh-Hant");
    expect(localeFromAcceptLanguage("en;q=0.5, zh-CN")).toBe("zh-Hans");
  });

  it("keeps header order between equal weights and skips q=0 and *", () => {
    expect(localeFromAcceptLanguage("fr, en")).toBe("fr");
    expect(localeFromAcceptLanguage("fr;q=0, en")).toBe("en");
    expect(localeFromAcceptLanguage("*, zh-HK;q=0.1")).toBe("zh-Hant");
  });

  it("has nothing when no language is supported", () => {
    expect(localeFromAcceptLanguage("de, ja")).toBeUndefined();
    expect(localeFromAcceptLanguage(null)).toBeUndefined();
    expect(localeFromAcceptLanguage("")).toBeUndefined();
  });
});

describe("preferredLocale", () => {
  it("puts a saved choice before the browser's languages, and English last", () => {
    expect(preferredLocale("zh-Hant", "fr")).toBe("zh-Hant");
    expect(preferredLocale(null, "fr-FR, en")).toBe("fr");
    expect(preferredLocale(undefined, "de")).toBe("en");
  });
});

describe("loadMessages", () => {
  it("fills a translation's gaps from English", async () => {
    const [english, french] = await Promise.all([loadMessages("en"), loadMessages("fr")]);
    expect(Object.keys(french).sort()).toEqual(Object.keys(english).sort());
    for (const [namespace, messages] of Object.entries(english)) {
      expect(Object.keys((french as Record<string, object>)[namespace]!).sort()).toEqual(Object.keys(messages).sort());
    }
  });
});
