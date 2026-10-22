import { checkConnection } from "./api.js";
import { loadSettings, normalizeServerUrl, storeSettings } from "./settings.js";

const form = document.querySelector<HTMLFormElement>("#settings")!;
const serverUrl = document.querySelector<HTMLInputElement>("#serverUrl")!;
const token = document.querySelector<HTMLInputElement>("#token")!;
const status = document.querySelector<HTMLParagraphElement>("#status")!;
const appName = chrome.runtime.getManifest().name;

document.title = `${appName} options`;
document.querySelectorAll(".app-name").forEach((element) => (element.textContent = appName));

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
  if (!settings.serverUrl) return show("Enter the address of your server, such as https://read.example.com.", false);
  if (!settings.token.startsWith("rl_")) return show("Paste an access token from the app’s Settings page (it starts with rl_).", false);
  await storeSettings(settings);
  serverUrl.value = settings.serverUrl;
  show("Saved. Checking the connection…", true);
  const result = await checkConnection(settings);
  show(result.ok ? `${result.message}. You’re ready to save pages.` : result.message, result.ok);
});
