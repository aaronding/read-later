import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { APP_NAME } from "@/config/app";
import { appUrl } from "@/config/env";
import { getCurrentUser } from "@/lib/auth";
import { HELP_TOPICS, helpHref, type HelpTopic } from "@/lib/help";
import { AndroidGuide, FirefoxGuide, ShortcutGuide } from "./connect-guides";

const products = {
  app: APP_NAME,
  chrome: "Chrome",
  firefox: "Firefox",
  safari: "Safari",
  iphone: "iPhone",
  ipad: "iPad",
  mac: "Mac",
  android: "Android",
};
const strong = (chunks: React.ReactNode) => <strong>{chunks}</strong>;

/** A Help page: the menu of topics, then the topic, then links to the previous and next one. */
export async function HelpPage({ topic }: { topic: HelpTopic }) {
  const [t, user] = await Promise.all([getTranslations("Help"), getCurrentUser()]);
  const index = HELP_TOPICS.indexOf(topic);
  const previous = HELP_TOPICS[index - 1];
  const next = HELP_TOPICS[index + 1];
  const link = (topic: HelpTopic) => (chunks: React.ReactNode) => <Link href={helpHref(topic)}>{chunks}</Link>;
  const tokens = (chunks: React.ReactNode) => <Link href="/settings#tokens-heading">{chunks}</Link>;
  const serverUrl = appUrl();

  return (
    <div className="help">
      <nav className="help-menu" aria-label={t("menuLabel")}>
        {HELP_TOPICS.map((item) => (
          <Link key={item} href={helpHref(item)} aria-current={item === topic ? "page" : undefined}>
            {t(`${item}.title`, products)}
          </Link>
        ))}
      </nav>
      <article className="info">
        <h1>{t(`${topic}.title`, products)}</h1>
        {/* The Shortcut guide opens with its own introduction. */}
        {topic !== "safari" && <p className="lede">{t(`${topic}.intro`, products)}</p>}

        {topic === "start" && (
          <ol className="help-steps">
            <li>{t.rich("start.token", { ...products, strong, link: tokens })}</li>
            <li>
              {t.rich("start.save", { strong })}
              <ul>
                <li>{t.rich("start.firefox", { ...products, link: link("firefox") })}</li>
                <li>{t.rich("start.safari", { ...products, link: link("safari") })}</li>
                <li>{t.rich("start.android", { ...products, link: link("android") })}</li>
                <li>{t("start.paste")}</li>
              </ul>
            </li>
            <li>{t.rich("start.read", { strong, link: link("using") })}</li>
          </ol>
        )}

        {/* The add-on's Connect button signs in by itself; the Shortcut needs a token from Settings. */}
        {topic === "safari" && !user && (
          <p className="notice small">{t.rich("signInFirst", { link: (chunks) => <Link href={`/sign-in?next=${helpHref(topic)}`}>{chunks}</Link> })}</p>
        )}
        {topic === "firefox" && <FirefoxGuide />}
        {topic === "safari" && <ShortcutGuide saveUrl={`${serverUrl}/api/save`} />}
        {topic === "android" && <AndroidGuide />}

        {topic === "using" &&
          (["summaries", "preview", "organize", "data"] as const).map((section) => (
            <section key={section}>
              <h2>{t(`using.${section}.heading`)}</h2>
              <p>{t.rich(`using.${section}.text`, { ...products, strong })}</p>
            </section>
          ))}

        <nav className="help-pager" aria-label={t("pagerLabel")}>
          {previous ? <Link href={helpHref(previous)}>← {t(`${previous}.title`, products)}</Link> : <span />}
          {next && <Link href={helpHref(next)}>{t(`${next}.title`, products)} →</Link>}
        </nav>
      </article>
    </div>
  );
}
