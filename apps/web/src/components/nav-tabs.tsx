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

/** Only admins (ADMIN_EMAILS) see the AI usage report. */
const ADMIN_TABS = [{ href: "/admin/usage", label: "usage" }] as const;

export function NavTabs({ admin = false }: { admin?: boolean }) {
  const pathname = usePathname();
  const t = useTranslations("Library");
  const tCommon = useTranslations("Common");
  return (
    <nav className="tabs" aria-label={t("sectionsLabel")}>
      {[...TABS, ...(admin ? ADMIN_TABS : [])].map((tab) => (
        <Link key={tab.href} href={tab.href} aria-current={pathname.startsWith(tab.href) ? "page" : undefined}>
          {tCommon(tab.label)}
        </Link>
      ))}
    </nav>
  );
}
