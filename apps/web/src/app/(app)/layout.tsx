import Image from "next/image";
import Link from "next/link";
import { APP_NAME } from "@/config/app";
import { AppearanceMenu } from "@/components/appearance-menu";
import { NavTabs } from "@/components/nav-tabs";
import { SearchForm } from "@/components/search-form";
import { requireUser } from "@/lib/auth";
import { getSavedAppearance } from "@/lib/saved-appearance";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  const appearance = await getSavedAppearance();
  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar-row">
          <Link href="/inbox" className="brand">
            <Image src="/icons/icon-192.png" alt="" width={28} height={28} priority />
            {APP_NAME}
          </Link>
          <div className="search">
            <SearchForm />
          </div>
          <AppearanceMenu saved={appearance} />
        </div>
        <NavTabs />
      </header>
      <main>{children}</main>
    </div>
  );
}
