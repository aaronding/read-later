import { checkConnection, tokenRejected, type Outcome } from "./api.js";
import { connectPageUrl, tokenFromRedirect } from "./connect.js";
import { browserMessage as getMessage, localizePage, outcomeText, setRichText } from "./i18n.js";
import {
  DEFAULT_SERVER_URL,
  isDevelopmentInstall,
  loadSettings,
  normalizeServerUrl,
  storeSettings,
  type Settings,
} from "./settings.js";

// Two views: once the saved token works, only that it's connected; otherwise
// the form to connect (Connect, or a pasted token), with what went wrong. Both
// start hidden until the saved settings are read. Revoking the token in the web
// app's Settings brings the form back, to connect another account or server.
const connectedView = document.querySelector<HTMLElement>("#connectedView")!;
const connectedStatus = document.querySelector<HTMLParagraphElement>("#connectedStatus")!;
const connectedServer = document.querySelector<HTMLParagraphElement>("#connectedServer")!;
const form = document.querySelector<HTMLFormElement>("#settings")!;
const serverUrl = document.querySelector<HTMLInputElement>("#serverUrl")!;
const token = document.querySelector<HTMLInputElement>("#token")!;
const connectButton = document.querySelector<HTMLButtonElement>("#connect")!;
const connectStatus = document.querySelector<HTMLParagraphElement>("#connectStatus")!;
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

// The server URL can be changed only in a development install; elsewhere it is always the app's own.
const development = await isDevelopmentInstall();
document.querySelector<HTMLElement>("#serverArea")!.hidden = !development;

function serverAddress(): string {
  return development ? normalizeServerUrl(serverUrl.value) : DEFAULT_SERVER_URL;
}

type Tone = "ok" | "error" | "note";
type Near = "connect" | "save";

/** The connected view; in a development install, it also names the server. */
function showConnected(message: string, tone: Tone, settings: Settings) {
  form.hidden = true;
  connectedView.hidden = false;
  connectedStatus.textContent = message;
  connectedStatus.className = `status ${tone}`;
  connectedServer.textContent = getMessage("connectedServer", settings.serverUrl);
  connectedServer.hidden = !development;
}

/**
 * The form, with a message under Connect (its outcome, and the page's own check)
 * or under Save and check, clearing the other, so the page says one thing at a time.
 */
function showForm(message = "", tone: Tone = "note", near: Near = "connect") {
  connectedView.hidden = true;
  form.hidden = false;
  const target = near === "connect" && canConnect ? connectStatus : status;
  for (const element of [connectStatus, status]) {
    element.textContent = element === target ? message : "";
    element.className = element === target ? `status ${tone}` : "status";
  }
}

/** Where a check leaves the page: connected, or the form with what went wrong and the way out. */
function showOutcome(outcome: Outcome, settings: Settings, near: Near = "connect", connected = getMessage("connected")) {
  if (outcome.ok) return showConnected(connected, "ok", settings);
  const text = tokenRejected(outcome) && canConnect ? getMessage("tokenRejected") : outcomeText(outcome, getMessage);
  showForm(text, "error", near);
}

// While connecting or checking, the page's own check of the saved settings waits.
let busy = false;

/** Checks the saved settings, so a page opened after a failed save says what went wrong. */
async function checkSaved() {
  if (busy) return;
  const settings = await loadSettings();
  if (!settings.token) return showForm();
  // On opening, the page says it's checking rather than showing the form for a moment.
  if (connectedView.hidden && form.hidden) showConnected(getMessage("checkingConnection"), "note", settings);
  const outcome = await checkConnection(settings);
  if (!busy) showOutcome(outcome, settings);
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
  const server = serverAddress();
  if (!server) return showForm(getMessage("enterServerUrl"), "error");
  serverUrl.value = server;
  busy = true;
  connectButton.disabled = true;
  showForm(getMessage("connecting"));
  try {
    const state = crypto.randomUUID().replaceAll("-", "");
    const url = connectPageUrl(server, chrome.identity.getRedirectURL(), state);
    const answer = await chrome.identity.launchWebAuthFlow({ url, interactive: true }).then(
      (responseUrl) => tokenFromRedirect(responseUrl ?? "", state),
      // The window was closed, or its page couldn't load.
      () => null,
    );
    if (!answer) return showForm(getMessage("notConnected"), "error");
    const settings = { serverUrl: server, token: answer };
    await storeSettings(settings);
    token.value = settings.token;
    // The window has closed: say plainly that it worked, in words the page's own check doesn't use.
    showOutcome(await checkConnection(settings), settings, "connect", getMessage("connectedNow"));
  } finally {
    busy = false;
    connectButton.disabled = false;
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const settings = { serverUrl: serverAddress(), token: token.value.trim() };
  if (!settings.serverUrl) return showForm(getMessage("enterServerUrl"), "error", "save");
  if (!settings.token.startsWith("rl_")) return showForm(getMessage("enterToken"), "error", "save");
  busy = true;
  try {
    await storeSettings(settings);
    serverUrl.value = settings.serverUrl;
    showForm(getMessage("checking"), "note", "save");
    showOutcome(await checkConnection(settings), settings, "save", getMessage("connectedNow"));
  } finally {
    busy = false;
  }
});
