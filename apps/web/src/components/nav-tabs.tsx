"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/inbox", label: "Inbox" },
  { href: "/triage", label: "Triage" },
  { href: "/favorites", label: "Favorites" },
  { href: "/archive", label: "Archive" },
  { href: "/settings", label: "Settings" },
];

export function NavTabs() {
  const pathname = usePathname();
  return (
    <nav className="tabs" aria-label="Sections">
      {TABS.map((tab) => (
        <Link key={tab.href} href={tab.href} aria-current={pathname.startsWith(tab.href) ? "page" : undefined}>
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
