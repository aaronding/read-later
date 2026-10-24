"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { originList } from "@/lib/reader-origin";
import { BackLink } from "./reader-navigation";

const TABS = [
  { href: "/inbox", label: "inbox" },
  { href: "/triage", label: "triage" },
  { href: "/favorites", label: "favorites" },
  { href: "/archive", label: "archive" },
  { href: "/settings", label: "settings" },
] as const;

/** Only admins (ADMIN_EMAILS) see the AI usage report and the feedback. */
const ADMIN_TABS = [
  { href: "/admin/usage", label: "usage" },
  { href: "/admin/feedback", label: "feedback" },
] as const;

export function NavTabs({ admin = false }: { admin?: boolean }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const t = useTranslations("Library");
  const tCommon = useTranslations("Common");
  // In the reader, the list it was opened from stays marked, and its tab goes back to it as it was left.
  const origin = pathname.startsWith("/articles/") ? originList(searchParams.get("from")) : null;
  return (
    <nav className="tabs" aria-label={t("sectionsLabel")}>
      {[...TABS, ...(admin ? ADMIN_TABS : [])].map((tab) =>
        tab.label === origin?.list ? (
          <BackLink key={tab.href} href={origin.href} data-origin="">
            {tCommon(tab.label)}
          </BackLink>
        ) : (
          <Link key={tab.href} href={tab.href} aria-current={pathname.startsWith(tab.href) ? "page" : undefined}>
            {tCommon(tab.label)}
          </Link>
        ),
      )}
    </nav>
  );
}
