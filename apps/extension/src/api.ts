import type { Settings } from "./settings.js";

export interface SavePayload {
  url: string;
  title?: string;
  html?: string;
}

/**
 * How a save or a connection check went, for outcomeText (i18n.ts) to put into
 * the browser's language. `detail` is text to show as it is when the extension
 * has no words of its own: the server's message for an outcome or error code
 * it doesn't know, or the browser's network error.
 */
export type Outcome =
  | { ok: true; kind: "saved" | "alreadySaved" | "refetching"; linkOnly: boolean; detail?: string }
  | { ok: true; kind: "connected" }
  | { ok: false; kind: "notConfigured" }
  | { ok: false; kind: "unreachable"; server: string; detail: string }
  | { ok: false; kind: "notTheApp"; server: string }
  | { ok: false; kind: "server"; code?: string; detail?: string; status: string };

type Fetch = typeof fetch;

const NOT_CONFIGURED: Outcome = { ok: false, kind: "notConfigured" };

const textOf = (value: unknown) => (typeof value === "string" && value ? value : undefined);

async function failure(response: Response): Promise<Outcome> {
  let body: { code?: unknown; error?: unknown } = {};
  try {
    const parsed: unknown = await response.json();
    if (parsed && typeof parsed === "object") body = parsed;
  } catch {
    // not JSON
  }
  const status = `${response.status} ${response.statusText}`.trim();
  return { ok: false, kind: "server", code: textOf(body.code), detail: textOf(body.error), status };
}

/** The reply's JSON body, or null when something other than the app answered at that address. */
async function jsonBody(response: Response): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await response.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function unreachable(settings: Settings, error: unknown): Outcome {
  return { ok: false, kind: "unreachable", server: settings.serverUrl, detail: (error as Error).message };
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
    if (!response.ok) return await failure(response);
    const body = await jsonBody(response);
    if (!body) return { ok: false, kind: "notTheApp", server: settings.serverUrl };
    if (body.outcome === "created" || body.outcome === "replaced") return { ok: true, kind: "saved", linkOnly };
    // A preview, failed or empty copy saved again is downloaded again (queued).
    if (body.outcome === "resaved") return { ok: true, kind: body.queued === true ? "refetching" : "alreadySaved", linkOnly };
    return { ok: true, kind: "saved", linkOnly, detail: textOf(body.message) };
  } catch (error) {
    return unreachable(settings, error);
  }
}

/** Checks the server URL and token from the options page. */
export async function checkConnection(settings: Settings, fetchImpl: Fetch = fetch): Promise<Outcome> {
  if (!settings.serverUrl || !settings.token) return NOT_CONFIGURED;
  try {
    const response = await fetchImpl(`${settings.serverUrl}/api/save`, {
      headers: { Authorization: `Bearer ${settings.token}` },
    });
    if (!response.ok) return await failure(response);
    if (!(await jsonBody(response))) return { ok: false, kind: "notTheApp", server: settings.serverUrl };
    return { ok: true, kind: "connected" };
  } catch (error) {
    return unreachable(settings, error);
  }
}
