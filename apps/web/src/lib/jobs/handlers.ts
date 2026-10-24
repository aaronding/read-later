import { createHash } from "node:crypto";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import { downloadUserAgent } from "@/config/app";
import { envInt, isEmailAdmin } from "@/config/env";
import { isSummaryModel, type SummaryModel } from "@/config/models";
import type { Db } from "@/db";
import { articleUrls, articles, summaries, tags, users, type Article, type ContentSource, type Job } from "@/db/schema";
import { englishText } from "@/i18n/stored-message";
import { errorMessage } from "@/lib/error-message";
import { extractArticle, PageTooLargeError, type ExtractedArticle, type ExtractInput } from "@/lib/extract/extract";
import { previewIsSummarizable, previewKindOfReason, type PreviewKind } from "@/lib/extract/paywall";
import { decodeHtml, isHtmlContentType } from "@/lib/net/decode";
import { FetchError, safeFetch, type SafeFetchResponse } from "@/lib/net/safe-fetch";
import { refreshSearchVector } from "@/lib/search-index";
import { getSettings, modelsForNewSave } from "@/lib/settings";
import { SummaryError, summarizeArticle } from "@/lib/summarize/summarize";
import { SUMMARY_TAG_LIMIT } from "@/lib/summarize/prompt";
import { trustedCanonicalUrl, normalizeUrl } from "@/lib/urls";
import { retranslate } from "@/lib/translations";
import { recordUsage } from "@/lib/usage";
import { getAllowance } from "@/lib/allowance";
import { rememberUrls } from "@/lib/save";
import { JobError, type JobFailure } from "./errors";
import { enqueueJob, hasQueuedJob } from "./queue";

/** Below this, there is not enough text for a useful summary. */
export const MIN_SUMMARY_WORDS = 40;

async function loadArticle(db: Db, job: Job): Promise<Article | undefined> {
  if (!job.articleId) return undefined;
  const [article] = await db
    .select()
    .from(articles)
    .where(and(eq(articles.id, job.articleId), eq(articles.userId, job.userId)))
    .limit(1);
  return article;
}

/**
 * Marks a summary as wanted and queues it, unless a run is already waiting.
 * Both happen together, so a summary is never left "pending" with no job.
 */
export async function requestSummary(
  db: Db,
  { userId, articleId, model }: { userId: string; articleId: string; model: SummaryModel },
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .insert(summaries)
      .values({ userId, articleId, model, status: "pending" })
      .onConflictDoUpdate({
        target: [summaries.articleId, summaries.model],
        set: { status: "pending", error: null, errorMessage: null, stopReason: null },
      });
    if (!(await hasQueuedJob(tx, articleId, "summarize", { model }))) {
      await enqueueJob(tx, { userId, articleId, type: "summarize", payload: { model } });
    }
  });
}

/** extractArticle, with a page too large to parse failing the job for good. */
function extract(input: ExtractInput): ExtractedArticle {
  try {
    return extractArticle(input);
  } catch (error) {
    if (error instanceof PageTooLargeError) throw new JobError(error.storedMessage, false);
    throw error;
  }
}

async function download(url: string): Promise<SafeFetchResponse> {
  let response: SafeFetchResponse;
  try {
    response = await safeFetch(url, {
      userAgent: downloadUserAgent(),
      timeoutMs: envInt("FETCH_TIMEOUT_MS", 15_000),
      maxBytes: envInt("FETCH_MAX_BYTES", 10 * 1024 * 1024),
    });
  } catch (error) {
    if (error instanceof FetchError) throw new JobError(error.storedMessage, error.retryable);
    throw error;
  }
  const { status } = response;
  const values = { status: String(status) };
  if (status === 404 || status === 410) {
    throw new JobError(errorMessage("download.notFound", values), false);
  }
  if (status === 408 || status === 429 || status >= 500) {
    throw new JobError(errorMessage("download.unavailable", values), true);
  }
  // 401, 402 and 403 are kept: extraction flags them as "Preview only".
  if (status >= 400 && ![401, 402, 403].includes(status)) {
    throw new JobError(errorMessage("download.refused", values), false);
  }
  if (!isHtmlContentType(response.contentType)) {
    const type = response.contentType.split(";")[0]?.trim() ?? "";
    throw new JobError(errorMessage("download.notWebPage", { type }), false);
  }
  return response;
}

/** The addresses the page itself names: its trusted canonical URL, and for our own downloads where redirects ended (link shorteners). */
function pageKeys(article: Article, pageUrl: string, canonicalHref: string | null): string[] {
  const canonical = trustedCanonicalUrl(pageUrl, canonicalHref);
  const landed = pageUrl !== article.url ? normalizeUrl(pageUrl) : null;
  return [canonical, landed].filter((key): key is string => key !== null);
}

/**
 * The duplicate key after processing: the first of the page's own addresses,
 * left unchanged if another saved article already has it.
 */
async function bestNormalizedUrl(db: Db, article: Article, keys: string[]) {
  const candidate = keys[0];
  if (!candidate || candidate === article.normalizedUrl) return article.normalizedUrl;
  const [clash] = await db
    .select({ id: articles.id })
    .from(articles)
    .where(and(eq(articles.userId, article.userId), eq(articles.normalizedUrl, candidate), ne(articles.id, article.id)))
    .limit(1);
  const [remembered] = await db
    .select({ articleId: articleUrls.articleId })
    .from(articleUrls)
    .where(and(eq(articleUrls.userId, article.userId), eq(articleUrls.normalizedUrl, candidate), ne(articleUrls.articleId, article.id)))
    .limit(1);
  return clash || remembered ? article.normalizedUrl : candidate;
}

/**
 * How good a copy is: a complete one beats any preview, and a preview that
 * gets summarized (a teaser or a subscriber-only page's free part) beats one
 * that doesn't (a login page, no article, too short).
 */
function copyRank(previewOnly: boolean, kind: PreviewKind | null, wordCount: number): number {
  if (!previewOnly) return 2;
  return previewIsSummarizable(kind) && wordCount >= MIN_SUMMARY_WORDS ? 1 : 0;
}

/**
 * True when the stored copy is at least as good as the new one, so the new
 * one is thrown away: it ranks lower, or is a preview of the same rank and no
 * longer. Saving a preview again then changes nothing, and asks for no
 * summary, unless the page now gives more.
 */
function keepsStoredCopy(article: Article, extracted: ExtractedArticle): boolean {
  if (!article.contentHtml) return false;
  const stored = copyRank(article.previewOnly, previewKindOfReason(article.previewReasonMessage?.key), article.wordCount ?? 0);
  const fresh = copyRank(extracted.previewOnly, extracted.previewKind, extracted.wordCount);
  return fresh < stored || (fresh === stored && extracted.previewOnly && extracted.wordCount <= (article.wordCount ?? 0));
}

/** Download (if needed), extract, store, then queue the summaries. */
export async function processArticle(db: Db, job: Job): Promise<void> {
  const article = await loadArticle(db, job);
  if (!article) return; // deleted since it was queued
  const submitted = article.submittedHtml;
  // Another job may already have done the work.
  if (!submitted && article.status === "ready" && article.contentHtml && !article.previewOnly) return;

  await db.update(articles).set({ status: "processing" }).where(eq(articles.id, article.id));

  let extracted: ExtractedArticle;
  let contentSource: ContentSource;
  let pageUrl = article.url;
  if (submitted) {
    contentSource = "client";
    extracted = extract({
      html: submitted,
      url: article.url,
      contentSource,
      fallbackTitle: article.submittedTitle,
    });
  } else {
    contentSource = "server";
    const response = await download(article.url);
    pageUrl = response.url;
    extracted = extract({
      html: decodeHtml(response.body, response.contentType),
      url: response.url,
      contentSource,
      httpStatus: response.status,
      fallbackTitle: article.submittedTitle,
    });
  }

  const keepExisting = keepsStoredCopy(article, extracted);
  // A copy that is thrown away says nothing about the article's addresses,
  // and where a bot check's redirects ended is the check's address.
  const browserCheck = extracted.previewReason?.key === "preview.browserCheck";
  const keys = keepExisting || browserCheck ? [] : pageKeys(article, pageUrl, extracted.canonicalHref);
  const normalizedUrl = await bestNormalizedUrl(db, article, keys);
  const wantSummaries =
    !keepExisting && extracted.wordCount >= MIN_SUMMARY_WORDS && previewIsSummarizable(extracted.previewKind);
  const previewReason = extracted.previewReason ? await englishText(extracted.previewReason) : null;

  // The article and its summary requests are stored together: if the process
  // dies in between, the job runs again instead of leaving no summaries.
  await db.transaction(async (tx) => {
    await tx
      .update(articles)
      .set({
        status: "ready",
        error: null,
        errorMessage: null,
        normalizedUrl,
        // Cleared only if it is still the HTML processed here; a newer save
        // that arrived meanwhile keeps its HTML for its own job.
        ...(submitted
          ? {
              submittedHtml: sql`CASE WHEN md5(${articles.submittedHtml}) = ${createHash("md5").update(submitted, "utf8").digest("hex")} THEN NULL ELSE ${articles.submittedHtml} END`,
            }
          : {}),
        ...(keepExisting
          ? {}
          : {
              contentSource,
              title: extracted.title,
              author: extracted.author,
              siteName: extracted.siteName,
              publishedAt: extracted.publishedAt,
              lang: extracted.lang,
              excerpt: extracted.excerpt,
              contentHtml: extracted.contentHtml,
              textContent: extracted.textContent,
              wordCount: extracted.wordCount,
              readingMinutes: extracted.readingMinutes,
              previewOnly: extracted.previewOnly,
              previewReason,
              previewReasonMessage: extracted.previewReason,
            }),
      })
      .where(eq(articles.id, article.id));
    await rememberUrls(tx, article, [normalizedUrl, article.normalizedUrl, ...keys]);
    await refreshSearchVector(tx, article.id);

    // A login page or an empty page has nothing worth summarizing.
    if (!wantSummaries) return;

    // New content: an admin's save runs the models for a new save, plus any
    // model that already summarized an earlier (preview) copy. Anyone else's
    // runs only the summary they are shown, so comparing models stays an
    // admin's cost.
    const settings = await getSettings(tx, job.userId);
    const [owner] = await tx.select({ email: users.email }).from(users).where(eq(users.id, job.userId)).limit(1);
    const admin = isEmailAdmin(owner?.email);
    const primary = isSummaryModel(article.summaryModel) ? article.summaryModel : settings.defaultModel;
    if (primary !== article.summaryModel) {
      await tx.update(articles).set({ summaryModel: primary }).where(eq(articles.id, article.id));
    }
    const models = new Set<SummaryModel>(admin ? modelsForNewSave(settings, true) : [primary]);
    if (admin) {
      const earlier = await tx
        .select({ model: summaries.model })
        .from(summaries)
        .where(eq(summaries.articleId, article.id));
      for (const { model } of earlier) if (isSummaryModel(model)) models.add(model);
    }
    for (const model of models) {
      await requestSummary(tx, { userId: job.userId, articleId: article.id, model });
    }
  });
}

/**
 * An article with no copy yet waits for the next try, or has failed. One that
 * already has a copy, downloaded again because it was saved again, keeps it
 * and stays readable; the failure is only the job's.
 */
export async function processArticleFailed(db: Db, job: Job, failure: JobFailure): Promise<void> {
  if (!job.articleId) return;
  const hasCopy = sql`${articles.contentHtml} IS NOT NULL`;
  await db
    .update(articles)
    .set({
      status: sql`CASE WHEN ${hasCopy} THEN 'ready' ELSE ${failure.willRetry ? "pending" : "failed"} END`,
      error: sql`CASE WHEN ${hasCopy} THEN NULL ELSE ${failure.text} END`,
      errorMessage: sql`CASE WHEN ${hasCopy} THEN NULL ELSE ${JSON.stringify(failure.message)}::jsonb END`,
    })
    .where(and(eq(articles.id, job.articleId), eq(articles.userId, job.userId)));
}

function jobModel(job: Job): SummaryModel {
  const model = job.payload.model;
  if (!isSummaryModel(model)) throw new JobError(errorMessage("summary.unknownModel", { model: String(model) }), false);
  return model;
}

/** Summarize with one model and store the result. */
export async function summarize(db: Db, job: Job): Promise<void> {
  const model = jobModel(job);
  const article = await loadArticle(db, job);
  if (!article) return;
  if (!article.textContent) throw new JobError(errorMessage("summary.noText"), false);
  // Used up: the summary waits for Retry next month. Answers already under way finish.
  if ((await getAllowance(db, job.userId)).reached) throw new JobError(errorMessage("summary.monthlyLimit"), false);

  const summaryWhere = and(eq(summaries.articleId, article.id), eq(summaries.model, model), eq(summaries.userId, job.userId));
  const [running] = await db
    .update(summaries)
    .set({ status: "running", error: null, errorMessage: null })
    .where(summaryWhere)
    .returning({ id: summaries.id });

  const existingTags = await db
    .select({ name: tags.name })
    .from(tags)
    .where(eq(tags.userId, job.userId))
    .orderBy(asc(tags.name))
    .limit(SUMMARY_TAG_LIMIT);

  let result;
  try {
    result = await summarizeArticle({
      model,
      existingTags: existingTags.map((tag) => tag.name),
      article: {
        title: article.title,
        siteName: article.siteName,
        url: article.url,
        author: article.author,
        publishedAt: article.publishedAt,
        text: article.textContent,
        previewOnly: article.previewOnly,
      },
      onAnswer: (usage) =>
        recordUsage(
          db,
          { userId: job.userId, articleId: article.id, summaryId: running?.id ?? null, kind: "summary", model },
          usage,
        ),
    });
  } catch (error) {
    if (error instanceof SummaryError) throw new JobError(error.storedMessage, error.retryable, error.stopReason);
    throw error;
  }

  const values = {
    status: "ready" as const,
    servedModel: result.servedModel,
    effort: result.effort,
    language: result.language,
    tldr: result.tldr,
    keyPoints: result.keyPoints,
    suggestedTags: result.suggestedTags,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    costUsd: result.costUsd,
    durationMs: result.durationMs,
    partial: result.partial,
    inputChars: result.inputChars,
    totalChars: result.totalChars,
    stopReason: result.stopReason,
    error: null,
    errorMessage: null,
    completedAt: new Date(),
  };
  // The new text and the requests to translate it again are stored together.
  await db.transaction(async (tx) => {
    const [stored] = await tx
      .insert(summaries)
      .values({ userId: job.userId, articleId: article.id, model, ...values })
      .onConflictDoUpdate({ target: [summaries.articleId, summaries.model], set: values })
      .returning();
    await retranslate(tx, stored!);
  });
  await refreshSearchVector(db, article.id);
}

export async function summarizeFailed(db: Db, job: Job, failure: JobFailure): Promise<void> {
  if (!job.articleId || !isSummaryModel(job.payload.model)) return;
  await db
    .update(summaries)
    .set({
      status: failure.willRetry ? "pending" : "failed",
      error: failure.text,
      errorMessage: failure.message,
      stopReason: failure.stopReason,
    })
    .where(
      and(
        eq(summaries.articleId, job.articleId),
        eq(summaries.model, job.payload.model),
        eq(summaries.userId, job.userId),
      ),
    );
}
