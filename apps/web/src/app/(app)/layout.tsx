import Link from "next/link";
import { Suspense } from "react";
import { APP_NAME } from "@/config/app";
import { AppearanceMenu } from "@/components/appearance-menu";
import { NavigationMemory } from "@/components/back-link";
import { Logo } from "@/components/logo";
import { NavTabs } from "@/components/nav-tabs";
import { SearchForm } from "@/components/search-form";
import { isAdmin, requireUser } from "@/lib/auth";
import { getSavedAppearance } from "@/lib/saved-appearance";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const appearance = await getSavedAppearance();
  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar-row">
          <Link href="/inbox" className="brand">
            <Logo size={28} />
            {APP_NAME}
          </Link>
          <div className="search">
            <SearchForm />
          </div>
          <AppearanceMenu saved={appearance} />
        </div>
        <NavTabs admin={isAdmin(user)} />
      </header>
      <main>{children}</main>
      <Suspense fallback={null}>
        <NavigationMemory />
      </Suspense>
    </div>
  );
}
