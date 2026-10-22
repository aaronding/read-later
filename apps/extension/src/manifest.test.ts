import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { inflateRawSync } from "node:zlib";
import { afterAll, describe, expect, it } from "vitest";
import { DEFAULT_LOCALE, readCatalogues } from "../locales.mjs";
import { FIREFOX_ID, manifest } from "../manifest.mjs";
import { zipDirectory } from "../zip.mjs";

const info = { name: "Read Later", shortName: "Read Later", version: "0.1.0" };

describe("manifest", () => {
  it("keeps the product's name and takes the rest of its text from the catalogues", () => {
    const english = readCatalogues()[DEFAULT_LOCALE];
    for (const target of ["chrome", "firefox"] as const) {
      const built = manifest(target, info);
      expect(built.default_locale).toBe("en");
      expect([built.name, built.short_name]).toEqual(["Read Later", "Read Later"]);
      const names = [built.description, built.action.default_title, built.commands._execute_action.description];
      for (const name of names) expect(english).toHaveProperty(name.match(/^__MSG_(\w+)__$/)![1]!);
    }
  });

  it("runs the background script as a service worker in Chrome", () => {
    const chrome = manifest("chrome", info);
    expect(chrome.background).toEqual({ service_worker: "background.js", type: "module" });
    expect(chrome).not.toHaveProperty("browser_specific_settings");
  });

  it("gives Firefox an event page, a fixed ID and the data it sends", () => {
    const firefox = manifest("firefox", info);
    expect(firefox.background).toEqual({ scripts: ["background.js"], type: "module" });
    expect(firefox.browser_specific_settings.gecko).toEqual({
      id: FIREFOX_ID,
      strict_min_version: "140.0",
      data_collection_permissions: { required: ["browsingActivity", "websiteContent"] },
    });
    expect(firefox.browser_specific_settings.gecko_android).toEqual({ strict_min_version: "142.0" });
    // Everything else is the same in both browsers.
    const { background: _b, browser_specific_settings: _s, ...rest } = firefox;
    const { background: _c, ...chromeRest } = manifest("chrome", info);
    expect(rest).toEqual(chromeRest);
  });
});

describe("zipDirectory", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "zip-test-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("puts the files at the archive's root, readable by any unzip", () => {
    mkdirSync(path.join(dir, "icons"));
    writeFileSync(path.join(dir, "manifest.json"), '{"name":"Read Later"}');
    writeFileSync(path.join(dir, "icons", "a.png"), Buffer.from([1, 2, 3, 4]));
    const zip = zipDirectory(dir);

    // Read it back through the central directory, as unzip does.
    const end = zip.length - 22;
    expect(zip.readUInt32LE(end)).toBe(0x06054b50);
    const count = zip.readUInt16LE(end + 10);
    let at = zip.readUInt32LE(end + 16);
    const entries: Record<string, Buffer> = {};
    for (let i = 0; i < count; i++) {
      expect(zip.readUInt32LE(at)).toBe(0x02014b50);
      const nameLength = zip.readUInt16LE(at + 28);
      const name = zip.toString("utf8", at + 46, at + 46 + nameLength);
      const localAt = zip.readUInt32LE(at + 42);
      const size = zip.readUInt32LE(at + 20);
      const dataAt = localAt + 30 + zip.readUInt16LE(localAt + 26);
      entries[name] = inflateRawSync(zip.subarray(dataAt, dataAt + size));
      at += 46 + nameLength;
    }
    expect(Object.keys(entries)).toEqual(["icons/a.png", "manifest.json"]);
    expect(entries["manifest.json"]!.toString()).toBe('{"name":"Read Later"}');
    expect([...entries["icons/a.png"]!]).toEqual([1, 2, 3, 4]);
  });
});
