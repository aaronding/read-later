import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { archiveAction, deleteAction, favoriteAction, readAction } from "@/app/actions";
import { ArticleStatus, isBusy } from "@/components/article-status";
import { AutoRefresh } from "@/components/auto-refresh";
import { LocalDate } from "@/components/local-date";
import { MarkOpened } from "@/components/mark-opened";
import { ConfirmButton } from "@/components/confirm-button";
import { SubmitButton } from "@/components/submit-button";
import { SummaryCard } from "@/components/summary-card";
import { SuggestedTags } from "@/components/suggested-tags";
import { getDb } from "@/db";
import { requireUser } from "@/lib/auth";
import { getArticle, shownSummary } from "@/lib/library";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const user = await requireUser();
  const found = await getArticle(getDb(), user.id, (await params).id);
  return { title: found?.article.title ?? "Article" };
}

export default async function ReaderPage({ params }: Props) {
  const { id } = await params;
  const user = await requireUser(`/articles/${id}`);
  const found = await getArticle(getDb(), user.id, id);
  if (!found) notFound();
  const { article } = found;
  const summary = shownSummary(article, found.summaries);
  const ready = summary?.status === "ready" ? summary : undefined;
  const chosen = found.summaries.find((row) => row.model === article.summaryModel);
  const busy = isBusy(article.status, chosen?.status ?? null) || found.summaries.some((row) => isBusy("ready", row.status));

  return (
    <article className="reader">
      <MarkOpened id={article.id} alreadyRead={Boolean(article.readAt)} />
      <AutoRefresh active={busy} />

      <header className="reader-header">
        <div className="meta">
          <span>{article.siteName}</span>
          {article.author && <span>{article.author}</span>}
          {article.publishedAt && (
            <span>
              <LocalDate value={article.publishedAt} />
            </span>
          )}
          {article.readingMinutes ? <span>{article.readingMinutes} min read</span> : null}
          {article.previewOnly && <span className="badge warn">Preview only</span>}
        </div>
        <h1 lang={article.lang ?? undefined}>{article.title || article.url}</h1>
        <div className="reader-toolbar">
          <a className="button" href={article.url} target="_blank" rel="noopener noreferrer">
            Open original ↗
          </a>
          <form action={archiveAction} className="inline-form">
            <input type="hidden" name="id" value={article.id} />
            <input type="hidden" name="archived" value={article.archivedAt ? "false" : "true"} />
            <SubmitButton>{article.archivedAt ? "Move to Inbox" : "Archive"}</SubmitButton>
          </form>
          <form action={favoriteAction} className="inline-form">
            <input type="hidden" name="id" value={article.id} />
            <input type="hidden" name="favorite" value={article.favorite ? "false" : "true"} />
            <SubmitButton>{article.favorite ? "★ Favorite" : "☆ Favorite"}</SubmitButton>
          </form>
          {article.readAt && (
            <form action={readAction} className="inline-form">
              <input type="hidden" name="id" value={article.id} />
              <input type="hidden" name="read" value="false" />
              <SubmitButton className="button ghost">Mark unread</SubmitButton>
            </form>
          )}
        </div>
      </header>

      {article.previewOnly && (
        <div className="notice warn">
          <strong>Preview only.</strong> {article.previewReason} To keep the full article, open it in your browser while
          signed in to the site and save it again with the Chrome extension or the Safari Shortcut.
        </div>
      )}

      <ArticleStatus
        id={article.id}
        status={article.status}
        error={article.error}
        summaryStatus={chosen?.status ?? null}
        hasSummary={Boolean(ready)}
      />

      {ready ? (
        <SummaryCard articleId={article.id} summary={ready}>
          <SuggestedTags articleId={article.id} userId={user.id} suggestions={ready.suggestedTags ?? []} />
        </SummaryCard>
      ) : (
        article.status === "ready" && (
          <p className="muted small">
            {found.summaries.length === 0 && "No summary: there isn’t enough article text. "}
            <Link href={`/articles/${article.id}/compare`}>Compare models</Link>
          </p>
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
            {article.excerpt ?? "There is no readable copy of this page."}{" "}
            <a href={article.url} target="_blank" rel="noopener noreferrer">
              Open the original
            </a>
            .
          </p>
        )
      )}

      <footer className="reader-toolbar" style={{ marginTop: 32 }}>
        <span className="muted small">
          Saved <LocalDate value={article.savedAt} /> · <a href={article.url}>{new URL(article.url).hostname}</a>
        </span>
        <form action={deleteAction} className="inline-form" style={{ marginLeft: "auto" }}>
          <input type="hidden" name="id" value={article.id} />
          <input type="hidden" name="redirectTo" value="/inbox" />
          <ConfirmButton className="button danger" message="Delete this article and its summaries?">
            Delete
          </ConfirmButton>
        </form>
      </footer>
    </article>
  );
}
