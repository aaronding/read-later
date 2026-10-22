import { and, asc, desc, eq, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import { isSummaryModel, type SummaryModel } from "@/config/models";
import type { Db } from "@/db";
import { articles, jobs, summaries, type Article, type Summary } from "@/db/schema";
import type { StoredMessage } from "@/i18n/stored-message";
import { requestSummary } from "@/lib/jobs/handlers";
import { enqueueJob, hasLiveJob, hasQueuedJob } from "@/lib/jobs/queue";

// Every query here takes the user id and filters on it.

export type LibraryView = "inbox" | "favorites" | "archive";

export interface ArticleListItem {
  id: string;
  url: string;
  title: string | null;
  siteName: string | null;
  readingMinutes: number | null;
  savedAt: Date;
  readAt: Date | null;
  archivedAt: Date | null;
  favorite: boolean;
  status: Article["status"];
  error: string | null;
  errorMessage: StoredMessage | null;
  previewOnly: boolean;
  folderName: string | null;
  tldr: string | null;
  summaryStatus: Summary["status"] | null;
  summaryError: string | null;
  summaryErrorMessage: StoredMessage | null;
}

const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * Full-text search over title, summary and text with the 'simple' (no
 * stemming) configuration; each word matches as a prefix, so "orchard" finds
 * "orchards". Chinese and Japanese aren't split into words by Postgres, so a
 * query in those scripts also matches as a substring.
 */
function searchCondition(query: string): { where: SQL | undefined; rank: SQL | undefined } {
  const words = query.match(/[\p{L}\p{N}]+/gu) ?? [];
  const conditions: SQL[] = [];
  let rank: SQL | undefined;
  if (words.length) {
    const tsquery = words.map((word) => `${word}:*`).join(" & ");
    conditions.push(sql`${articles.searchVector} @@ to_tsquery('simple', ${tsquery})`);
    rank = sql`ts_rank(${articles.searchVector}, to_tsquery('simple', ${tsquery}))`;
  }
  if (CJK.test(query)) {
    const like = `%${escapeLike(query.trim())}%`;
    conditions.push(
      sql`(${articles.title} ILIKE ${like} OR ${articles.textContent} ILIKE ${like} OR EXISTS (
        SELECT 1 FROM summaries s WHERE s.article_id = "articles"."id" AND s.tldr ILIKE ${like}))`,
    );
  }
  return { where: conditions.length ? or(...conditions) : sql`false`, rank };
}

// Correlated subqueries name "articles" explicitly: in a single-table select,
// Drizzle writes columns without their table, which would bind to "s" here.
const shownTldr = sql<string | null>`(
  SELECT s.tldr FROM summaries s
  WHERE s.article_id = "articles"."id" AND s.status = 'ready'
  ORDER BY (s.model = "articles"."summary_model") DESC, s.completed_at DESC
  LIMIT 1)`;

const shownSummaryStatus = sql<Summary["status"] | null>`(
  SELECT s.status FROM summaries s
  WHERE s.article_id = "articles"."id" AND s.model = "articles"."summary_model")`;

const shownSummaryError = sql<string | null>`(
  SELECT s.error FROM summaries s
  WHERE s.article_id = "articles"."id" AND s.model = "articles"."summary_model")`;

const shownSummaryErrorMessage = sql<StoredMessage | null>`(
  SELECT s.error_message FROM summaries s
  WHERE s.article_id = "articles"."id" AND s.model = "articles"."summary_model")`;

export const PAGE_SIZE = 50;

const folderName = sql<string | null>`(SELECT f.name FROM folders f WHERE f.id = "articles"."folder_id")`;

export interface ListOptions {
  view: LibraryView;
  query?: string;
  page?: number;
  folderId?: string;
  tag?: string;
}

export async function listArticles(
  db: Db,
  userId: string,
  { view, query, page = 0, folderId, tag }: ListOptions,
): Promise<{ items: ArticleListItem[]; hasMore: boolean }> {
  const filters: (SQL | undefined)[] = [eq(articles.userId, userId)];
  if (view === "inbox") filters.push(isNull(articles.archivedAt));
  if (view === "favorites") filters.push(eq(articles.favorite, true));
  if (view === "archive") filters.push(isNotNull(articles.archivedAt));
  if (folderId && /^[0-9a-f-]{36}$/i.test(folderId)) filters.push(eq(articles.folderId, folderId));
  if (tag) {
    filters.push(sql`EXISTS (
      SELECT 1 FROM article_tags t JOIN tags g ON g.id = t.tag_id
      WHERE t.article_id = "articles"."id" AND lower(g.name) = lower(${tag}))`);
  }
  const search = query?.trim() ? searchCondition(query) : undefined;
  if (search) filters.push(search.where);

  const order = [
    ...(search?.rank ? [desc(search.rank)] : []),
    view === "archive" ? desc(articles.archivedAt) : desc(articles.savedAt),
    desc(articles.createdAt),
  ];

  const rows = await db
    .select({
      id: articles.id,
      url: articles.url,
      title: articles.title,
      siteName: articles.siteName,
      readingMinutes: articles.readingMinutes,
      savedAt: articles.savedAt,
      readAt: articles.readAt,
      archivedAt: articles.archivedAt,
      favorite: articles.favorite,
      status: articles.status,
      error: articles.error,
      errorMessage: articles.errorMessage,
      previewOnly: articles.previewOnly,
      folderName,
      tldr: shownTldr,
      summaryStatus: shownSummaryStatus,
      summaryError: shownSummaryError,
      summaryErrorMessage: shownSummaryErrorMessage,
    })
    .from(articles)
    .where(and(...filters))
    .orderBy(...order)
    .limit(PAGE_SIZE + 1)
    .offset(page * PAGE_SIZE);
  return { items: rows.slice(0, PAGE_SIZE), hasMore: rows.length > PAGE_SIZE };
}

export async function getArticle(db: Db, userId: string, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [article] = await db
    .select()
    .from(articles)
    .where(and(eq(articles.id, id), eq(articles.userId, userId)))
    .limit(1);
  if (!article) return null;
  const rows = await db
    .select()
    .from(summaries)
    .where(and(eq(summaries.articleId, id), eq(summaries.userId, userId)))
    .orderBy(asc(summaries.createdAt));
  return { article, summaries: rows };
}

/** The summary to show: the article's chosen model if ready, else the newest ready one. */
export function shownSummary(article: Article, rows: Summary[]): Summary | undefined {
  const chosen = rows.find((row) => row.model === article.summaryModel);
  if (chosen?.status === "ready") return chosen;
  const ready = rows
    .filter((row) => row.status === "ready")
    .sort((a, b) => (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0));
  return ready[0] ?? chosen;
}

/** Unread Inbox articles; "Later" sends one to the back of the queue. */
export async function triageQueue(db: Db, userId: string) {
  const where = and(eq(articles.userId, userId), isNull(articles.archivedAt), isNull(articles.readAt));
  const [next] = await db
    .select({ id: articles.id })
    .from(articles)
    .where(where)
    .orderBy(sql`${articles.triagedAt} ASC NULLS FIRST`, desc(articles.savedAt))
    .limit(1);
  const [{ count } = { count: 0 }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(articles)
    .where(where);
  return { nextId: next?.id ?? null, remaining: count };
}

// ---------------------------------------------------------------------------
// Changes
// ---------------------------------------------------------------------------

function own(userId: string, id: string) {
  return and(eq(articles.id, id), eq(articles.userId, userId));
}

export async function setArchived(db: Db, userId: string, id: string, archived: boolean) {
  await db.update(articles).set({ archivedAt: archived ? new Date() : null }).where(own(userId, id));
}

export async function setFavorite(db: Db, userId: string, id: string, favorite: boolean) {
  await db.update(articles).set({ favorite }).where(own(userId, id));
}

export async function setRead(db: Db, userId: string, id: string, read: boolean) {
  await db.update(articles).set({ readAt: read ? new Date() : null }).where(own(userId, id));
}

/** Marks an article read the first time it is opened. */
export async function markOpened(db: Db, userId: string, id: string) {
  await db
    .update(articles)
    .set({ readAt: new Date() })
    .where(and(own(userId, id), isNull(articles.readAt)));
}

export async function triageLater(db: Db, userId: string, id: string) {
  await db.update(articles).set({ triagedAt: new Date() }).where(own(userId, id));
}

export async function deleteArticle(db: Db, userId: string, id: string) {
  // Summaries, jobs and tags go with it (ON DELETE CASCADE).
  await db.delete(articles).where(own(userId, id));
}

/** Retry a failed download or failed summaries; a retry waiting for its backoff runs now. */
export async function retryArticle(db: Db, userId: string, id: string) {
  const found = await getArticle(db, userId, id);
  if (!found) return;
  const { article } = found;
  if (article.status === "failed" || (!article.contentHtml && article.status !== "processing")) {
    await db.update(articles).set({ status: "pending", error: null, errorMessage: null }).where(own(userId, id));
    if (!(await hasQueuedJob(db, id, "process_article"))) {
      await enqueueJob(db, { userId, articleId: id, type: "process_article" });
    }
  } else {
    for (const summary of found.summaries) {
      if (!isSummaryModel(summary.model)) continue;
      // Failed summaries, and any stuck as pending or running with no job.
      const stuck =
        (summary.status === "pending" || summary.status === "running") &&
        !(await hasLiveJob(db, id, "summarize", summary.model));
      if (summary.status === "failed" || stuck) {
        await requestSummary(db, { userId, articleId: id, model: summary.model });
      }
    }
  }
  await db
    .update(jobs)
    .set({ runAt: new Date() })
    .where(and(eq(jobs.articleId, id), eq(jobs.userId, userId), eq(jobs.status, "queued")));
}

/** "Re-summarize with…": runs the model again and shows its summary. */
export async function resummarize(db: Db, userId: string, id: string, model: SummaryModel, show = true) {
  const found = await getArticle(db, userId, id);
  if (!found?.article.textContent) return false;
  if (show) await db.update(articles).set({ summaryModel: model }).where(own(userId, id));
  await requestSummary(db, { userId, articleId: id, model });
  return true;
}

/** Shows an existing summary without running anything. */
export async function showSummaryFrom(db: Db, userId: string, id: string, model: SummaryModel) {
  await db.update(articles).set({ summaryModel: model }).where(own(userId, id));
}
