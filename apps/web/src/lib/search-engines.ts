import { HELP_TOPICS, helpHref } from "@/lib/help";

// What robots.txt and the sitemap tell search engines (decision 146).

/** The pages anyone can read, listed in the sitemap. */
export const PUBLIC_PAGES = ["/", "/about", "/privacy", ...HELP_TOPICS.map(helpHref)];

/**
 * Where crawlers aren't let in: the signed-in pages, which only send them to
 * sign-in, the API, Android's Share target, the extension's Connect page and
 * the offline page, which shows only what the browser keeps.
 * The sign-in page isn't listed: it says noindex itself, which a crawler reads
 * only if it may fetch the page.
 */
export const DISALLOWED_PATHS = [
  "/api/",
  "/inbox",
  "/triage",
  "/favorites",
  "/archive",
  "/articles/",
  "/settings",
  "/admin/",
  "/share",
  "/extension/",
  "/offline",
];
