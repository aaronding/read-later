// The welcome article every new account starts with: added by the account's
// create hook, from text in the repository, with no Claude request. PGlite
// stands in for Postgres.
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { APP_NAME } from "@/config/app";
import type { Db } from "@/db";
import { aiUsage, articles, jobs, summaries, users } from "@/db/schema";
import { LOCALES } from "@/i18n/locales";
import { deleteArticle, getArticle } from "@/lib/library";
import { processJobs } from "@/lib/jobs/process";
import { setAnthropicClient } from "@/lib/summarize/summarize";
import { requestTranslation } from "@/lib/translations";
import { WELCOME_CONTENT } from "@/lib/welcome/content";
import { saveArticle } from "@/lib/save";
import { updateSettings } from "@/lib/settings";
import { addWelcomeArticle, isWelcomeUrl, welcomeLocale, welcomeUrl } from "@/lib/welcome/welcome";
import { createTestDb, createTestUser } from "./db";

vi.mock("@vercel/functions", () => ({ waitUntil: () => {}, attachDatabasePool: () => {} }));

let db: Db;
let close: () => Promise<void>;
let claudeRequests = 0;
const saved = { ...process.env };

beforeAll(async () => {
  Object.assign(process.env, {
    APP_URL: "https://www.readsooner.example",
    BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret",
    GOOGLE_CLIENT_ID: "id",
    GOOGLE_CLIENT_SECRET: "secret",
    ALLOWED_EMAILS: "*",
    RUN_JOBS_AFTER_RESPONSE: "false",
  });
  ({ db, close } = await createTestDb());
  // Any request to Claude is counted, and fails.
  const refuse = () => {
    claudeRequests++;
    throw new Error("Claude must not be asked.");
  };
  setAnthropicClient({ messages: { stream: refuse, create: refuse }, beta: { messages: { stream: refuse, create: refuse } } } as never);
});

afterAll(async () => {
  setAnthropicClient(undefined);
  process.env = saved;
  await close();
});

beforeEach(async () => {
  await db.delete(users);
  claudeRequests = 0;
});

async function createAccount(email: string) {
  const { getAuth } = await import("@/lib/auth");
  const context = await getAuth().$context;
  return context.internalAdapter.createUser({ email, name: "New reader", emailVerified: true }, { method: "oauth" });
}

const welcomeArticles = (userId: string) => db.select().from(articles).where(eq(articles.userId, userId));

describe("a new account", () => {
  it("gets exactly one welcome article, with a ready summary written by hand", async () => {
    const user = await createAccount("new@example.com");
    const rows = await welcomeArticles(user.id);
    expect(rows).toHaveLength(1);
    const [article] = rows;
    const content = WELCOME_CONTENT.en(APP_NAME);
    expect(article).toMatchObject({
      url: welcomeUrl(),
      status: "ready",
      saveSource: "welcome",
      title: content.title,
      lang: "en",
      readAt: null,
      archivedAt: null,
      previewOnly: false,
    });
    expect(article!.contentHtml).toContain("<h2>");
    expect(article!.readingMinutes).toBeGreaterThanOrEqual(2);

    const found = await getArticle(db, user.id, article!.id);
    expect(found!.summaries).toHaveLength(1);
    expect(found!.summaries[0]).toMatchObject({
      status: "ready",
      handWritten: true,
      model: article!.summaryModel,
      language: "en",
      tldr: content.tldr,
      keyPoints: content.keyPoints,
      costUsd: null,
    });
    // Found by search, through its summary and text.
    expect(article!.searchVector).toContain("triage");
  });

  it("makes no Claude request, queues no job and writes no ai_usage row", async () => {
    const user = await createAccount("new@example.com");
    expect(await processJobs({ db, timeBudgetMs: 1000 })).toMatchObject({ claimed: 0 });
    expect(claudeRequests).toBe(0);
    expect(await db.select().from(jobs).where(eq(jobs.userId, user.id))).toEqual([]);
    expect(await db.select().from(aiUsage).where(eq(aiUsage.userId, user.id))).toEqual([]);
  });

  it("can be deleted like any article", async () => {
    const user = await createAccount("new@example.com");
    const [article] = await welcomeArticles(user.id);
    await deleteArticle(db, user.id, article!.id);
    expect(await welcomeArticles(user.id)).toEqual([]);
    expect(await db.select().from(summaries).where(eq(summaries.userId, user.id))).toEqual([]);
  });

  it("can have its summary translated by the default model, as an ordinary request", async () => {
    const user = await createAccount("new@example.com");
    const [summary] = await db.select().from(summaries).where(eq(summaries.userId, user.id));
    const translation = await requestTranslation(db, { userId: user.id, summaryId: summary!.id, language: "fr" });
    expect(translation).toMatchObject({ status: "pending", model: summary!.model });
  });
});

describe("saving the welcome article's address", () => {
  it("is the app's own /articles/welcome, with or without www", () => {
    expect(welcomeUrl()).toBe("https://www.readsooner.example/articles/welcome");
    expect(isWelcomeUrl(new URL("https://readsooner.example/articles/welcome"))).toBe(true);
    expect(isWelcomeUrl(new URL("https://www.readsooner.example/articles/welcome/?utm_source=x"))).toBe(true);
    expect(isWelcomeUrl(new URL("https://www.readsooner.example/articles/other"))).toBe(false);
    expect(isWelcomeUrl(new URL("https://elsewhere.example/articles/welcome"))).toBe(false);
  });

  it("adds it back after it was deleted, from the repository's text, in the app's language", async () => {
    const user = await createAccount("new@example.com");
    const [first] = await welcomeArticles(user.id);
    await deleteArticle(db, user.id, first!.id);

    const result = await saveArticle(db, {
      userId: user.id,
      url: "https://readsooner.example/articles/welcome",
      html: "<html><body><p>Whatever the browser sent.</p></body></html>",
      source: "extension",
      acceptLanguage: "fr-FR,fr;q=0.9",
    });
    expect(result).toMatchObject({ outcome: "created", queued: false });
    const rows = await welcomeArticles(user.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: result.articleId, url: welcomeUrl(), lang: "fr", title: WELCOME_CONTENT.fr(APP_NAME).title });
    expect(rows[0]!.submittedHtml).toBeNull();
    const [summary] = await db.select().from(summaries).where(eq(summaries.articleId, result.articleId));
    expect(summary).toMatchObject({ handWritten: true, language: "fr" });
    expect(await db.select().from(jobs).where(eq(jobs.userId, user.id))).toEqual([]);
    expect(await db.select().from(aiUsage).where(eq(aiUsage.userId, user.id))).toEqual([]);
    expect(claudeRequests).toBe(0);
  });

  it("uses the language chosen in Settings over the browser's", async () => {
    const user = await createAccount("new@example.com");
    const [first] = await welcomeArticles(user.id);
    await deleteArticle(db, user.id, first!.id);
    await updateSettings(db, user.id, { locale: "zh-Hant" });
    await saveArticle(db, { userId: user.id, url: welcomeUrl(), source: "web", acceptLanguage: "fr" });
    expect((await welcomeArticles(user.id))[0]).toMatchObject({ lang: "zh-Hant" });
  });

  it("moves it back to the top of the Inbox while it is still there", async () => {
    const user = await createAccount("new@example.com");
    const [first] = await welcomeArticles(user.id);
    const archived = new Date("2026-01-01T00:00:00Z");
    await db.update(articles).set({ savedAt: archived, archivedAt: archived }).where(eq(articles.id, first!.id));

    const result = await saveArticle(db, { userId: user.id, url: welcomeUrl(), source: "web" });
    expect(result).toEqual({ articleId: first!.id, outcome: "resaved", queued: false });
    const [moved] = await welcomeArticles(user.id);
    expect(moved!.archivedAt).toBeNull();
    expect(moved!.savedAt.getTime()).toBeGreaterThan(archived.getTime());
    expect(await db.select().from(jobs).where(eq(jobs.userId, user.id))).toEqual([]);
  });
});

describe("an existing account", () => {
  it("gets nothing when it signs in", async () => {
    const user = await createTestUser(db, "owner@example.com", "existing");
    const { getAuth } = await import("@/lib/auth");
    const context = await getAuth().$context;
    await context.internalAdapter.createSession(user.id);
    expect(await welcomeArticles(user.id)).toEqual([]);
  });

  it("isn't given a second one if the welcome is added again", async () => {
    const user = await createAccount("new@example.com");
    await addWelcomeArticle(db, user.id, "fr");
    expect(await welcomeArticles(user.id)).toHaveLength(1);
    expect(await db.select().from(summaries).where(eq(summaries.userId, user.id))).toHaveLength(1);
  });
});

describe("the welcome article's language", () => {
  it("is the one last chosen on this browser, else the browser's, else English", () => {
    expect(welcomeLocale(new Headers({ "accept-language": "fr-CA,fr;q=0.9,en;q=0.8" }))).toBe("fr");
    expect(welcomeLocale(new Headers({ "accept-language": "zh-TW" }))).toBe("zh-Hant");
    expect(welcomeLocale(new Headers({ "accept-language": "fr", cookie: "a=b; locale=zh-Hans" }))).toBe("zh-Hans");
    expect(welcomeLocale(new Headers({ cookie: "locale=xx" }))).toBe("en");
    expect(welcomeLocale(null)).toBe("en");
  });

  it.each(LOCALES)("is written and summarized in %s", async (locale) => {
    const user = await createTestUser(db, `${locale}@example.com`, `user-${locale}`);
    await addWelcomeArticle(db, user.id, locale);
    const [article] = await welcomeArticles(user.id);
    const content = WELCOME_CONTENT[locale](APP_NAME);
    expect(article).toMatchObject({ lang: locale, title: content.title });
    const [summary] = await db.select().from(summaries).where(eq(summaries.articleId, article!.id));
    expect(summary).toMatchObject({ language: locale, tldr: content.tldr, handWritten: true });
    // Every link is to one of the app's own pages, and none was lost to sanitizing.
    const links = [...article!.contentHtml!.matchAll(/href="([^"]*)"/g)].map((match) => match[1]);
    expect(links).toEqual(["/settings", "/about", "/privacy"]);
  });
});
