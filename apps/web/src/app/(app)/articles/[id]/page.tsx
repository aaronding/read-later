import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArticleStatus, isBusy } from "@/components/article-status";
import { AutoRefresh } from "@/components/auto-refresh";
import { FolderMenu } from "@/components/folder-menu";
import { LocalDate } from "@/components/local-date";
import { MarkOpened } from "@/components/mark-opened";
import { ReaderActions } from "@/components/reader-actions";
import { FloatingBack } from "@/components/reader-navigation";
import { SummaryCard } from "@/components/summary-card";
import { SuggestedTags } from "@/components/suggested-tags";
import { SummaryTranslations } from "@/components/summary-translations";
import { getDb } from "@/db";
import { storedMessageText } from "@/i18n/stored-message";
import { getAllowance } from "@/lib/allowance";
import { isAdmin, requireUser } from "@/lib/auth";
import { listFolders } from "@/lib/folders";
import { getArticle, shownSummary } from "@/lib/library";
import { readerBack } from "@/lib/reader-origin";
import { listTranslations, translationRunsLeft } from "@/lib/translations";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const user = await requireUser();
  const [found, t] = await Promise.all([getArticle(getDb(), user.id, (await params).id), getTranslations("Reader")]);
  return { title: found?.article.title ?? t("titleFallback") };
}

export default async function ReaderPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { from } = await searchParams;
  const user = await requireUser(`/articles/${id}`);
  const admin = isAdmin(user);
  const db = getDb();
  const [found, folders] = await Promise.all([getArticle(db, user.id, id), listFolders(db, user.id)]);
  if (!found) notFound();
  const { article } = found;
  const back = readerBack(from, Boolean(article.archivedAt));
  const folderName = folders.find((folder) => folder.id === article.folderId)?.name ?? null;
  const summary = shownSummary(article, found.summaries);
  const ready = summary?.status === "ready" ? summary : undefined;
  const translations = ready ? await listTranslations(db, user.id, ready.id) : [];
  const runsLeft = ready ? await translationRunsLeft(db, ready.id) : 0;
  const allowance = await getAllowance(db, user.id);
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
      <FloatingBack href={back.href} label={t("backTo", { list: back.list })} />

      <header className="reader-header">
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
          <a href={article.url} target="_blank" rel="noopener noreferrer">
            {t("openOriginal")}
          </a>
        </div>
        <h1 lang={article.lang ?? undefined}>{article.title || article.url}</h1>
        <ReaderActions article={article} folderName={folderName} back={back.href} />
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
          translations={<SummaryTranslations summary={ready} translations={translations} runsLeft={runsLeft} paused={allowance.reached} />}
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

      <footer className="reader-footer">
        <div className="meta">
          <span>{tCommon.rich("savedOn", { date: () => <LocalDate value={article.savedAt} /> })}</span>
          <a href={article.url} target="_blank" rel="noopener noreferrer">
            {t("openOriginal")}
          </a>
        </div>
        <ReaderActions article={article} folderName={folderName} back={back.href} />
        <FolderMenu articleId={article.id} current={article.folderId} folders={folders} />
      </footer>
    </article>
  );
}
