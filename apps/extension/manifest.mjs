// The extension's manifest.json for each browser. The code is the same; Chrome
// runs the background script as a service worker, Firefox as an event page,
// and Firefox also needs an add-on ID and a statement of what data is sent.
// The name is the product's own; the other text is looked up in _locales.
import { DEFAULT_LOCALE } from "./locales.mjs";

/** Fixed, so renaming the app (packages/brand) never changes the add-on. */
export const FIREFOX_ID = "read-later@aaronding";

/** @param {"chrome" | "firefox"} target */
export function manifest(target, { name, shortName, version }) {
  const icons = { 16: "icons/icon-16.png", 32: "icons/icon-32.png", 48: "icons/icon-48.png", 128: "icons/icon-128.png" };
  const shared = {
    manifest_version: 3,
    name,
    short_name: shortName,
    version,
    description: "__MSG_extensionDescription__",
    default_locale: DEFAULT_LOCALE,
    icons,
    action: { default_title: "__MSG_actionTitle__", default_icon: icons },
    // activeTab + scripting: read the current page only when you click or
    // press the shortcut. No access to any site otherwise.
    permissions: ["activeTab", "scripting", "contextMenus", "storage"],
    options_ui: { page: "options.html", open_in_tab: true },
    commands: {
      _execute_action: {
        suggested_key: { default: "Alt+Shift+S", mac: "Alt+Shift+S" },
        description: "__MSG_commandDescription__",
      },
    },
  };
  if (target === "chrome") {
    return { ...shared, background: { service_worker: "background.js", type: "module" } };
  }
  return {
    ...shared,
    background: { scripts: ["background.js"], type: "module" },
    browser_specific_settings: {
      gecko: {
        id: FIREFOX_ID,
        // The first Firefox that asks for consent to the data below itself.
        strict_min_version: "140.0",
        // Saving sends the page's address and content to your server.
        data_collection_permissions: { required: ["browsingActivity", "websiteContent"] },
      },
      // Firefox for Android asks for that consent from version 142.
      gecko_android: { strict_min_version: "142.0" },
    },
  };
}
