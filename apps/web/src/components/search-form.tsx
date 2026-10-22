"use client";

import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import type { LibraryView } from "@/lib/library";

const VIEWS: LibraryView[] = ["inbox", "favorites", "archive"];

/** Searches the list being viewed; from other pages it searches the Inbox. */
export function SearchForm({ query = "", id = "search" }: { query?: string; id?: string }) {
  const pathname = usePathname();
  const t = useTranslations("Library");
  const view = VIEWS.find((name) => pathname.startsWith(`/${name}`)) ?? "inbox";
  const label = t("searchView", { view });
  return (
    <form action={`/${view}`} method="get" role="search">
      <label htmlFor={id} className="visually-hidden">
        {label}
      </label>
      {/* The placeholder may be shorter than the label, to fit the box. */}
      <input id={id} name="q" type="search" placeholder={t("searchPlaceholder", { view })} defaultValue={query} />
    </form>
  );
}
