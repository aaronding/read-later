const PLACEHOLDER_ORIGIN = "http://same-site.invalid";

/**
 * A path on this site to redirect to after an action, or the fallback.
 * Browsers read "//evil.com", "/\evil.com" and paths with tabs as other
 * sites, so the value is resolved and must stay on the same origin.
 */
export function safeRedirectPath(value: unknown, fallback = "/inbox"): string {
  if (typeof value !== "string" || !value.startsWith("/")) return fallback;
  if (/[\\\u0000-\u001f\u007f]/.test(value)) return fallback;
  let url: URL;
  try {
    url = new URL(value, PLACEHOLDER_ORIGIN);
  } catch {
    return fallback;
  }
  if (url.origin !== PLACEHOLDER_ORIGIN) return fallback;
  return `${url.pathname}${url.search}${url.hash}`;
}
