export interface Settings {
  serverUrl: string;
  token: string;
}

/** "read.example.com/" becomes "https://read.example.com"; "localhost:3000" becomes "http://localhost:3000". */
export function normalizeServerUrl(input: string): string {
  let value = input.trim().replace(/\/+$/, "");
  if (!value) return "";
  if (!/^https?:\/\//i.test(value)) {
    const local = /^(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(value);
    value = `${local ? "http" : "https"}://${value}`;
  }
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return "";
  }
}

export async function loadSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get(["serverUrl", "token"]);
  return {
    serverUrl: typeof stored.serverUrl === "string" ? stored.serverUrl : "",
    token: typeof stored.token === "string" ? stored.token : "",
  };
}

export async function storeSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ serverUrl: normalizeServerUrl(settings.serverUrl), token: settings.token.trim() });
}
