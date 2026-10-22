import { asc, eq } from "drizzle-orm";
import type { createTranslator } from "next-intl";
import { APP_NAME } from "@/config/app";
import { modelLabel } from "@/config/models";
import type { Db } from "@/db";
import { articleTags, articles, folders, summaries, summaryTranslations, tags } from "@/db/schema";
import type { Messages } from "@/i18n/messages";
import { storedMessageText, type ErrorsTranslator } from "@/i18n/stored-message";

// "Export everything": one JSON file with all data, or one readable
// Markdown file in the reader's language.

/** A translator for the Export namespace, from getTranslations("Export") or createTranslator. */
export type ExportTranslator = ReturnType<typeof createTranslator<Messages, "Export">>;

export async function loadExport(db: Db, userId: string) {
  const [articleRows, summaryRows, folderRows, tagRows, links, translationRows] = await Promise.all([
    db.select().from(articles).where(eq(articles.userId, userId)).orderBy(asc(articles.savedAt)),
    db.select().from(summaries).where(eq(summaries.userId, userId)).orderBy(asc(summaries.createdAt)),
    db.select().from(folders).where(eq(folders.userId, userId)).orderBy(asc(folders.name)),
    db.select().from(tags).where(eq(tags.userId, userId)).orderBy(asc(tags.name)),
    db.select().from(articleTags).where(eq(articleTags.userId, userId)),
    db.select().from(summaryTranslations).where(eq(summaryTranslations.userId, userId)).orderBy(asc(summaryTranslations.createdAt)),
  ]);
  const folderName = new Map(folderRows.map((folder) => [folder.id, folder.name]));
  const tagName = new Map(tagRows.map((tag) => [tag.id, tag.name]));
  return {
    app: APP_NAME,
    format: 1,
    exportedAt: new Date().toISOString(),
    folders: folderRows.map((folder) => folder.name),
    tags: tagRows.map((tag) => tag.name),
    articles: articleRows.map((article) => ({
      id: article.id,
      url: article.url,
      normalizedUrl: article.normalizedUrl,
      title: article.title,
      author: article.author,
      siteName: article.siteName,
      publishedAt: article.publishedAt,
      language: article.lang,
      savedAt: article.savedAt,
      readAt: article.readAt,
      archivedAt: article.archivedAt,
      favorite: article.favorite,
      folder: article.folderId ? (folderName.get(article.folderId) ?? null) : null,
      tags: links.filter((link) => link.articleId === article.id).map((link) => tagName.get(link.tagId)).filter(Boolean),
      status: article.status,
      previewOnly: article.previewOnly,
      previewReason: article.previewReason,
      previewReasonMessage: article.previewReasonMessage,
      wordCount: article.wordCount,
      readingMinutes: article.readingMinutes,
      excerpt: article.excerpt,
      shownSummaryModel: article.summaryModel,
      summaries: summaryRows
        .filter((summary) => summary.articleId === article.id && summary.status === "ready")
        .map((summary) => ({
          model: summary.model,
          servedModel: summary.servedModel,
          language: summary.language,
          tldr: summary.tldr,
          keyPoints: summary.keyPoints,
          suggestedTags: summary.suggestedTags,
          partial: summary.partial,
          inputTokens: summary.inputTokens,
          outputTokens: summary.outputTokens,
          costUsd: summary.costUsd,
          durationMs: summary.durationMs,
          effort: summary.effort,
          completedAt: summary.completedAt,
          translations: translationRows
            .filter((translation) => translation.summaryId === summary.id && translation.status === "ready")
            .map((translation) => ({
              language: translation.language,
              tldr: translation.tldr,
              keyPoints: translation.keyPoints,
              model: translation.model,
              servedModel: translation.servedModel,
              costUsd: translation.costUsd,
              completedAt: translation.completedAt,
            })),
        })),
      text: article.textContent,
      html: article.contentHtml,
    })),
  };
}

export type ExportData = Awaited<ReturnType<typeof loadExport>>;

const day = (value: Date | string | null | undefined) => (value ? new Date(value).toISOString().slice(0, 10) : null);

export function exportToMarkdown(data: ExportData, t: ExportTranslator, tErrors: ErrorsTranslator): string {
  const out: string[] = [
    `# ${t("title", { app: data.app })}`,
    "",
    t("exported", { date: day(data.exportedAt) ?? "", count: data.articles.length }),
    "",
  ];
  for (const article of [...data.articles].reverse()) {
    out.push("---", "", `## ${article.title || article.url}`, "");
    out.push(`- ${t("url", { url: `<${article.url}>` })}`);
    const published = day(article.publishedAt);
    const source = [article.siteName, article.author, published && t("published", { date: published })].filter(Boolean);
    if (source.length) out.push(`- ${source.join(" · ")}`);
    const read = day(article.readAt);
    const state = [
      t("saved", { date: day(article.savedAt) ?? "" }),
      read ? t("read", { date: read }) : t("unread"),
      article.archivedAt ? t("archived") : t("inInbox"),
      article.favorite && t("favorite"),
    ].filter(Boolean);
    out.push(`- ${state.join(" · ")}`);
    if (article.folder) out.push(`- ${t("folder", { name: article.folder })}`);
    if (article.tags.length) out.push(`- ${t("tags", { tags: article.tags.map((tag) => `#${tag}`).join(", ") })}`);
    if (article.previewOnly) {
      const reason = storedMessageText(tErrors, article.previewReasonMessage, article.previewReason) ?? "";
      out.push(`- ${t("previewOnly", { reason })}`);
    }
    out.push("");
    const summary =
      article.summaries.find((row) => row.model === article.shownSummaryModel) ?? article.summaries.at(-1);
    if (summary) {
      out.push(`### ${t("summary", { model: modelLabel(summary.model) })}`, "", summary.tldr ?? "", "");
      for (const point of summary.keyPoints ?? []) out.push(`- ${point}`);
      out.push("");
      for (const translation of summary.translations) {
        // Select keys can't contain "-".
        out.push(`#### ${t("translation", { language: translation.language.replace("-", "_") })}`, "", translation.tldr ?? "", "");
        for (const point of translation.keyPoints ?? []) out.push(`- ${point}`);
        out.push("");
      }
    }
    if (article.text) out.push(`### ${t("article")}`, "", article.text, "");
  }
  return `${out.join("\n").trimEnd()}\n`;
}
