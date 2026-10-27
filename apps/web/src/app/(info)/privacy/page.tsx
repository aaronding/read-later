import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { APP_NAME } from "@/config/app";
import { BACKUP_RETENTION_DAYS, CHROME_USER_DATA_POLICY_URL, PRIVACY_EFFECTIVE_DATE } from "@/config/privacy";
import { LOCALE_COOKIE } from "@/i18n/locales";
import { SESSION_DAYS } from "@/lib/auth";
import { FINISHED_JOB_DAYS } from "@/lib/jobs/queue";
import { SUMMARY_TAG_LIMIT } from "@/lib/summarize/prompt";
import { THEME_COOKIE } from "@/lib/visitor-preferences";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Privacy");
  return { title: t("title"), alternates: { canonical: "/privacy" } };
}

const KEPT = ["account", "sessions", "saved", "library", "tokens", "usage", "feedback"] as const;
const EXTENSION = ["reads", "sends", "keeps"] as const;
const COOKIES = [
  { name: "better-auth.session_token", key: "session" },
  { name: "better-auth.state", key: "state" },
  { name: LOCALE_COOKIE, key: "locale" },
  { name: THEME_COOKIE, key: "theme" },
] as const;

const strong = (chunks: React.ReactNode) => <strong>{chunks}</strong>;

// The privacy policy, readable signed out: Google's consent screen links to
// it. Every claim in it follows from the code (decision 128), and the numbers
// come from the constants the code itself uses.
export default async function PrivacyPage() {
  const t = await getTranslations("Privacy");
  const app = { app: APP_NAME };
  const contact = (chunks: React.ReactNode) => <Link href="/about#contact">{chunks}</Link>;
  return (
    <article className="info">
      <h1>{t("title")}</h1>
      <p className="muted small">{t("effective", { date: PRIVACY_EFFECTIVE_DATE })}</p>

      <section className="glance" aria-labelledby="glance-heading">
        <h2 id="glance-heading">{t("glance.heading")}</h2>
        <ul>
          <li>{t("glance.kept", app)}</li>
          <li>{t.rich("glance.ai", { ...app, strong, tags: SUMMARY_TAG_LIMIT })}</li>
          <li>{t("glance.tracking")}</li>
          <li>{t.rich("glance.choices", { link: contact })}</li>
        </ul>
      </section>

      <h2>{t("kept.heading", app)}</h2>
      <ul>
        {KEPT.map((key) => (
          <li key={key}>{t.rich(`kept.${key}`, { ...app, strong })}</li>
        ))}
      </ul>

      {/* What the browser extension does on its own, as the extension stores ask the policy to say. */}
      <h2>{t("extension.heading")}</h2>
      <ul>
        {EXTENSION.map((key) => (
          <li key={key}>{t.rich(`extension.${key}`, { ...app, strong })}</li>
        ))}
        <li>{t.rich("extension.limitedUse", { ...app, link: (chunks) => <a href={CHROME_USER_DATA_POLICY_URL}>{chunks}</a> })}</li>
      </ul>

      <h2>{t("cookies.heading")}</h2>
      <p>{t("cookies.intro")}</p>
      <div className="table-scroll">
        <table className="plain-table">
          <tbody>
            {COOKIES.map(({ name, key }) => (
              <tr key={key}>
                <td>
                  <code>{name}</code>
                </td>
                <td>{t(`cookies.${key}.purpose`)}</td>
                <td>{t(`cookies.${key}.duration`, { days: SESSION_DAYS })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>{t("retention.heading")}</h2>
      <ul>
        <li>{t("retention.library")}</li>
        <li>{t("retention.usage")}</li>
        <li>{t("retention.submitted")}</li>
        <li>{t("retention.short", { jobs: FINISHED_JOB_DAYS, backups: BACKUP_RETENTION_DAYS })}</li>
      </ul>

      <h2>{t("choices.heading")}</h2>
      <ul>
        <li>{t.rich("choices.export", { strong, link: (chunks) => <Link href="/settings#export-heading">{chunks}</Link> })}</li>
        <li>{t.rich("choices.delete", { strong, link: contact, days: BACKUP_RETENTION_DAYS })}</li>
      </ul>

      <h2>{t("changes.heading")}</h2>
      <p>{t("changes.text")}</p>
    </article>
  );
}
