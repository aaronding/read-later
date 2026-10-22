import { asc, eq } from "drizzle-orm";
import { APP_NAME } from "@/config/app";
import { modelLabel } from "@/config/models";
import type { Db } from "@/db";
import { articleTags, articles, folders, summaries, tags } from "@/db/schema";

// "Export everything": one JSON file with all data, or one readable
// Markdown file.

export async function loadExport(db: Db, userId: string) {
  const [articleRows, summaryRows, folderRows, tagRows, links] = await Promise.all([
    db.select().from(articles).where(eq(articles.userId, userId)).orderBy(asc(articles.savedAt)),
    db.select().from(summaries).where(eq(summaries.userId, userId)).orderBy(asc(summaries.createdAt)),
    db.select().from(folders).where(eq(folders.userId, userId)).orderBy(asc(folders.name)),
    db.select().from(tags).where(eq(tags.userId, userId)).orderBy(asc(tags.name)),
    db.select().from(articleTags).where(eq(articleTags.userId, userId)),
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
        })),
      text: article.textContent,
      html: article.contentHtml,
    })),
  };
}

export type ExportData = Awaited<ReturnType<typeof loadExport>>;

const day = (value: Date | string | null | undefined) => (value ? new Date(value).toISOString().slice(0, 10) : null);

export function exportToMarkdown(data: ExportData): string {
  const out: string[] = [
    `# ${data.app} export`,
    "",
    `Exported ${day(data.exportedAt)} · ${data.articles.length} article${data.articles.length === 1 ? "" : "s"}`,
    "",
  ];
  for (const article of [...data.articles].reverse()) {
    out.push("---", "", `## ${article.title || article.url}`, "");
    out.push(`- URL: <${article.url}>`);
    const source = [article.siteName, article.author, article.publishedAt && `published ${day(article.publishedAt)}`].filter(Boolean);
    if (source.length) out.push(`- ${source.join(" · ")}`);
    const state = [
      `saved ${day(article.savedAt)}`,
      article.readAt ? `read ${day(article.readAt)}` : "unread",
      article.archivedAt ? "archived" : "in Inbox",
      article.favorite && "★ favorite",
    ].filter(Boolean);
    out.push(`- ${state.join(" · ")}`);
    if (article.folder) out.push(`- Folder: ${article.folder}`);
    if (article.tags.length) out.push(`- Tags: ${article.tags.map((tag) => `#${tag}`).join(", ")}`);
    if (article.previewOnly) out.push(`- Preview only: ${article.previewReason ?? ""}`);
    out.push("");
    const summary =
      article.summaries.find((row) => row.model === article.shownSummaryModel) ?? article.summaries.at(-1);
    if (summary) {
      out.push(`### Summary (${modelLabel(summary.model)})`, "", summary.tldr ?? "", "");
      for (const point of summary.keyPoints ?? []) out.push(`- ${point}`);
      out.push("");
    }
    if (article.text) out.push("### Article", "", article.text, "");
  }
  return `${out.join("\n").trimEnd()}\n`;
}
