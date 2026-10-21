import { createHash } from "node:crypto";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import { downloadUserAgent } from "@/config/app";
import { envInt } from "@/config/env";
import { isSummaryModel, type SummaryModel } from "@/config/models";
import type { Db } from "@/db";
import { articles, summaries, tags, type Article, type ContentSource, type Job } from "@/db/schema";
import { extractArticle, type ExtractedArticle } from "@/lib/extract/extract";
import { previewIsSummarizable } from "@/lib/extract/paywall";
import { decodeHtml, isHtmlContentType } from "@/lib/net/decode";
import { FetchError, safeFetch, type SafeFetchResponse } from "@/lib/net/safe-fetch";
import { refreshSearchVector } from "@/lib/search-index";
import { getSettings, modelsForNewSave } from "@/lib/settings";
import { SummaryError, summarizeArticle } from "@/lib/summarize/summarize";
import { trustedCanonicalUrl, normalizeUrl } from "@/lib/urls";
import { JobError } from "./errors";
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
        set: { status: "pending", error: null, stopReason: null },
      });
    if (!(await hasQueuedJob(tx, articleId, "summarize", model))) {
      await enqueueJob(tx, { userId, articleId, type: "summarize", payload: { model } });
    }
  });
}

async function download(url: string): Promise<SafeFetchResponse> {
  let response: SafeFetchResponse;
  try {
    response = await safeFetch(url, {
      userAgent: downloadUserAgent(),
      timeoutMs: envInt("FETCH_TIMEOUT_MS", 15_000),
      maxBytes: envInt("FETCH_MAX_BYTES", 5 * 1024 * 1024),
    });
  } catch (error) {
    if (error instanceof FetchError) throw new JobError(error.message, error.retryable);
    throw error;
  }
  const { status } = response;
  if (status === 404 || status === 410) {
    throw new JobError(`The page was not found (HTTP ${status}).`, false);
  }
  if (status === 408 || status === 429 || status >= 500) {
    throw new JobError(`The site could not serve the page right now (HTTP ${status}).`, true);
  }
  // 401, 402 and 403 are kept: extraction flags them as "Preview only".
  if (status >= 400 && ![401, 402, 403].includes(status)) {
    throw new JobError(`The site refused the download (HTTP ${status}).`, false);
  }
  if (!isHtmlContentType(response.contentType)) {
    const type = response.contentType.split(";")[0]?.trim();
    throw new JobError(`This link is not a web page (${type}). Only web pages can be saved for now.`, false);
  }
  return response;
}

/**
 * The duplicate key after processing: the trusted canonical URL, or for our
 * own downloads the URL we ended up at after redirects (link shorteners).
 * Left unchanged if another saved article already uses it.
 */
async function bestNormalizedUrl(db: Db, article: Article, pageUrl: string, canonicalHref: string | null) {
  const candidate =
    trustedCanonicalUrl(pageUrl, canonicalHref) ?? (pageUrl !== article.url ? normalizeUrl(pageUrl) : null);
  if (!candidate || candidate === article.normalizedUrl) return article.normalizedUrl;
  const [clash] = await db
    .select({ id: articles.id })
    .from(articles)
    .where(and(eq(articles.userId, article.userId), eq(articles.normalizedUrl, candidate), ne(articles.id, article.id)))
    .limit(1);
  return clash ? article.normalizedUrl : candidate;
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
    extracted = extractArticle({
      html: submitted,
      url: article.url,
      contentSource,
      fallbackTitle: article.submittedTitle,
    });
  } else {
    contentSource = "server";
    const response = await download(article.url);
    pageUrl = response.url;
    extracted = extractArticle({
      html: decodeHtml(response.body, response.contentType),
      url: response.url,
      contentSource,
      httpStatus: response.status,
      fallbackTitle: article.submittedTitle,
    });
  }

  // Never replace a complete copy with a preview.
  const keepExisting = Boolean(article.contentHtml && !article.previewOnly && extracted.previewOnly);
  const normalizedUrl = await bestNormalizedUrl(db, article, pageUrl, extracted.canonicalHref);
  const wantSummaries =
    !keepExisting && extracted.wordCount >= MIN_SUMMARY_WORDS && previewIsSummarizable(extracted.previewKind);

  // The article and its summary requests are stored together: if the process
  // dies in between, the job runs again instead of leaving no summaries.
  await db.transaction(async (tx) => {
    await tx
      .update(articles)
      .set({
        status: "ready",
        error: null,
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
              previewReason: extracted.previewReason,
            }),
      })
      .where(eq(articles.id, article.id));
    await refreshSearchVector(tx, article.id);

    // A login page or an empty page has nothing worth summarizing.
    if (!wantSummaries) return;

    // New content: summarize with the models for a new save, plus any model
    // that already summarized an earlier (preview) copy.
    const settings = await getSettings(tx, job.userId);
    const earlier = await tx
      .select({ model: summaries.model })
      .from(summaries)
      .where(eq(summaries.articleId, article.id));
    const models = new Set<SummaryModel>(modelsForNewSave(settings));
    for (const { model } of earlier) if (isSummaryModel(model)) models.add(model);
    const primary = isSummaryModel(article.summaryModel) ? article.summaryModel : settings.defaultModel;
    if (primary !== article.summaryModel) {
      await tx.update(articles).set({ summaryModel: primary }).where(eq(articles.id, article.id));
    }
    for (const model of models) {
      await requestSummary(tx, { userId: job.userId, articleId: article.id, model });
    }
  });
}

export async function processArticleFailed(db: Db, job: Job, message: string, willRetry: boolean): Promise<void> {
  if (!job.articleId) return;
  await db
    .update(articles)
    .set({ status: willRetry ? "pending" : "failed", error: message })
    .where(and(eq(articles.id, job.articleId), eq(articles.userId, job.userId)));
}

function jobModel(job: Job): SummaryModel {
  const model = job.payload.model;
  if (!isSummaryModel(model)) throw new JobError(`Unknown summary model: ${String(model)}`, false);
  return model;
}

/** Summarize with one model and store the result. */
export async function summarize(db: Db, job: Job): Promise<void> {
  const model = jobModel(job);
  const article = await loadArticle(db, job);
  if (!article) return;
  if (!article.textContent) throw new JobError("There is no article text to summarize.", false);

  const summaryWhere = and(eq(summaries.articleId, article.id), eq(summaries.model, model), eq(summaries.userId, job.userId));
  await db.update(summaries).set({ status: "running", error: null }).where(summaryWhere);

  const existingTags = await db
    .select({ name: tags.name })
    .from(tags)
    .where(eq(tags.userId, job.userId))
    .orderBy(asc(tags.name))
    .limit(200);

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
    });
  } catch (error) {
    if (error instanceof SummaryError) throw new JobError(error.message, error.retryable, error.stopReason);
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
    completedAt: new Date(),
  };
  await db
    .insert(summaries)
    .values({ userId: job.userId, articleId: article.id, model, ...values })
    .onConflictDoUpdate({ target: [summaries.articleId, summaries.model], set: values });
  await refreshSearchVector(db, article.id);
}

export async function summarizeFailed(db: Db, job: Job, message: string, willRetry: boolean, stopReason: string | null) {
  if (!job.articleId || !isSummaryModel(job.payload.model)) return;
  await db
    .update(summaries)
    .set({ status: willRetry ? "pending" : "failed", error: message, stopReason })
    .where(
      and(
        eq(summaries.articleId, job.articleId),
        eq(summaries.model, job.payload.model),
        eq(summaries.userId, job.userId),
      ),
    );
}
