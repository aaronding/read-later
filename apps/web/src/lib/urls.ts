// URL rules for saving: what we accept, how duplicates are detected, and when
// a page's rel=canonical is trusted.

const TRACKING_PARAMS = new Set(["fbclid", "gclid"]);

function isTrackingParam(rawKey: string): boolean {
  let key: string;
  try {
    key = decodeURIComponent(rawKey.replace(/\+/g, " "));
  } catch {
    key = rawKey;
  }
  key = key.toLowerCase();
  return key.startsWith("utm_") || TRACKING_PARAMS.has(key);
}

/** Parses an absolute http(s) URL. Returns null for anything else. */
export function parseHttpUrl(input: string): URL | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (!url.hostname) return null;
  return url;
}

/**
 * The form used to catch duplicates: no fragment, and no utm_*, fbclid or
 * gclid parameters. Other parameters are kept exactly as written (order and
 * encoding), because they can change which page is served.
 */
export function normalizeUrl(input: string | URL): string {
  const url = new URL(typeof input === "string" ? input.trim() : input.href);
  url.hash = "";
  const query = url.search.startsWith("?") ? url.search.slice(1) : url.search;
  if (query) {
    const kept = query
      .split("&")
      .filter((part) => part !== "" && !isTrackingParam(part.split("=")[0] ?? ""));
    url.search = kept.length ? `?${kept.join("&")}` : "";
  }
  return url.toString();
}

function siteKey(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, "");
}

/** Same host, treating "www." and the bare domain as the same site. */
export function isSameSite(a: URL, b: URL): boolean {
  return siteKey(a.hostname) === siteKey(b.hostname);
}

function isHomepage(url: URL): boolean {
  return (url.pathname === "/" || url.pathname === "") && url.search === "";
}

/**
 * The normalized canonical URL, if the page declares one we can trust: it must
 * be http(s), on the same site as the page, and not the site's homepage (some
 * sites point every page's canonical at "/").
 */
export function trustedCanonicalUrl(pageUrl: string, canonicalHref: string | null | undefined): string | null {
  if (!canonicalHref) return null;
  let page: URL;
  let canonical: URL;
  try {
    page = new URL(pageUrl);
    canonical = new URL(canonicalHref.trim(), page);
  } catch {
    return null;
  }
  if (canonical.protocol !== "http:" && canonical.protocol !== "https:") return null;
  if (!isSameSite(page, canonical)) return null;
  const normalized = new URL(normalizeUrl(canonical));
  if (isHomepage(normalized)) return null;
  return normalized.toString();
}

/** Finds a <link rel="canonical"> href in raw HTML without building a DOM. */
export function findCanonicalHref(html: string): string | null {
  const head = html.slice(0, 200_000);
  for (const match of head.matchAll(/<link\b[^>]*>/gi)) {
    const tag = match[0];
    const rel = /\brel\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag);
    const relValue = (rel?.[1] ?? rel?.[2] ?? rel?.[3] ?? "").toLowerCase();
    if (!relValue.split(/\s+/).includes("canonical")) continue;
    const href = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag);
    const value = href?.[1] ?? href?.[2] ?? href?.[3];
    if (value) return decodeHtmlEntities(value);
  }
  return null;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/**
 * Pulls the first http(s) URL out of shared text. Android apps often put the
 * link in the "text" field, sometimes after a headline.
 */
export function extractFirstUrl(text: string | null | undefined): string | null {
  if (!text) return null;
  for (const match of text.matchAll(/https?:\/\/[^\s<>"'`]+/gi)) {
    // Drop punctuation that usually ends a sentence rather than the URL.
    const candidate = match[0].replace(/[),.;:!?\]}>»”’。，！？）】]+$/u, "");
    if (parseHttpUrl(candidate)) return candidate;
  }
  return null;
}

/**
 * Accepts what people paste: a full URL, or a bare "example.com/path", which
 * is read as https.
 */
export function parsePastedUrl(input: string): URL | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (trimmed.includes("://")) return parseHttpUrl(trimmed);
  const withScheme = parseHttpUrl(`https://${trimmed}`);
  return withScheme && withScheme.hostname.includes(".") ? withScheme : null;
}
