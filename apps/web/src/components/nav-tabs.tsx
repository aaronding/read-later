"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/inbox", label: "inbox" },
  { href: "/triage", label: "triage" },
  { href: "/favorites", label: "favorites" },
  { href: "/archive", label: "archive" },
  { href: "/settings", label: "settings" },
] as const;

export function NavTabs() {
  const pathname = usePathname();
  const t = useTranslations("Library");
  const tCommon = useTranslations("Common");
  return (
    <nav className="tabs" aria-label={t("sectionsLabel")}>
      {TABS.map((tab) => (
        <Link key={tab.href} href={tab.href} aria-current={pathname.startsWith(tab.href) ? "page" : undefined}>
          {tCommon(tab.label)}
        </Link>
      ))}
    </nav>
  );
}
