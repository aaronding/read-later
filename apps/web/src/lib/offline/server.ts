import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db";
import { articles, summaries } from "@/db/schema";
import { shownSummary } from "@/lib/library";
import { copyVersion, type HaveVersions, type OfflineCopy, type OfflineSync } from "./copy";

/**
 * The copies a browser should keep, for the articles it asked about: those
 * whose version differs from the one it has, and the ids of those the user no
 * longer has. Only the user's own articles; another user's id reads as gone.
 */
export async function loadOfflineCopies(db: Db, userId: string, have: HaveVersions): Promise<OfflineSync> {
  const ids = Object.keys(have);
  if (ids.length === 0) return { copies: [], removed: [] };
  // First only what the versions need, so unchanged articles cost no text.
  const [rows, summaryRows] = await Promise.all([
    db
      .select({ id: articles.id, updatedAt: articles.updatedAt, summaryModel: articles.summaryModel })
      .from(articles)
      .where(and(eq(articles.userId, userId), inArray(articles.id, ids))),
    db
      .select()
      .from(summaries)
      .where(and(eq(summaries.userId, userId), inArray(summaries.articleId, ids))),
  ]);
  const found = new Set(rows.map((row) => row.id));
  const removed = ids.filter((id) => !found.has(id));

  const shown = new Map<string, (typeof summaryRows)[number] | undefined>();
  const changed: string[] = [];
  for (const row of rows) {
    const own = summaryRows.filter((summary) => summary.articleId === row.id);
    const summary = shownSummary(row, own);
    const ready = summary?.status === "ready" ? summary : undefined;
    shown.set(row.id, ready);
    if (have[row.id] !== copyVersion(row.updatedAt, ready)) changed.push(row.id);
  }
  if (changed.length === 0) return { copies: [], removed };

  const full = await db
    .select()
    .from(articles)
    .where(and(eq(articles.userId, userId), inArray(articles.id, changed)));
  const copies = full.map((article): OfflineCopy => {
    const summary = shown.get(article.id);
    return {
      id: article.id,
      version: copyVersion(article.updatedAt, summary),
      url: article.url,
      title: article.title,
      siteName: article.siteName,
      author: article.author,
      lang: article.lang,
      publishedAt: article.publishedAt?.toISOString() ?? null,
      savedAt: article.savedAt.toISOString(),
      readingMinutes: article.readingMinutes,
      previewOnly: article.previewOnly,
      contentHtml: article.contentHtml,
      excerpt: article.excerpt,
      summary: summary
        ? {
            model: summary.model,
            language: summary.language,
            tldr: summary.tldr,
            keyPoints: summary.keyPoints,
            partial: summary.partial,
          }
        : null,
    };
  });
  return { copies, removed };
}
