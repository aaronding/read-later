import { extractFirstUrl, parseHttpUrl } from "@/lib/urls";

/** The link in an Android share: the url field, or the first link in text or title. */
export function sharedUrl(params: URLSearchParams): string | null {
  return (
    parseHttpUrl(params.get("url") ?? "")?.href ?? extractFirstUrl(params.get("text")) ?? extractFirstUrl(params.get("title"))
  );
}

/**
 * True when another website sent the browser here. Shares from Android's
 * Share menu are browser-initiated (Sec-Fetch-Site: none); a link on some
 * other site is not, and must not save (and spend Claude credits) without a tap.
 */
export function shareNeedsConfirmation(headers: Headers): boolean {
  const site = headers.get("sec-fetch-site");
  return site === "cross-site" || site === "same-site";
}
