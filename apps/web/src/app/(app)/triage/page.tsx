import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { triageAction } from "@/app/actions";
import { ArticleStatus, isBusy } from "@/components/article-status";
import { AutoRefresh } from "@/components/auto-refresh";
import { ListHistory } from "@/components/reader-navigation";
import { SubmitButton } from "@/components/submit-button";
import { SummaryBody } from "@/components/summary-card";
import { getDb } from "@/db";
import { requireUser } from "@/lib/auth";
import { getArticle, shownSummary, triageQueue } from "@/lib/library";
import { articleHref } from "@/lib/reader-origin";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Common");
  return { title: t("triage") };
}

export default async function TriagePage() {
  const user = await requireUser("/triage");
  const db = getDb();
  const { nextId, remaining } = await triageQueue(db, user.id);
  const found = nextId ? await getArticle(db, user.id, nextId) : null;
  const [t, tCommon] = await Promise.all([getTranslations("Triage"), getTranslations("Common")]);

  if (!found) {
    return (
      <div className="triage">
        <div className="page-title">
          <h1>{tCommon("triage")}</h1>
        </div>
        <p className="empty">{t.rich("allCaughtUp", { inbox: (chunks) => <Link href="/inbox">{chunks}</Link> })}</p>
      </div>
    );
  }

  const { article } = found;
  const summary = shownSummary(article, found.summaries);
  const ready = summary?.status === "ready" ? summary : undefined;
  const chosen = found.summaries.find((row) => row.model === article.summaryModel);

  return (
    <div className="triage">
      <AutoRefresh active={isBusy(article.status, chosen?.status ?? null)} />
      <ListHistory />
      <div className="page-title">
        <h1>{tCommon("triage")}</h1>
        <span className="muted small">{t("remaining", { remaining })}</span>
      </div>
      <section className="card triage-card">
        <div className="meta">
          <span>{article.siteName}</span>
          {article.readingMinutes ? <span>{tCommon("minRead", { minutes: article.readingMinutes })}</span> : null}
          {article.previewOnly && <span className="badge warn">{tCommon("previewOnly")}</span>}
        </div>
        <h2 style={{ fontSize: "1.3rem", marginTop: 6 }} lang={article.lang ?? undefined}>
          {article.title || article.url}
        </h2>
        {ready ? (
          <SummaryBody summary={ready} />
        ) : (
          <>
            <ArticleStatus
              id={article.id}
              status={article.status}
              error={article.error}
              errorMessage={article.errorMessage}
              summaryStatus={chosen?.status ?? null}
              summaryError={chosen?.error ?? null}
              summaryErrorMessage={chosen?.errorMessage ?? null}
              hasSummary={false}
            />
            {article.excerpt && <p>{article.excerpt}</p>}
          </>
        )}
        <div className="triage-actions">
          <Link className="button primary" href={articleHref(article.id, "/triage")}>
            {t("readNow")}
          </Link>
          <form action={triageAction}>
            <input type="hidden" name="id" value={article.id} />
            <input type="hidden" name="decision" value="later" />
            <SubmitButton>{t("later")}</SubmitButton>
          </form>
          <form action={triageAction}>
            <input type="hidden" name="id" value={article.id} />
            <input type="hidden" name="decision" value="archive" />
            <SubmitButton>{tCommon("archiveAction")}</SubmitButton>
          </form>
        </div>
      </section>
      <p className="muted small" style={{ textAlign: "center" }}>
        {t("laterHint", { later: t("later") })}
      </p>
    </div>
  );
}
