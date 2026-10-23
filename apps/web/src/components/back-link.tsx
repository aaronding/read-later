"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useLayoutEffect, useSyncExternalStore } from "react";
import { listOf, listUrl, type ArticleList } from "@/lib/article-lists";

// The last list of articles the tab showed, with its folder, tag, search and
// page, and how far down it was scrolled. Session storage keeps them for the
// tab, across reloads.
const LIST_KEY = "read-later:list";
const SCROLL_KEY = "read-later:list-scroll";

// The list BackLink is opening, and where to scroll it once it is shown.
let returning: { url: string; y: number } | null = null;

function read(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null; // Storage can be blocked: the link then opens the fallback list at its top.
  }
}

function write(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // Storage can be blocked: see read.
  }
}

/** How far down the tab left `url`, if it is the list last shown. */
function scrollOf(url: string): number | null {
  try {
    const saved = JSON.parse(read(SCROLL_KEY) ?? "null") as { url?: unknown; y?: unknown } | null;
    return saved?.url === url && typeof saved.y === "number" ? saved.y : null;
  } catch {
    return null;
  }
}

// Triage shows one article at a time, the next one when it is opened again,
// so it has no place to keep.
const keepsPlace = (url: string) => listOf(url) !== "triage";

/** Scrolls the list back to `y`, or as far as it now goes. */
function scrollBack(y: number): void {
  window.scrollTo(0, y);
  // The second click of a double-click on the link would land on the list.
  const ignore = (event: MouseEvent) => {
    if (event.detail > 1) {
      event.preventDefault();
      event.stopPropagation();
    }
  };
  window.addEventListener("click", ignore, true);
  setTimeout(() => window.removeEventListener("click", ignore, true), 1000);
}

/** Notes the lists the tab shows, and how far down. Rendered once, in the app's layout. */
export function NavigationMemory() {
  const pathname = usePathname();
  const query = useSearchParams().toString();
  // Before the list is painted, so it doesn't show at the article's place first.
  useLayoutEffect(() => {
    // Any other page shown first, such as a tab clicked while the list loaded, ends the return.
    const back = returning;
    returning = null;
    const url = listUrl(pathname, query);
    if (!url) return;
    write(LIST_KEY, url);
    if (back?.url === url) scrollBack(back.y);
    if (!keepsPlace(url)) return;
    // Where the list is shown is its place until it is scrolled, not where an earlier visit left it.
    write(SCROLL_KEY, JSON.stringify({ url, y: Math.round(window.scrollY) }));
    let frame = 0;
    const save = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        // Only while the list is still shown: leaving it scrolls the next page to its top.
        if (listUrl(window.location.pathname, window.location.search) !== url) return;
        write(SCROLL_KEY, JSON.stringify({ url, y: Math.round(window.scrollY) }));
      });
    };
    window.addEventListener("scroll", save, { passive: true });
    return () => {
      window.removeEventListener("scroll", save);
      cancelAnimationFrame(frame);
    };
  }, [pathname, query]);
  return null;
}

function storedList(): string | null {
  const stored = read(LIST_KEY);
  return stored && listOf(stored) ? stored : null;
}

// Nothing to listen to: the list only changes on another page.
const subscribe = () => () => {};

/**
 * Back to the last list the tab showed, else to `fallback`. It opens the list
 * afresh, so it shows what changed, then scrolls it back to where it was left.
 */
export function BackLink({ fallback }: { fallback: ArticleList }) {
  const router = useRouter();
  const t = useTranslations("Library");
  const tCommon = useTranslations("Common");
  // The server can't read the tab's storage, so a page loaded afresh starts with the fallback.
  const href = useSyncExternalStore(
    subscribe,
    () => storedList() ?? `/${fallback}`,
    () => `/${fallback}`,
  );
  const list = tCommon(listOf(href) ?? fallback);
  return (
    <Link
      className="back-link"
      href={href}
      aria-label={t("backTo", { list })}
      onClick={(event) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; // a new tab
        event.preventDefault();
        if (event.detail > 1) return; // the second click of a double-click
        // Where the list was left, else its top: Next's own scrolling only brings the page into view.
        returning = { url: href, y: scrollOf(href) ?? 0 };
        router.push(href, { scroll: false });
      }}
    >
      <span aria-hidden="true">←</span> {list}
    </Link>
  );
}
