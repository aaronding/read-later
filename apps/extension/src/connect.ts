// The Connect button's side of the web app's /extension/connect page
// (apps/web/src/lib/extension-connect.ts): the page to open in the browser's
// sign-in window, and the token in the address that window ends at.

/** The page that asks to approve this browser, ending at the browser's redirect address. */
export function connectPageUrl(serverUrl: string, redirectUri: string, state: string): string {
  return `${serverUrl}/extension/connect?${new URLSearchParams({ redirect_uri: redirectUri, state })}`;
}

/** The token sent back for this request (state), or null when it was declined or answers another one. */
export function tokenFromRedirect(responseUrl: string, state: string): string | null {
  let answer: URLSearchParams;
  try {
    answer = new URLSearchParams(new URL(responseUrl).hash.slice(1));
  } catch {
    return null;
  }
  const token = answer.get("token");
  return answer.get("state") === state && token?.startsWith("rl_") ? token : null;
}
