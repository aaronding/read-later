import { and, eq, inArray } from "drizzle-orm";
import { envInt } from "@/config/env";
import type { Db } from "@/db";
import { articles, type Article, type SaveSource } from "@/db/schema";
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

async function queueProcessing(db: Db, article: Pick<Article, "id" | "userId">): Promise<boolean> {
  if (await hasQueuedJob(db, article.id, "process_article")) return false;
  await enqueueJob(db, { userId: article.userId, articleId: article.id, type: "process_article" });
  return true;
}

/**
 * Records a save and queues the slow work. Fast by design: a few small
 * queries, no network calls. Duplicates (same normalized URL for this user)
 * are moved back to the top of the Inbox instead of saved twice.
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

  const findExisting = async () => {
    const rows = await db
      .select()
      .from(articles)
      .where(and(eq(articles.userId, request.userId), inArray(articles.normalizedUrl, keys)));
    return rows.find((row) => row.normalizedUrl === keys[0]) ?? rows[0];
  };

  let existing = await findExisting();
  if (!existing) {
    const settings = await getSettings(db, request.userId);
    const [created] = await db
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
    if (created) {
      await enqueueJob(db, { userId: request.userId, articleId: created.id, type: "process_article" });
      return { articleId: created.id, outcome: "created", queued: true };
    }
    // Saved at the same moment by another request.
    existing = await findExisting();
    if (!existing) throw new SaveError("server_error", errorMessage("save.failed"), 500);
  }

  // Already saved: back to the top of the Inbox.
  const needsContent = existing.previewOnly || !existing.contentHtml || existing.status === "failed";
  if (html && needsContent) {
    await db
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
    const queued = await queueProcessing(db, existing);
    return { articleId: existing.id, outcome: "replaced", queued };
  }

  const retry = existing.status === "failed";
  await db
    .update(articles)
    .set({
      savedAt: new Date(),
      archivedAt: null,
      ...(retry ? { status: "pending" as const, error: null, errorMessage: null } : {}),
    })
    .where(eq(articles.id, existing.id));
  const queued = retry ? await queueProcessing(db, existing) : false;
  return { articleId: existing.id, outcome: "resaved", queued };
}
