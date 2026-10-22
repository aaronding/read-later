import { checkConnection } from "./api.js";
import { browserMessage as getMessage, localizePage, outcomeText, setRichText } from "./i18n.js";
import { loadSettings, normalizeServerUrl, storeSettings } from "./settings.js";

const form = document.querySelector<HTMLFormElement>("#settings")!;
const serverUrl = document.querySelector<HTMLInputElement>("#serverUrl")!;
const token = document.querySelector<HTMLInputElement>("#token")!;
const status = document.querySelector<HTMLParagraphElement>("#status")!;
const appName = chrome.runtime.getManifest().name;

localizePage(document, getMessage);
document.querySelectorAll(".app-name").forEach((element) => (element.textContent = appName));
// Firefox serves extension pages from moz-extension: addresses; Chrome, Edge and Brave from chrome-extension:.
const firefox = location.protocol === "moz-extension:";
const shortcuts = firefox ? getMessage("shortcutsFirefox") : getMessage("shortcutsChrome");
setRichText(document.querySelector<HTMLElement>("#usage")!, getMessage("usage", shortcuts));

function show(message: string, ok: boolean) {
  status.textContent = message;
  status.className = ok ? "ok" : "error";
}

void loadSettings().then((settings) => {
  serverUrl.value = settings.serverUrl;
  token.value = settings.token;
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const settings = { serverUrl: normalizeServerUrl(serverUrl.value), token: token.value.trim() };
  if (!settings.serverUrl) return show(getMessage("enterServerUrl"), false);
  if (!settings.token.startsWith("rl_")) return show(getMessage("enterToken"), false);
  await storeSettings(settings);
  serverUrl.value = settings.serverUrl;
  show(getMessage("checking"), true);
  const result = await checkConnection(settings);
  show(outcomeText(result, getMessage), result.ok);
});
