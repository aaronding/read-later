export interface Settings {
  serverUrl: string;
  token: string;
}

/** The app's own address, and the only one outside a development install. */
export const DEFAULT_SERVER_URL = "https://www.readsooner.com";

/**
 * True when the extension was loaded for development: Load unpacked in Chrome,
 * a temporary add-on in Firefox. Only then can the server URL be changed, as to
 * http://localhost:3000; an install from a store or a signed file always uses
 * DEFAULT_SERVER_URL. getSelf() needs no permission.
 */
export async function isDevelopmentInstall(): Promise<boolean> {
  try {
    return (await chrome.management.getSelf()).installType === "development";
  } catch {
    return false;
  }
}

const defaultHost = new URL(DEFAULT_SERVER_URL).hostname;
const ownHosts = new Set([defaultHost, defaultHost.replace(/^www\./, "")]);

/**
 * "read.example.com/" becomes "https://read.example.com"; "localhost:3000" becomes "http://localhost:3000".
 * The app's own domain, with or without www and with any path, becomes DEFAULT_SERVER_URL: the bare
 * domain and http redirect there, and a redirect to another host drops the token.
 */
export function normalizeServerUrl(input: string): string {
  let value = input.trim().replace(/\/+$/, "");
  if (!value) return "";
  if (!/^https?:\/\//i.test(value)) {
    const local = /^(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(value);
    value = `${local ? "http" : "https"}://${value}`;
  }
  try {
    const url = new URL(value);
    if (ownHosts.has(url.hostname)) return DEFAULT_SERVER_URL;
    return `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return "";
  }
}

export async function loadSettings(): Promise<Settings> {
  const [stored, development] = await Promise.all([chrome.storage.local.get(["serverUrl", "token"]), isDevelopmentInstall()]);
  // Normalized again, so an address saved before the www rule still works.
  const saved = development && typeof stored.serverUrl === "string" ? normalizeServerUrl(stored.serverUrl) : "";
  return {
    serverUrl: saved || DEFAULT_SERVER_URL,
    token: typeof stored.token === "string" ? stored.token : "",
  };
}

export async function storeSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ serverUrl: normalizeServerUrl(settings.serverUrl), token: settings.token.trim() });
}
