// Builds the extension for Chrome into dist/ ("Load unpacked"), with dist.zip
// to upload to the Chrome Web Store, and for Firefox into dist-firefox/, with
// dist-firefox.zip to upload to addons.mozilla.org: compiles the TypeScript, copies the static files and writes
// each browser's manifest.json and each language's messages.json with the
// product name from packages/brand.
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { APP_NAME, APP_SHORT_NAME } from "@read-later/brand";
import { readCatalogues, withBrand } from "./locales.mjs";
import { manifest } from "./manifest.mjs";
import { zipDirectory } from "./zip.mjs";

const require = createRequire(import.meta.url);
const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
const info = { name: APP_NAME, shortName: APP_SHORT_NAME, version };
const writeJson = (file, value) => writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);

for (const output of ["dist", "dist.zip", "dist-firefox", "dist-firefox.zip"]) rmSync(output, { recursive: true, force: true });
execFileSync(process.execPath, [require.resolve("typescript/bin/tsc"), "-p", "tsconfig.json"], { stdio: "inherit" });
cpSync("static", "dist", { recursive: true });
for (const [folder, catalogue] of Object.entries(readCatalogues())) {
  mkdirSync(`dist/_locales/${folder}`, { recursive: true });
  writeJson(`dist/_locales/${folder}/messages.json`, withBrand(catalogue, APP_NAME));
}
cpSync("dist", "dist-firefox", { recursive: true });
writeJson("dist/manifest.json", manifest("chrome", info));
writeJson("dist-firefox/manifest.json", manifest("firefox", info));
writeFileSync("dist.zip", zipDirectory("dist"));
writeFileSync("dist-firefox.zip", zipDirectory("dist-firefox"));

console.log(`Built ${APP_NAME} ${version}:
  apps/extension/dist          Chrome: load it unpacked from chrome://extensions, or upload dist.zip to the Chrome Web Store
  apps/extension/dist-firefox  Firefox: load it from about:debugging, or upload dist-firefox.zip to addons.mozilla.org`);
