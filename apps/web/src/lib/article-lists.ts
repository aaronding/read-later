/** The pages that list articles, which an article is opened from. */
export const ARTICLE_LISTS = ["inbox", "favorites", "archive", "triage"] as const;

export type ArticleList = (typeof ARTICLE_LISTS)[number];

/** Which list an address in the app shows, with any query, or null for another page. */
export function listOf(url: string): ArticleList | null {
  const path = url.split(/[?#]/)[0]!.replace(/^\/+|\/+$/g, "");
  return (ARTICLE_LISTS as readonly string[]).includes(path) ? (path as ArticleList) : null;
}

// What chooses the articles a list shows. Anything else, such as a one-off
// notice (?saved=), isn't kept with the list.
const LIST_PARAMS = ["q", "folder", "tag", "page"];

/** A list's address with only its folder, tag, search and page, or null for another page. */
export function listUrl(pathname: string, search: string): string | null {
  if (!listOf(pathname)) return null;
  const params = new URLSearchParams(search);
  const kept = new URLSearchParams();
  for (const key of LIST_PARAMS) {
    const value = params.get(key);
    if (value) kept.set(key, value);
  }
  const query = kept.toString();
  return query ? `${pathname}?${query}` : pathname;
}
