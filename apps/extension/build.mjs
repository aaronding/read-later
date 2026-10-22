// Builds the extension into dist/ for "Load unpacked": compiles the
// TypeScript, copies the static files and writes manifest.json with the
// product name from packages/brand.
import { execFileSync } from "node:child_process";
import { cpSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { APP_NAME, APP_SHORT_NAME } from "@read-later/brand";

const require = createRequire(import.meta.url);
const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

rmSync("dist", { recursive: true, force: true });
execFileSync(process.execPath, [require.resolve("typescript/bin/tsc"), "-p", "tsconfig.json"], { stdio: "inherit" });
cpSync("static", "dist", { recursive: true });

const icons = { 16: "icons/icon-16.png", 32: "icons/icon-32.png", 48: "icons/icon-48.png", 128: "icons/icon-128.png" };
const manifest = {
  manifest_version: 3,
  name: APP_NAME,
  short_name: APP_SHORT_NAME,
  version,
  description: `Save the page you're reading, or a link, to ${APP_NAME}.`,
  icons,
  action: { default_title: `Save to ${APP_NAME}`, default_icon: icons },
  background: { service_worker: "background.js", type: "module" },
  // activeTab + scripting: read the current page only when you click or
  // press the shortcut. No access to any site otherwise.
  permissions: ["activeTab", "scripting", "contextMenus", "storage"],
  options_ui: { page: "options.html", open_in_tab: true },
  commands: {
    _execute_action: {
      suggested_key: { default: "Alt+Shift+S", mac: "Alt+Shift+S" },
      description: "Save this page",
    },
  },
};
writeFileSync("dist/manifest.json", `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Built ${APP_NAME} ${version} into apps/extension/dist. Load it unpacked from chrome://extensions.`);
