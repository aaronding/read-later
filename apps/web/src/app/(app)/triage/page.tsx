import type { Metadata } from "next";
import Link from "next/link";
import { triageAction } from "@/app/actions";
import { ArticleStatus, isBusy } from "@/components/article-status";
import { AutoRefresh } from "@/components/auto-refresh";
import { SubmitButton } from "@/components/submit-button";
import { SummaryBody } from "@/components/summary-card";
import { getDb } from "@/db";
import { requireUser } from "@/lib/auth";
import { getArticle, shownSummary, triageQueue } from "@/lib/library";

export const metadata: Metadata = { title: "Triage" };

export default async function TriagePage() {
  const user = await requireUser("/triage");
  const db = getDb();
  const { nextId, remaining } = await triageQueue(db, user.id);
  const found = nextId ? await getArticle(db, user.id, nextId) : null;

  if (!found) {
    return (
      <div className="triage">
        <div className="page-title">
          <h1>Triage</h1>
        </div>
        <p className="empty">
          All caught up: no unread articles in your Inbox. <Link href="/inbox">Back to the Inbox</Link>
        </p>
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
      <div className="page-title">
        <h1>Triage</h1>
        <span className="muted small">{remaining} unread</span>
      </div>
      <section className="card triage-card">
        <div className="meta">
          <span>{article.siteName}</span>
          {article.readingMinutes ? <span>{article.readingMinutes} min read</span> : null}
          {article.previewOnly && <span className="badge warn">Preview only</span>}
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
              summaryStatus={chosen?.status ?? null}
              hasSummary={false}
            />
            {article.excerpt && <p>{article.excerpt}</p>}
          </>
        )}
        <div className="triage-actions">
          <Link className="button primary" href={`/articles/${article.id}`}>
            Read now
          </Link>
          <form action={triageAction}>
            <input type="hidden" name="id" value={article.id} />
            <input type="hidden" name="decision" value="later" />
            <SubmitButton>Later</SubmitButton>
          </form>
          <form action={triageAction}>
            <input type="hidden" name="id" value={article.id} />
            <input type="hidden" name="decision" value="archive" />
            <SubmitButton>Archive</SubmitButton>
          </form>
        </div>
      </section>
      <p className="muted small" style={{ textAlign: "center" }}>
        Later keeps the article in your Inbox and moves it to the back of this queue.
      </p>
    </div>
  );
}
