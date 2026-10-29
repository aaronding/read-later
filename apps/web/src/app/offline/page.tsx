import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { Logo } from "@/components/logo";
import { OfflineLibrary } from "@/components/offline-library";
import { APP_NAME } from "@/config/app";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Offline");
  return { title: t("pageTitle"), robots: { index: false } };
}

/**
 * The page the service worker keeps, and shows when a page can't load
 * (decisions 151 and 152). Everything on it comes from the browser, so it
 * asks the server for nothing, not even who is signed in, and its links are
 * plain ones that the service worker answers offline.
 */
export default function OfflinePage() {
  return (
    <div className="shell">
      <header className="site-header">
        <a href="/inbox" className="brand" aria-label={APP_NAME}>
          <Logo size={28} />
          <span className="brand-name">{APP_NAME}</span>
        </a>
      </header>
      <main>
        <Suspense>
          <OfflineLibrary />
        </Suspense>
      </main>
    </div>
  );
}
