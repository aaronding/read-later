import { JSDOM } from "jsdom";
import { APP_NAME } from "@/config/app";
import { appUrl } from "@/config/env";
import type { Db } from "@/db";
import { articles, summaries } from "@/db/schema";
import { LOCALE_COOKIE, isLocale, preferredLocale, type AppLocale } from "@/i18n/locales";
import { sanitizeArticleHtml } from "@/lib/extract/sanitize";
import { cleanText, textStats } from "@/lib/extract/text-stats";
import { rememberUrls } from "@/lib/save";
import { refreshSearchVector } from "@/lib/search-index";
import { getSettings } from "@/lib/settings";
import { normalizeUrl } from "@/lib/urls";
import { WELCOME_CONTENT } from "./content";

// Every new account starts with a welcome article: a guide to the app, with
// a summary written by hand, in the language the app was shown in when the
// account was created. It is made from text in the repository, with no
// download and no Claude request, so it costs nothing and writes no ai_usage
// row. Otherwise it is an ordinary article: unread at the top of the Inbox,
// archivable and deletable.

/**
 * The welcome article's address: the app's own About page, which no article
 * from another site shares. Saving that page later finds the welcome article.
 */
export function welcomeUrl(): string {
  return new URL("/about", appUrl()).toString();
}

/**
 * The language a new account's welcome article is in: as for any signed-out
 * page, the language last chosen on this browser, else the browser's own.
 */
export function welcomeLocale(headers: Headers | null | undefined): AppLocale {
  const remembered = headers
    ?.get("cookie")
    ?.split(";")
    .map((part) => part.trim().split("="))
    .find(([name]) => name === LOCALE_COOKIE)?.[1];
  return preferredLocale(isLocale(remembered) ? remembered : null, headers?.get("accept-language"));
}

/** Adds the welcome article to a new account. Adding it again does nothing. */
export async function addWelcomeArticle(db: Db, userId: string, locale: AppLocale): Promise<void> {
  const content = WELCOME_CONTENT[locale](APP_NAME);
  const html = sanitizeArticleHtml(content.html);
  const text = cleanText(new JSDOM(`<body>${html}</body>`).window.document.body.textContent ?? "");
  const { wordCount, readingMinutes } = textStats(text);
  const url = welcomeUrl();
  const normalizedUrl = normalizeUrl(new URL(url));
  // The model that translates the summary if asked: the user's default, as for any save.
  const { defaultModel } = await getSettings(db, userId);
  const now = new Date();

  await db.transaction(async (tx) => {
    const [article] = await tx
      .insert(articles)
      .values({
        userId,
        url,
        normalizedUrl,
        status: "ready",
        saveSource: "welcome",
        title: content.title,
        siteName: APP_NAME,
        lang: locale,
        excerpt: content.tldr,
        contentHtml: html,
        textContent: text,
        wordCount,
        readingMinutes,
        summaryModel: defaultModel,
        savedAt: now,
      })
      .onConflictDoNothing()
      .returning();
    if (!article) return;
    await rememberUrls(tx, article, [normalizedUrl]);
    await tx.insert(summaries).values({
      userId,
      articleId: article.id,
      model: defaultModel,
      status: "ready",
      handWritten: true,
      language: locale,
      tldr: content.tldr,
      keyPoints: content.keyPoints,
      suggestedTags: [APP_NAME],
      completedAt: now,
    });
    await refreshSearchVector(tx, article.id);
  });
}
