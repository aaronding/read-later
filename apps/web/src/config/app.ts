import { APP_NAME, APP_SHORT_NAME } from "@read-later/brand";
import { appUrl } from "./env";

export { APP_NAME, APP_SHORT_NAME };

export const APP_VERSION = "0.1.0";

// Shown on About to visitors who aren't signed in, who have no form to use.
export const CONTACT_EMAIL = "contact@readsooner.com";

/**
 * The User-Agent for server-side downloads. It names the app honestly; we
 * never pretend to be a browser or a search engine crawler.
 */
export function downloadUserAgent(): string {
  const product = APP_NAME.replace(/[^A-Za-z0-9]+/g, "") || "ReadSooner";
  return `${product}/${APP_VERSION} (+${appUrl()}; personal read-later app fetching a page its user saved)`;
}
