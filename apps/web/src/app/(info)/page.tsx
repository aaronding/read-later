import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { SignInButton } from "@/components/sign-in-button";
import { APP_NAME, FIREFOX_ADDON_URL } from "@/config/app";
import { getCurrentUser } from "@/lib/auth";
import { browserAndSystem } from "@/lib/user-agent";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Home");
  return { title: { absolute: APP_NAME }, description: t("description"), alternates: { canonical: "/" } };
}

const STEPS = ["save", "gist", "read"] as const;
const WAYS = [
  { key: "firefox", help: "/help/firefox" },
  { key: "android", help: "/help/android" },
  { key: "safari", help: "/help/safari" },
  { key: "paste", help: null },
] as const;
const products = {
  app: APP_NAME,
  firefox: "Firefox",
  safari: "Safari",
  iphone: "iPhone",
  ipad: "iPad",
  mac: "Mac",
  android: "Android",
};

// The homepage, for visitors who aren't signed in; signed in, the Inbox.
export default async function HomePage() {
  if (await getCurrentUser()) redirect("/inbox");
  const [t, locale, requestHeaders] = await Promise.all([getTranslations("Home"), getLocale(), headers()]);
  // The keyboard shortcut as the visitor's keyboard names it: Option on a Mac, Alt elsewhere.
  const system = browserAndSystem(requestHeaders.get("user-agent")).system === "macOS" ? "mac" : "other";
  return (
    <div className="home">
      <section className="hero">
        <div>
          <h1>{t("headline")}</h1>
          <p className="hero-lead">{t("lead")}</p>
          <SignInButton next="/inbox" />
          <p className="hero-note muted small">{t("pocket")}</p>
        </div>
        {/* The real app, in the visitor's language and theme: the Inbox on a
            computer, and an article on a phone (scripts/home-images.ts). */}
        <div className="hero-shots">
          {(["light", "dark"] as const).map((scheme) => (
            <div key={scheme} className={`theme-${scheme}-only`}>
              <img
                className="hero-shot-desktop"
                src={`/home/inbox-${locale}-${scheme}.webp`}
                alt={t("shots.inbox")}
                width={1920}
                height={1280}
                fetchPriority="high"
              />
              <img
                className="hero-shot-phone"
                src={`/home/reader-${locale}-${scheme}.webp`}
                alt={t("shots.reader")}
                width={750}
                height={1520}
              />
            </div>
          ))}
        </div>
      </section>

      <section className="band" aria-labelledby="how-heading">
        <h2 id="how-heading">{t("how.heading")}</h2>
        <ol className="tiles tiles-3">
          {STEPS.map((step, index) => (
            <li key={step} className="card tile">
              <span className="tile-number">{index + 1}</span>
              <h3>{t(`how.${step}.title`)}</h3>
              <p>{t(`how.${step}.text`)}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="band" aria-labelledby="ways-heading">
        <h2 id="ways-heading">{t("ways.heading")}</h2>
        <ul className="tiles tiles-4">
          {WAYS.map(({ key, help }) => (
            <li key={key} className="card tile">
              <h3>{t(`ways.${key}.title`, products)}</h3>
              <p>{t(`ways.${key}.text`, { ...products, system })}</p>
              {/* The add-on's tile also links to Mozilla's store, where it is installed. */}
              {key === "firefox" ? (
                <span className="tile-links">
                  <Link href={help}>{t("ways.setUp")}</Link>
                  <a href={FIREFOX_ADDON_URL} target="_blank" rel="noopener">
                    {t("ways.addToFirefox", products)}
                  </a>
                </span>
              ) : (
                help && <Link href={help}>{t("ways.setUp")}</Link>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
