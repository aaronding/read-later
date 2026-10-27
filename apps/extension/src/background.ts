// The extension's background script (a service worker in Chrome, an event
// page in Firefox): the toolbar button and its keyboard shortcut save the
// current page; the right-click menu saves a link.
import { sendSave, tokenRejected, type SavePayload } from "./api.js";
import { capturePage } from "./capture.js";
import { browserMessage as getMessage, outcomeText } from "./i18n.js";
import { loadSettings } from "./settings.js";

const MENU_ID = "save-link";
const COLORS = { busy: "#6b7280", ok: "#2b2723", error: "#b42318" };

chrome.runtime.onInstalled.addListener(async (details) => {
  // Firefox for Android has no context menus; the toolbar action still works there.
  chrome.contextMenus?.create({ id: MENU_ID, title: getMessage("contextMenuTitle"), contexts: ["link"] });
  if (details.reason === "install") {
    const settings = await loadSettings();
    if (!settings.serverUrl || !settings.token) await chrome.runtime.openOptionsPage();
  }
});

async function showBusy(tabId: number | undefined) {
  if (tabId === undefined) return;
  await chrome.action.setBadgeBackgroundColor({ tabId, color: COLORS.busy });
  await chrome.action.setBadgeText({ tabId, text: "…" });
}

async function showOutcome(tabId: number | undefined, ok: boolean, message: string) {
  if (tabId === undefined) return;
  await chrome.action.setBadgeBackgroundColor({ tabId, color: ok ? COLORS.ok : COLORS.error });
  await chrome.action.setBadgeText({ tabId, text: ok ? "✓" : "!" });
  // The tooltip explains the badge, especially when something went wrong.
  await chrome.action.setTitle({ tabId, title: getMessage("badgeTitle", message) });
  setTimeout(() => {
    void chrome.action.setBadgeText({ tabId, text: "" }).catch(() => {});
    void chrome.action.setTitle({ tabId, title: getMessage("actionTitle") }).catch(() => {});
  }, ok ? 4_000 : 15_000);
}

async function save(tabId: number | undefined, payload: SavePayload) {
  const settings = await loadSettings();
  const outcome = await sendSave(settings, payload);
  await showOutcome(tabId, outcome.ok, outcomeText(outcome, getMessage));
  // Not set up, or the token stopped working (revoked): the options page says
  // which and offers Connect, rather than leaving only the badge's "!".
  if (outcome.kind === "notConfigured" || tokenRejected(outcome)) {
    await chrome.runtime.openOptionsPage();
    // A page that was already open isn't reloaded; it checks again when asked.
    await chrome.runtime.sendMessage({ type: "checkSettings" }).catch(() => {});
  }
}

/** Saves the current page with its HTML, or just its URL if the page can't be read. */
async function savePage(tab: chrome.tabs.Tab) {
  if (!tab.url || !/^https?:/i.test(tab.url)) {
    return showOutcome(tab.id, false, getMessage("onlyWebPages"));
  }
  await showBusy(tab.id);
  let payload: SavePayload = { url: tab.url, title: tab.title };
  if (tab.id !== undefined) {
    try {
      const [frame] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: capturePage });
      if (frame?.result) payload = frame.result;
    } catch {
      // Some pages (the Chrome Web Store, built-in viewers) can't be read; send the URL.
    }
  }
  await save(tab.id, payload);
}

chrome.action.onClicked.addListener((tab) => {
  void savePage(tab);
});

chrome.contextMenus?.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_ID || !info.linkUrl) return;
  if (!/^https?:/i.test(info.linkUrl)) {
    void showOutcome(tab?.id, false, getMessage("onlyWebLinks"));
    return;
  }
  void showBusy(tab?.id).then(() => save(tab?.id, { url: info.linkUrl! }));
});
