import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { APP_NAME } from "@/config/app";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/locales";
import { isAdmin, type SessionUser } from "@/lib/auth";
import { getSavedAppearance } from "@/lib/saved-appearance";
import { AppearanceMenu } from "./appearance-menu";
import { Logo } from "./logo";
import { NavTabs } from "./nav-tabs";
import { SearchForm } from "./search-form";
import { VisitorPreferences } from "./visitor-preferences";

/** When the copyright line starts. */
const SINCE = 2026;

/** The end of every page: the copyright and the links to Help, About and Privacy. */
export async function SiteFooter() {
  const t = await getTranslations("Common");
  return (
    <footer className="site-footer small">
      <span>© {SINCE} {APP_NAME}</span>
      <nav aria-label={t("footerLabel")}>
        <Link href="/help">{t("help")}</Link>
        <Link href="/about">{t("about")}</Link>
        <Link href="/privacy">{t("privacy")}</Link>
      </nav>
    </footer>
  );
}

/** The signed-in app's header, tabs and footer around a page. */
export async function AppShell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
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
      <SiteFooter />
    </div>
  );
}

/**
 * The site's frame for visitors who aren't signed in: the name, then the
 * language and theme, which Settings and the Aa menu choose once signed in.
 * The pages themselves offer sign-in.
 */
export async function PublicShell({ children }: { children: React.ReactNode }) {
  const [locale, appearance] = await Promise.all([getLocale(), getSavedAppearance()]);
  return (
    <div className="shell">
      <header className="site-header">
        <Link href="/" className="brand" aria-label={APP_NAME}>
          <Logo size={28} />
          <span className="brand-name">{APP_NAME}</span>
        </Link>
        <VisitorPreferences locale={isLocale(locale) ? locale : DEFAULT_LOCALE} theme={appearance.theme} />
      </header>
      <main>{children}</main>
      <SiteFooter />
    </div>
  );
}
