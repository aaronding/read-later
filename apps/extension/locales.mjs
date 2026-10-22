// The extension's text: one messages.json per language in _locales/<folder>
// (en, fr, zh_CN, zh_TW), which Chrome and Firefox read through chrome.i18n.
// The catalogues write the product name as {app}; the build puts the name from
// packages/brand in its place, so renaming the app needs no change here.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** The catalogue the browsers fall back to, message by message. */
export const DEFAULT_LOCALE = "en";

const LOCALES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "_locales");

/** Every catalogue in _locales, by folder name. */
export function readCatalogues() {
  const catalogues = {};
  for (const folder of readdirSync(LOCALES_DIR).sort()) {
    const file = path.join(LOCALES_DIR, folder, "messages.json");
    if (existsSync(file)) catalogues[folder] = JSON.parse(readFileSync(file, "utf8"));
  }
  return catalogues;
}

/** The catalogue with the product name in place of {app} in every message. */
export function withBrand(catalogue, name) {
  // In a message, "$" starts a placeholder and "$$" stands for "$" itself.
  const brand = name.replaceAll("$", () => "$$");
  const branded = Object.entries(catalogue).map(([key, entry]) => [
    key,
    { ...entry, message: entry.message.replaceAll("{app}", () => brand) },
  ]);
  return Object.fromEntries(branded);
}
