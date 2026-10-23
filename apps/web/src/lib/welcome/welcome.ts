import { and, eq } from "drizzle-orm";
import { JSDOM } from "jsdom";
import { APP_NAME } from "@/config/app";
import { appUrl } from "@/config/env";
import type { Db } from "@/db";
import { articleUrls, articles, summaries } from "@/db/schema";
import { LOCALE_COOKIE, isLocale, preferredLocale, type AppLocale } from "@/i18n/locales";
import { sanitizeArticleHtml } from "@/lib/extract/sanitize";
import { cleanText, textStats } from "@/lib/extract/text-stats";
import { refreshSearchVector } from "@/lib/search-index";
import { getSettings } from "@/lib/settings";
import { normalizeUrl } from "@/lib/urls";
import { WELCOME_CONTENT } from "./content";

// Every new account starts with a welcome article: a guide to the app, with
// a summary written by hand, in the language the app was shown in when the
// account was created. It is made from text in the repository, with no
// download and no Claude request, so it costs nothing and writes no ai_usage
// row. Otherwise it is an ordinary article: unread at the top of the Inbox,
// archivable and deletable. Saving its address, /articles/welcome, adds it
// again the same way, or moves it to the top if it is still there.

export const WELCOME_PATH = "/articles/welcome";

/** The welcome article's address, a page of the app itself that shows the guide. */
export function welcomeUrl(): string {
  return new URL(WELCOME_PATH, appUrl()).toString();
}

const bareHost = (host: string) => host.replace(/^www\./, "");

/** True for the welcome article's address, with or without www (the bare domain redirects to it). */
export function isWelcomeUrl(url: URL): boolean {
  return (
    (url.protocol === "https:" || url.protocol === "http:") &&
    bareHost(url.host) === bareHost(new URL(appUrl()).host) &&
    url.pathname.replace(/\/+$/, "") === WELCOME_PATH
  );
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

/** The id of the user's welcome article, if they still have it. */
export async function findWelcomeArticle(db: Db, userId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: articles.id })
    .from(articles)
    .where(and(eq(articles.userId, userId), eq(articles.normalizedUrl, normalizeUrl(welcomeUrl()))))
    .limit(1);
  return row?.id ?? null;
}

/** The guide in one language, its HTML sanitized as a saved article's is. */
export function welcomeGuide(locale: AppLocale) {
  const content = WELCOME_CONTENT[locale](APP_NAME);
  return { ...content, html: sanitizeArticleHtml(content.html) };
}

/**
 * Adds the welcome article, and returns its id. Adding it while the account
 * still has it does nothing, and returns null.
 */
export async function addWelcomeArticle(db: Db, userId: string, locale: AppLocale): Promise<string | null> {
  const content = welcomeGuide(locale);
  const html = content.html;
  const text = cleanText(new JSDOM(`<body>${html}</body>`).window.document.body.textContent ?? "");
  const { wordCount, readingMinutes } = textStats(text);
  const url = welcomeUrl();
  const normalizedUrl = normalizeUrl(new URL(url));
  // The model that translates the summary if asked: the user's default, as for any save.
  const { defaultModel } = await getSettings(db, userId);
  const now = new Date();

  return db.transaction(async (tx) => {
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
    if (!article) return null;
    await tx.insert(articleUrls).values({ userId, normalizedUrl, articleId: article.id }).onConflictDoNothing();
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
    return article.id;
  });
}
