// Builds the extension for Chrome into dist/ ("Load unpacked") and for Firefox
// into dist-firefox/: compiles the TypeScript, copies the static files and
// writes each browser's manifest.json with the product name from
// packages/brand.
import { execFileSync } from "node:child_process";
import { cpSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { APP_NAME, APP_SHORT_NAME } from "@read-later/brand";
import { manifest } from "./manifest.mjs";

const require = createRequire(import.meta.url);
const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
const info = { name: APP_NAME, shortName: APP_SHORT_NAME, version };
const writeJson = (file, value) => writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);

for (const output of ["dist", "dist-firefox"]) rmSync(output, { recursive: true, force: true });
execFileSync(process.execPath, [require.resolve("typescript/bin/tsc"), "-p", "tsconfig.json"], { stdio: "inherit" });
cpSync("static", "dist", { recursive: true });
cpSync("dist", "dist-firefox", { recursive: true });
writeJson("dist/manifest.json", manifest("chrome", info));
writeJson("dist-firefox/manifest.json", manifest("firefox", info));

console.log(`Built ${APP_NAME} ${version}:
  apps/extension/dist          Chrome: load it unpacked from chrome://extensions
  apps/extension/dist-firefox  Firefox: load it from about:debugging`);
