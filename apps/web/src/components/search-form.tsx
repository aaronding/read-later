"use client";

import { usePathname } from "next/navigation";
import type { LibraryView } from "@/lib/library";

const VIEWS: LibraryView[] = ["inbox", "favorites", "archive"];

/** Searches the list being viewed; from other pages it searches the Inbox. */
export function SearchForm({ query = "", id = "search" }: { query?: string; id?: string }) {
  const pathname = usePathname();
  const view = VIEWS.find((name) => pathname.startsWith(`/${name}`)) ?? "inbox";
  return (
    <form action={`/${view}`} method="get" role="search">
      <label htmlFor={id} className="visually-hidden">
        Search {view}
      </label>
      <input id={id} name="q" type="search" placeholder={`Search ${view}`} defaultValue={query} />
    </form>
  );
}
