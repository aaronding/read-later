import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { FeedbackForm } from "@/components/feedback-form";
import { APP_NAME, CONTACT_EMAIL } from "@/config/app";
import { getCurrentUser } from "@/lib/auth";
import { deploymentFor } from "@/lib/deployment";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("About");
  return { title: { absolute: t("title", { app: APP_NAME }) }, alternates: { canonical: "/about" } };
}

const products = { app: APP_NAME };

// Readable signed out too. Admins also see which version is deployed.
export default async function AboutPage() {
  const user = await getCurrentUser();
  const deployment = deploymentFor(user?.email);
  const [t, format] = await Promise.all([getTranslations("About"), getFormatter()]);
  return (
    <article className="info">
      <h1>{t("title", products)}</h1>
      <p className="lede">{t("intro", products)}</p>

      <h2 id="contact">{t("feedback.heading")}</h2>
      {user ? (
        <FeedbackForm />
      ) : (
        <p>
          {t.rich("feedback.signedOut", {
            link: (chunks) => <Link href="/sign-in?next=/about%23contact">{chunks}</Link>,
            mailto: (chunks) => <a href={`mailto:${CONTACT_EMAIL}`}>{chunks}</a>,
            email: CONTACT_EMAIL,
          })}
        </p>
      )}

      {deployment && (
        <section className="admin-only" aria-labelledby="deployment-heading">
          <h2 id="deployment-heading">
            {t("deployment.heading")} <span className="muted small">· {t("deployment.note")}</span>
          </h2>
          <dl className="details-list">
            <dt>{t("deployment.version")}</dt>
            <dd>{deployment.version}</dd>
            {deployment.commit && (
              <>
                <dt>{t("deployment.commit")}</dt>
                <dd>
                  {deployment.commit.url ? (
                    <a href={deployment.commit.url} rel="noopener noreferrer">
                      <code>{deployment.commit.short}</code>
                    </a>
                  ) : (
                    <code>{deployment.commit.short}</code>
                  )}
                </dd>
              </>
            )}
            {deployment.environment && (
              <>
                <dt>{t("deployment.environment")}</dt>
                <dd>{deployment.environment}</dd>
              </>
            )}
            {deployment.builtAt && (
              <>
                <dt>{t("deployment.builtAt")}</dt>
                <dd>
                  <time dateTime={deployment.builtAt.toISOString()}>
                    {format.dateTime(deployment.builtAt, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC
                  </time>
                </dd>
              </>
            )}
          </dl>
        </section>
      )}
    </article>
  );
}
