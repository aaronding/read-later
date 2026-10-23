import { safeRedirectPath } from "./redirects";

// Where the reader goes back to. A list links to an article with its own
// address in `from`, search, folder, tag and page included, and the reader
// goes back there (see docs/decisions.md).

/** The lists an article can be opened from. */
export const READER_ORIGINS = ["inbox", "favorites", "archive", "triage"] as const;
export type ReaderOrigin = (typeof READER_ORIGINS)[number];

export interface ReaderBack {
  list: ReaderOrigin;
  /** The list's address, such as "/favorites?tag=css&page=1". */
  href: string;
}

/** The reader's address for an article opened from the list at `from`. */
export function articleHref(id: string, from: string): string {
  return `/articles/${id}?${new URLSearchParams({ from })}`;
}

/** The list a `from` value names, or null when it names none of them. */
export function originList(from: unknown): ReaderBack | null {
  const href = safeRedirectPath(from, "").replace(/#.*/s, "");
  const list = READER_ORIGINS.find((name) => href === `/${name}` || href.startsWith(`/${name}?`));
  return list ? { list, href } : null;
}

/** Where the reader goes back to: the list it was opened from, else the list the article is in. */
export function readerBack(from: unknown, archived: boolean): ReaderBack {
  return originList(from) ?? (archived ? { list: "archive", href: "/archive" } : { list: "inbox", href: "/inbox" });
}
