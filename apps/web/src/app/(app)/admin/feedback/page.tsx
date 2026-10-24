import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LocalDate } from "@/components/local-date";
import { getDb } from "@/db";
import { getCurrentUser, isAdmin, requireAdmin } from "@/lib/auth";
import { listFeedback } from "@/lib/feedback";

export async function generateMetadata(): Promise<Metadata> {
  // As on the usage report, the title would tell anyone else the page exists.
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) return {};
  const t = await getTranslations("Admin");
  return { title: t("feedback.title") };
}

/** What users sent from the About page, for admins only. */
export default async function FeedbackPage() {
  await requireAdmin("/admin/feedback");
  const [rows, t] = await Promise.all([listFeedback(getDb()), getTranslations("Admin")]);
  return (
    <div className="info">
      <div className="page-title">
        <h1>{t("feedback.title")}</h1>
      </div>
      <p className="muted">{t("feedback.intro")}</p>
      {rows.length === 0 && <p className="muted">{t("feedback.empty")}</p>}
      {rows.map((row) => (
        <section key={row.id} className="card feedback-item">
          <p className="meta">
            <span>
              {t.rich("feedback.from", {
                name: row.name,
                email: () => <a href={`mailto:${row.email}`}>{row.email}</a>,
              })}
            </span>
            <LocalDate value={row.createdAt} />
          </p>
          <p className="feedback-message">{row.message}</p>
        </section>
      ))}
    </div>
  );
}
