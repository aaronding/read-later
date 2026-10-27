import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { browserAndSystem } from "./user-agent";

// The extension's Connect button opens /extension/connect through the
// browser's identity.launchWebAuthFlow(), with the address the flow ends at
// (redirect_uri) and a random state. Approving creates an access token and
// sends the window there, with the token in the fragment. The browser stops
// that request and hands the address to the extension that opened the window,
// so the token reaches no website.

// Where the flow ends: Chrome, Edge and Brave at https://<extension ID>.chromiumapp.org/,
// Firefox at https://<SHA-1 of the add-on ID>.extensions.allizom.org/. Nothing else is
// accepted, so a link from another website can't send a token anywhere it can read.
const REDIRECT_HOSTS = [/^[a-p]{32}\.chromiumapp\.org$/, /^[0-9a-f]{40}\.extensions\.allizom\.org$/];

export interface ConnectRequest {
  redirectUri: string;
  state: string;
}

/** The extension's request, or null when the address isn't one of the browsers' redirect addresses. */
export function parseConnectRequest(redirectUri: unknown, state: unknown): ConnectRequest | null {
  if (typeof redirectUri !== "string" || typeof state !== "string") return null;
  if (!/^[\w-]{16,128}$/.test(state)) return null;
  let url: URL;
  try {
    url = new URL(redirectUri);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.port || url.username || url.password || url.search || url.hash) return null;
  if (!REDIRECT_HOSTS.some((host) => host.test(url.hostname))) return null;
  return { redirectUri: url.href, state };
}

/** Where to send the window: the extension's address with the token, or with the refusal. */
export function connectRedirect(request: ConnectRequest, answer: { token: string } | { error: "access_denied" }): string {
  return `${request.redirectUri}#${new URLSearchParams({ ...answer, state: request.state })}`;
}

/** The new token's name, after the browser asking for it: "Firefox extension on macOS". */
export async function extensionTokenName(): Promise<string> {
  const [t, requestHeaders] = await Promise.all([getTranslations("Connect"), headers()]);
  const { browser, system } = browserAndSystem(requestHeaders.get("user-agent"));
  return browser && system ? t("tokenName", { browser, system }) : t("tokenNameUnknown");
}
