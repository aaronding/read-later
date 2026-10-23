import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { archiveAction, deleteAction, favoriteAction, readAction } from "@/app/actions";
import { ArticleStatus, isBusy } from "@/components/article-status";
import { AutoRefresh } from "@/components/auto-refresh";
import { BackLink } from "@/components/back-link";
import { LocalDate } from "@/components/local-date";
import { MarkOpened } from "@/components/mark-opened";
import { ConfirmButton } from "@/components/confirm-button";
import { FolderPicker } from "@/components/folder-picker";
import { SubmitButton } from "@/components/submit-button";
import { SummaryCard } from "@/components/summary-card";
import { SuggestedTags } from "@/components/suggested-tags";
import { SummaryTranslations } from "@/components/summary-translations";
import { getDb } from "@/db";
import { storedMessageText } from "@/i18n/stored-message";
import { isAdmin, requireUser } from "@/lib/auth";
import { listFolders } from "@/lib/folders";
import { getArticle, shownSummary } from "@/lib/library";
import { listTranslations, translationRunsLeft } from "@/lib/translations";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const user = await requireUser();
  const [found, t] = await Promise.all([getArticle(getDb(), user.id, (await params).id), getTranslations("Reader")]);
  return { title: found?.article.title ?? t("titleFallback") };
}

export default async function ReaderPage({ params }: Props) {
  const { id } = await params;
  const user = await requireUser(`/articles/${id}`);
  const admin = isAdmin(user);
  const db = getDb();
  const [found, folders] = await Promise.all([getArticle(db, user.id, id), listFolders(db, user.id)]);
  if (!found) notFound();
  const { article } = found;
  const summary = shownSummary(article, found.summaries);
  const ready = summary?.status === "ready" ? summary : undefined;
  const translations = ready ? await listTranslations(db, user.id, ready.id) : [];
  const runsLeft = ready ? await translationRunsLeft(db, ready.id) : 0;
  const chosen = found.summaries.find((row) => row.model === article.summaryModel);
  const busy =
    isBusy(article.status, chosen?.status ?? null) ||
    found.summaries.some((row) => isBusy("ready", row.status)) ||
    translations.some((row) => isBusy("ready", row.status));
  // New work (a translation asked for) starts the refreshing afresh, even after it gave up.
  const work = [...found.summaries, ...translations]
    .filter((row) => isBusy("ready", row.status))
    .map((row) => row.id)
    .join(",");
  // Longer than any summary takes: something went wrong, so offer Retry.
  const stale = Boolean(chosen && isBusy("ready", chosen.status) && Date.now() - chosen.updatedAt.getTime() > 10 * 60_000);
  const [t, tCommon, tErrors] = await Promise.all([
    getTranslations("Reader"),
    getTranslations("Common"),
    getTranslations("Errors"),
  ]);

  return (
    <article className="reader">
      <MarkOpened id={article.id} alreadyRead={Boolean(article.readAt)} />
      <AutoRefresh key={work} active={busy} />

      <header className="reader-header">
        <BackLink fallback={article.archivedAt ? "archive" : "inbox"} />
        <div className="meta">
          <span>{article.siteName}</span>
          {article.author && <span>{article.author}</span>}
          {article.publishedAt && (
            <span>
              <LocalDate value={article.publishedAt} />
            </span>
          )}
          {article.readingMinutes ? <span>{tCommon("minRead", { minutes: article.readingMinutes })}</span> : null}
          {article.previewOnly && <span className="badge warn">{tCommon("previewOnly")}</span>}
        </div>
        <h1 lang={article.lang ?? undefined}>{article.title || article.url}</h1>
        <div className="reader-toolbar">
          <a className="button" href={article.url} target="_blank" rel="noopener noreferrer">
            {t("openOriginal")}
          </a>
          <form action={archiveAction} className="inline-form">
            <input type="hidden" name="id" value={article.id} />
            <input type="hidden" name="archived" value={article.archivedAt ? "false" : "true"} />
            <SubmitButton>{article.archivedAt ? tCommon("moveToInbox") : tCommon("archiveAction")}</SubmitButton>
          </form>
          <form action={favoriteAction} className="inline-form">
            <input type="hidden" name="id" value={article.id} />
            <input type="hidden" name="favorite" value={article.favorite ? "false" : "true"} />
            <SubmitButton>{article.favorite ? t("favoriteOn") : t("favoriteOff")}</SubmitButton>
          </form>
          {article.readAt && (
            <form action={readAction} className="inline-form">
              <input type="hidden" name="id" value={article.id} />
              <input type="hidden" name="read" value="false" />
              <SubmitButton className="button ghost">{t("markUnread")}</SubmitButton>
            </form>
          )}
        </div>
      </header>

      {article.previewOnly && (
        <div className="notice warn">
          {t.rich("previewNotice", {
            strong: (chunks) => <strong>{chunks}</strong>,
            reason: storedMessageText(tErrors, article.previewReasonMessage, article.previewReason) ?? "",
            safari: "Safari",
          })}
        </div>
      )}

      <ArticleStatus
        id={article.id}
        status={article.status}
        error={article.error}
        errorMessage={article.errorMessage}
        summaryStatus={chosen?.status ?? null}
        summaryError={chosen?.error ?? null}
        summaryErrorMessage={chosen?.errorMessage ?? null}
        hasSummary={Boolean(ready)}
        stale={stale}
      />

      {ready ? (
        <SummaryCard
          articleId={article.id}
          summary={ready}
          admin={admin}
          translations={<SummaryTranslations summary={ready} translations={translations} runsLeft={runsLeft} />}
        >
          <SuggestedTags articleId={article.id} userId={user.id} suggestions={ready.suggestedTags ?? []} />
        </SummaryCard>
      ) : (
        article.status === "ready" && (
          (found.summaries.length === 0 || admin) && (
            <p className="muted small">
              {found.summaries.length === 0 && t("noSummary")}{" "}
              {admin && <Link href={`/articles/${article.id}/compare`}>{tCommon("compareModels")}</Link>}
            </p>
          )
        )
      )}

      {article.contentHtml ? (
        <div
          className="prose"
          lang={article.lang ?? undefined}
          // Sanitized with DOMPurify before it was stored.
          dangerouslySetInnerHTML={{ __html: article.contentHtml }}
        />
      ) : (
        article.status === "ready" && (
          <p className="muted">
            {article.excerpt && <>{article.excerpt} </>}
            {t.rich(article.excerpt ? "openTheOriginal" : "noReadableCopy", {
              link: (chunks) => (
                <a href={article.url} target="_blank" rel="noopener noreferrer">
                  {chunks}
                </a>
              ),
            })}
          </p>
        )
      )}

      <FolderPicker articleId={article.id} current={article.folderId} folders={folders} />

      <footer className="reader-toolbar" style={{ marginTop: 16 }}>
        <span className="muted small">
          {tCommon.rich("savedOn", { date: () => <LocalDate value={article.savedAt} /> })} ·{" "}
          <a href={article.url}>{new URL(article.url).hostname}</a>
        </span>
        <form action={deleteAction} className="inline-form" style={{ marginLeft: "auto" }}>
          <input type="hidden" name="id" value={article.id} />
          <input type="hidden" name="redirectTo" value="/inbox" />
          <ConfirmButton className="button danger" message={t("deleteConfirm")}>
            {tCommon("delete")}
          </ConfirmButton>
        </form>
      </footer>
    </article>
  );
}
