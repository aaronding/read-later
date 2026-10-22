import type { Settings } from "./settings.js";

export interface SavePayload {
  url: string;
  title?: string;
  html?: string;
}

export interface Outcome {
  ok: boolean;
  message: string;
}

type Fetch = typeof fetch;

const NOT_CONFIGURED: Outcome = {
  ok: false,
  message: "Open the extension’s options and enter the server URL and an access token.",
};

async function errorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    if (body.error) return body.error;
  } catch {
    // not JSON
  }
  return `The server answered ${response.status} ${response.statusText}`.trim();
}

async function post(settings: Settings, payload: SavePayload, fetchImpl: Fetch): Promise<Response> {
  return fetchImpl(`${settings.serverUrl}/api/save`, {
    method: "POST",
    headers: { Authorization: `Bearer ${settings.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, source: "extension" }),
  });
}

/** Sends a save. If the page is too large, saves the link alone instead. */
export async function sendSave(settings: Settings, payload: SavePayload, fetchImpl: Fetch = fetch): Promise<Outcome> {
  if (!settings.serverUrl || !settings.token) return NOT_CONFIGURED;
  try {
    let response = await post(settings, payload, fetchImpl);
    let linkOnly = false;
    if (response.status === 413 && payload.html) {
      response = await post(settings, { url: payload.url, title: payload.title }, fetchImpl);
      linkOnly = true;
    }
    if (!response.ok) return { ok: false, message: await errorMessage(response) };
    const body = (await response.json()) as { message?: string };
    const message = body.message ?? "Saved";
    return { ok: true, message: linkOnly ? `${message} (link only: the page was too large to send)` : message };
  } catch (error) {
    return { ok: false, message: `Couldn’t reach ${settings.serverUrl}: ${(error as Error).message}` };
  }
}

/** Checks the server URL and token from the options page. */
export async function checkConnection(settings: Settings, fetchImpl: Fetch = fetch): Promise<Outcome> {
  if (!settings.serverUrl || !settings.token) return NOT_CONFIGURED;
  try {
    const response = await fetchImpl(`${settings.serverUrl}/api/save`, {
      headers: { Authorization: `Bearer ${settings.token}` },
    });
    if (!response.ok) return { ok: false, message: await errorMessage(response) };
    const body = (await response.json()) as { message?: string };
    return { ok: true, message: body.message ?? "Connected" };
  } catch (error) {
    return { ok: false, message: `Couldn’t reach ${settings.serverUrl}: ${(error as Error).message}` };
  }
}
