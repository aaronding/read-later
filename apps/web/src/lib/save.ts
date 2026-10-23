import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { envInt } from "@/config/env";
import type { Db } from "@/db";
import { articleUrls, articles, jobs, type Article, type SaveSource } from "@/db/schema";
import type { StoredMessage } from "@/i18n/stored-message";
import { errorMessage } from "@/lib/error-message";
import { enqueueJob, hasQueuedJob } from "@/lib/jobs/queue";
import { getSettings } from "@/lib/settings";
import { findCanonicalHref, normalizeUrl, parseHttpUrl, trustedCanonicalUrl } from "@/lib/urls";

/** For programs, such as the browser extension, in the save API's replies. */
export type SaveErrorCode = "invalid_url" | "too_large" | "server_error";

export class SaveError extends Error {
  constructor(
    readonly code: SaveErrorCode,
    /** For people, as a message in the Errors namespace. */
    readonly storedMessage: StoredMessage,
    readonly status: number,
  ) {
    super(storedMessage.key);
    this.name = "SaveError";
  }
}

export interface SaveRequest {
  userId: string;
  url: string;
  html?: string | null;
  title?: string | null;
  source: SaveSource;
}

export interface SaveResult {
  articleId: string;
  /** created: new article. resaved: already saved, moved to the top. replaced: a fuller copy replaces a preview. */
  outcome: "created" | "resaved" | "replaced";
  queued: boolean;
}

export function maxHtmlBytes(): number {
  return envInt("SAVE_MAX_HTML_BYTES", 4 * 1024 * 1024);
}

// Postgres can't index a longer address, so such an address isn't remembered.
const MAX_REMEMBERED_URL_BYTES = 2000;

/**
 * Remembers addresses that led to an article, so saving any of them again
 * finds it. An address another article already has stays with that one.
 */
export async function rememberUrls(db: Db, article: Pick<Article, "id" | "userId">, keys: string[]): Promise<void> {
  const unique = [...new Set(keys)].filter((key) => Buffer.byteLength(key, "utf8") <= MAX_REMEMBERED_URL_BYTES);
  if (!unique.length) return;
  await db
    .insert(articleUrls)
    .values(unique.map((normalizedUrl) => ({ userId: article.userId, normalizedUrl, articleId: article.id })))
    .onConflictDoNothing();
}

async function queueProcessing(db: Db, article: Pick<Article, "id" | "userId">): Promise<boolean> {
  if (await hasQueuedJob(db, article.id, "process_article")) return false;
  await enqueueJob(db, { userId: article.userId, articleId: article.id, type: "process_article" });
  return true;
}

/**
 * Downloads a copy saved again by its address alone once more, if it still
 * needs content: a failed, empty or preview copy. Nothing is queued while a
 * download is running, since it reads the page as it is now, and a queued
 * one waiting to try again is made due now, as Retry does. True when a
 * download is due; the article moves to the top either way.
 */
async function downloadAgain(db: Db, article: Article): Promise<boolean> {
  return db.transaction(async (tx) => {
    const live = await tx
      .select({ id: jobs.id, status: jobs.status })
      .from(jobs)
      .where(and(eq(jobs.articleId, article.id), eq(jobs.type, "process_article"), inArray(jobs.status, ["queued", "running"])));
    const moved = { savedAt: new Date(), archivedAt: null };
    const running = live.some((job) => job.status === "running");
    // Checked again here: a job may have stored a complete copy since the article was read.
    const [due] = running
      ? []
      : await tx
          .update(articles)
          .set({ ...moved, status: "pending", error: null, errorMessage: null })
          .where(and(eq(articles.id, article.id), or(eq(articles.previewOnly, true), isNull(articles.contentHtml), eq(articles.status, "failed"))))
          .returning({ id: articles.id });
    if (!due) {
      await tx.update(articles).set(moved).where(eq(articles.id, article.id));
      return false;
    }
    if (live.length) {
      await tx.update(jobs).set({ runAt: new Date() }).where(inArray(jobs.id, live.map((job) => job.id)));
    } else {
      await enqueueJob(tx, { userId: article.userId, articleId: article.id, type: "process_article" });
    }
    return true;
  });
}

/** How a save is described: "refetching" is a copy saved again by its address and downloaded again. */
export function saveNotice(result: SaveResult): SaveResult["outcome"] | "refetching" {
  return result.outcome === "resaved" && result.queued ? "refetching" : result.outcome;
}

/**
 * Records a save and queues the slow work. Fast by design: a few small
 * queries, no network calls. Saving any address that already led to one of
 * the user's articles (article_urls) moves that article back to the top of
 * the Inbox instead of saving it twice.
 */
export async function saveArticle(db: Db, request: SaveRequest): Promise<SaveResult> {
  const parsed = parseHttpUrl(request.url);
  if (!parsed) throw new SaveError("invalid_url", errorMessage("save.invalidUrl", { field: "url" }), 400);
  const url = request.url.trim();
  const html = request.html?.trim() ? request.html : null;
  if (html && Buffer.byteLength(html, "utf8") > maxHtmlBytes()) {
    throw new SaveError("too_large", errorMessage("save.htmlTooLarge"), 413);
  }
  const title = request.title?.trim().slice(0, 500) || null;

  const normalized = normalizeUrl(parsed);
  const canonical = html ? trustedCanonicalUrl(url, findCanonicalHref(html)) : null;
  const keys = canonical && canonical !== normalized ? [canonical, normalized] : [normalized];

  // One query: an article that has any of the keys as its own or as a
  // remembered address (its own key may predate article_urls), preferring
  // the first key, the page's canonical address.
  const findExisting = async () => {
    const remembered = db
      .select({ id: articleUrls.articleId })
      .from(articleUrls)
      .where(and(eq(articleUrls.userId, request.userId), inArray(articleUrls.normalizedUrl, keys)));
    const first = keys[0]!;
    const rows = await db
      .select({
        article: articles,
        first: sql<boolean>`(${articles.normalizedUrl} = ${first} OR EXISTS (SELECT 1 FROM ${articleUrls} WHERE ${articleUrls.articleId} = ${articles.id} AND ${articleUrls.normalizedUrl} = ${first}))`,
      })
      .from(articles)
      .where(and(eq(articles.userId, request.userId), or(inArray(articles.normalizedUrl, keys), inArray(articles.id, remembered))));
    return (rows.find((row) => row.first) ?? rows[0])?.article;
  };

  let existing = await findExisting();
  if (!existing) {
    const settings = await getSettings(db, request.userId);
    const created = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(articles)
        .values({
          userId: request.userId,
          url,
          normalizedUrl: keys[0]!,
          submittedHtml: html,
          submittedTitle: title,
          title,
          saveSource: request.source,
          summaryModel: settings.defaultModel,
        })
        .onConflictDoNothing()
        .returning();
      if (!row) return null;
      await rememberUrls(tx, row, keys);
      await enqueueJob(tx, { userId: request.userId, articleId: row.id, type: "process_article" });
      return row;
    });
    if (created) return { articleId: created.id, outcome: "created", queued: true };
    // Saved at the same moment by another request.
    existing = await findExisting();
    if (!existing) throw new SaveError("server_error", errorMessage("save.failed"), 500);
  }

  // Already saved: back to the top of the Inbox, under this address too.
  await rememberUrls(db, existing, keys);
  const needsContent = existing.previewOnly || !existing.contentHtml || existing.status === "failed";
  if (html && needsContent) {
    const queued = await db.transaction(async (tx) => {
      await tx
        .update(articles)
        .set({
          savedAt: new Date(),
          archivedAt: null,
          submittedHtml: html,
          submittedTitle: title ?? existing.submittedTitle,
          status: "pending",
          error: null,
          errorMessage: null,
          saveSource: request.source,
        })
        .where(eq(articles.id, existing.id));
      return queueProcessing(tx, existing);
    });
    return { articleId: existing.id, outcome: "replaced", queued };
  }

  // Saved again by its address alone: a failed, empty or preview copy is
  // downloaded again, and the job keeps whichever copy is better; a complete
  // one is only moved to the top.
  if (needsContent) return { articleId: existing.id, outcome: "resaved", queued: await downloadAgain(db, existing) };
  await db.update(articles).set({ savedAt: new Date(), archivedAt: null }).where(eq(articles.id, existing.id));
  return { articleId: existing.id, outcome: "resaved", queued: false };
}
