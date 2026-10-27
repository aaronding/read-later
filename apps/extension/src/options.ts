import { checkConnection, tokenRejected, type Outcome } from "./api.js";
import { connectPageUrl, tokenFromRedirect } from "./connect.js";
import { browserMessage as getMessage, localizePage, outcomeText, setRichText } from "./i18n.js";
import { loadSettings, normalizeServerUrl, storeSettings } from "./settings.js";

const form = document.querySelector<HTMLFormElement>("#settings")!;
const serverUrl = document.querySelector<HTMLInputElement>("#serverUrl")!;
const token = document.querySelector<HTMLInputElement>("#token")!;
const connectButton = document.querySelector<HTMLButtonElement>("#connect")!;
const status = document.querySelector<HTMLParagraphElement>("#status")!;
const appName = chrome.runtime.getManifest().name;

localizePage(document, getMessage);
document.querySelectorAll(".app-name").forEach((element) => (element.textContent = appName));
// Firefox serves extension pages from moz-extension: addresses; Chrome, Edge and Brave from chrome-extension:.
const firefox = location.protocol === "moz-extension:";
const shortcuts = firefox ? getMessage("shortcutsFirefox") : getMessage("shortcutsChrome");
setRichText(document.querySelector<HTMLElement>("#usage")!, getMessage("usage", shortcuts));

// Firefox for Android has no identity API, so the token is pasted there.
const canConnect = typeof chrome.identity?.launchWebAuthFlow === "function";
if (!canConnect) {
  document.querySelector<HTMLElement>("#connectArea")!.hidden = true;
  document.querySelector<HTMLElement>("#tokenHint")!.textContent = getMessage("tokenHint");
}

function show(message: string, ok: boolean) {
  status.textContent = message;
  status.className = ok ? "ok" : "error";
}

/** How a check went, with the way out when the server refused the token. */
function showOutcome(outcome: Outcome) {
  show(tokenRejected(outcome) && canConnect ? getMessage("tokenRejected") : outcomeText(outcome, getMessage), outcome.ok);
}

// While connecting or checking, the page's own check of the saved settings waits.
let busy = false;

/** Checks the saved settings, so a page opened after a failed save says what went wrong. */
async function checkSaved() {
  if (busy) return;
  const settings = await loadSettings();
  if (!settings.token) return;
  const outcome = await checkConnection(settings);
  if (!busy) showOutcome(outcome);
}

void loadSettings().then((settings) => {
  serverUrl.value = settings.serverUrl;
  token.value = settings.token;
  return checkSaved();
});

// The background script asks again when a save fails while this page is already open.
chrome.runtime.onMessage.addListener((message: unknown) => {
  if ((message as { type?: unknown } | null)?.type === "checkSettings") void checkSaved();
});

connectButton.addEventListener("click", async () => {
  const server = normalizeServerUrl(serverUrl.value);
  if (!server) return show(getMessage("enterServerUrl"), false);
  serverUrl.value = server;
  busy = true;
  connectButton.disabled = true;
  show(getMessage("connecting"), true);
  try {
    const state = crypto.randomUUID().replaceAll("-", "");
    const url = connectPageUrl(server, chrome.identity.getRedirectURL(), state);
    const answer = await chrome.identity.launchWebAuthFlow({ url, interactive: true }).then(
      (responseUrl) => tokenFromRedirect(responseUrl ?? "", state),
      // The window was closed, or its page couldn't load.
      () => null,
    );
    if (!answer) return show(getMessage("notConnected"), false);
    const settings = { serverUrl: server, token: answer };
    await storeSettings(settings);
    token.value = settings.token;
    showOutcome(await checkConnection(settings));
  } finally {
    busy = false;
    connectButton.disabled = false;
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const settings = { serverUrl: normalizeServerUrl(serverUrl.value), token: token.value.trim() };
  if (!settings.serverUrl) return show(getMessage("enterServerUrl"), false);
  if (!settings.token.startsWith("rl_")) return show(getMessage("enterToken"), false);
  busy = true;
  try {
    await storeSettings(settings);
    serverUrl.value = settings.serverUrl;
    show(getMessage("checking"), true);
    showOutcome(await checkConnection(settings));
  } finally {
    busy = false;
  }
});
