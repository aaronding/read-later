import { and, asc, eq, sql } from "drizzle-orm";
import { isSummaryModel } from "@/config/models";
import type { Db } from "@/db";
import { jobs, summaries, summaryTranslations, type Job, type Summary, type SummaryTranslation } from "@/db/schema";
import { englishText } from "@/i18n/stored-message";
import { errorMessage } from "@/lib/error-message";
import { JobError, type JobFailure } from "@/lib/jobs/errors";
import { enqueueJob } from "@/lib/jobs/queue";
import { refreshSearchVector } from "@/lib/search-index";
import {
  MAX_TRANSLATION_RUNS_PER_SUMMARY,
  MAX_TRANSLATIONS_PER_SUMMARY,
  isTranslationLanguage,
  translationTargets,
} from "@/lib/summarize/languages";
import { SummaryError } from "@/lib/summarize/summarize";
import { translateSummary } from "@/lib/summarize/translate";
import { getAllowance } from "@/lib/allowance";
import { fillUsage, releaseRun, reserveRun, translationRuns, type UsageOwner } from "@/lib/usage";

// Translations of summaries: asked for in the reader, made by a background
// job with the model that wrote the summary. Every query takes the user id.

/** Why a translation can't be asked for. The reader offers only what is allowed, so it means a stale page. */
export class TranslationRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TranslationRequestError";
  }
}

/**
 * Gives the translation a job and makes it the one job that may write the
 * row. A job already waiting, perhaps out a backoff, is used and made due
 * now; a job already running is superseded and its result dropped.
 */
async function queueTranslation(db: Db, translation: Pick<SummaryTranslation, "id" | "userId" | "articleId">) {
  const [waiting] = await db
    .update(jobs)
    .set({ runAt: sql`now()` })
    .where(
      and(
        eq(jobs.articleId, translation.articleId),
        eq(jobs.type, "translate_summary"),
        eq(jobs.status, "queued"),
        sql`${jobs.payload}->>'translationId' = ${translation.id}`,
      ),
    )
    .returning({ id: jobs.id });
  const job =
    waiting ??
    (await enqueueJob(db, {
      userId: translation.userId,
      articleId: translation.articleId,
      type: "translate_summary",
      payload: { translationId: translation.id },
    }));
  await db.update(summaryTranslations).set({ jobId: job.id }).where(eq(summaryTranslations.id, translation.id));
}

const limitReached = () =>
  errorMessage("translation.limitReached", { claude: "Claude", max: MAX_TRANSLATION_RUNS_PER_SUMMARY });

/** How many more times Claude may translate this summary; a run still with Claude counts as one. */
export async function translationRunsLeft(db: Db, summaryId: string): Promise<number> {
  return Math.max(0, MAX_TRANSLATION_RUNS_PER_SUMMARY - (await translationRuns(db, summaryId)));
}

/**
 * Takes one of the summary's runs before Claude is asked, or returns null
 * when none is left. The summary is locked, so two jobs at once can't both
 * take the last one.
 */
async function reserveTranslationRun(db: Db, owner: UsageOwner & { summaryId: string }): Promise<string | null> {
  return db.transaction(async (tx) => {
    await tx.select({ id: summaries.id }).from(summaries).where(eq(summaries.id, owner.summaryId)).for("update");
    if ((await translationRunsLeft(tx, owner.summaryId)) === 0) return null;
    return reserveRun(tx, owner);
  });
}

/**
 * Asks for a summary in another language, or again for one that failed. Only
 * a ready summary can be translated, into a language other than its own, into
 * at most MAX_TRANSLATIONS_PER_SUMMARY languages and while it has runs left.
 * The translation and its job are stored together, so it is never left
 * pending without one.
 */
export async function requestTranslation(
  db: Db,
  { userId, summaryId, language }: { userId: string; summaryId: string; language: string },
): Promise<SummaryTranslation> {
  return db.transaction(async (tx) => {
    // Locked, so two requests at once can't both get past the limit.
    const [summary] = await tx
      .select()
      .from(summaries)
      .where(and(eq(summaries.id, summaryId), eq(summaries.userId, userId)))
      .for("update")
      .limit(1);
    if (!summary || summary.status !== "ready" || !summary.tldr) throw new TranslationRequestError("The summary isn't ready.");
    if (!isTranslationLanguage(language) || !translationTargets(summary.language).includes(language)) {
      throw new TranslationRequestError("The summary can't be translated into that language.");
    }
    const existing = await tx
      .select({ language: summaryTranslations.language })
      .from(summaryTranslations)
      .where(eq(summaryTranslations.summaryId, summary.id));
    if (!existing.some((row) => row.language === language) && existing.length >= MAX_TRANSLATIONS_PER_SUMMARY) {
      throw new TranslationRequestError("The summary has as many translations as it can have.");
    }
    if ((await translationRunsLeft(tx, summary.id)) === 0) {
      throw new TranslationRequestError("The summary has been translated as many times as it can be.");
    }
    if ((await getAllowance(tx, userId)).reached) {
      throw new TranslationRequestError("This month's AI allowance is used up.");
    }
    const again = { status: "pending" as const, model: summary.model, error: null, errorMessage: null, stopReason: null };
    const [translation] = await tx
      .insert(summaryTranslations)
      .values({ userId, articleId: summary.articleId, summaryId: summary.id, language, ...again })
      .onConflictDoUpdate({ target: [summaryTranslations.summaryId, summaryTranslations.language], set: again })
      .returning();
    await queueTranslation(tx, translation!);
    return translation!;
  });
}

/**
 * Redoes a summary's translations after the summary is written again, except
 * one into what is now the summary's own language, which goes. With no runs
 * left, a translation is marked failed rather than kept for the old text.
 */
export async function retranslate(db: Db, summary: Summary): Promise<void> {
  const rows = await db.select().from(summaryTranslations).where(eq(summaryTranslations.summaryId, summary.id));
  const targets: readonly string[] = translationTargets(summary.language);
  const runsLeft = await translationRunsLeft(db, summary.id);
  for (const row of rows) {
    if (!targets.includes(row.language)) {
      await db.delete(summaryTranslations).where(eq(summaryTranslations.id, row.id));
      continue;
    }
    if (runsLeft === 0) {
      const message = limitReached();
      await db
        .update(summaryTranslations)
        .set({ status: "failed", jobId: null, error: await englishText(message), errorMessage: message, stopReason: null })
        .where(eq(summaryTranslations.id, row.id));
      continue;
    }
    await db
      .update(summaryTranslations)
      .set({ status: "pending", model: summary.model, error: null, errorMessage: null, stopReason: null })
      .where(eq(summaryTranslations.id, row.id));
    await queueTranslation(db, row);
  }
}

/** A summary's translations, oldest first. */
export async function listTranslations(db: Db, userId: string, summaryId: string): Promise<SummaryTranslation[]> {
  return db
    .select()
    .from(summaryTranslations)
    .where(and(eq(summaryTranslations.summaryId, summaryId), eq(summaryTranslations.userId, userId)))
    .orderBy(asc(summaryTranslations.createdAt));
}

export async function deleteTranslation(db: Db, userId: string, id: string): Promise<void> {
  const [deleted] = await db
    .delete(summaryTranslations)
    .where(and(eq(summaryTranslations.id, id), eq(summaryTranslations.userId, userId)))
    .returning({ articleId: summaryTranslations.articleId });
  if (deleted) await refreshSearchVector(db, deleted.articleId);
}

function jobTranslationId(job: Job): string {
  const id = job.payload.translationId;
  if (typeof id !== "string") throw new JobError(errorMessage("job.unexpected", { detail: "The job names no translation." }), false);
  return id;
}

/** The translation's row, while this job is still the one that may write it. */
function ownRow(job: Job) {
  return and(
    eq(summaryTranslations.id, jobTranslationId(job)),
    eq(summaryTranslations.userId, job.userId),
    eq(summaryTranslations.jobId, job.id),
  );
}

/** The translate_summary job: translates the summary and stores the result. */
export async function translateSummaryJob(db: Db, job: Job): Promise<void> {
  const where = ownRow(job);
  const [translation] = await db.select().from(summaryTranslations).where(where).limit(1);
  if (!translation) return; // removed, or superseded by a newer job
  if (!isSummaryModel(translation.model)) {
    throw new JobError(errorMessage("summary.unknownModel", { model: translation.model }), false);
  }
  if (!isTranslationLanguage(translation.language)) throw new JobError(errorMessage("translation.summaryNotReady"), false);
  const [summary] = await db
    .select()
    .from(summaries)
    .where(and(eq(summaries.id, translation.summaryId), eq(summaries.userId, job.userId)))
    .limit(1);
  if (!summary || summary.status === "failed" || !summary.tldr) {
    throw new JobError(errorMessage("translation.summaryNotReady"), false);
  }
  // Being written again: wait for it, then translate the new text. Once it
  // is stored, retranslate() asks for that anyway.
  if (summary.status !== "ready") throw new JobError(errorMessage("translation.summaryNotReady"), true);
  if ((await getAllowance(db, job.userId)).reached) throw new JobError(errorMessage("translation.monthlyLimit"), false);
  // Retries count too, so a translation that keeps failing stops here.
  const run = await reserveTranslationRun(db, {
    userId: job.userId,
    articleId: translation.articleId,
    summaryId: summary.id,
    kind: "translation",
    language: translation.language,
    model: translation.model,
  });
  if (!run) throw new JobError(limitReached(), false);

  await db.update(summaryTranslations).set({ status: "running", error: null, errorMessage: null }).where(where);
  let answered = false;
  let result;
  try {
    result = await translateSummary({
      model: translation.model,
      target: translation.language,
      summary: { language: summary.language, tldr: summary.tldr, keyPoints: summary.keyPoints ?? [] },
      onAnswer: async (usage) => {
        answered = true;
        await fillUsage(db, run, usage);
      },
    });
  } catch (error) {
    // No answer came back at all, so the run doesn't count.
    if (!answered) await releaseRun(db, run);
    if (error instanceof SummaryError) {
      // With no runs left, a failure is final rather than "trying again soon".
      const again = error.retryable && (await translationRunsLeft(db, summary.id)) > 0;
      throw new JobError(error.storedMessage, again, error.stopReason);
    }
    throw error;
  }
  const [stored] = await db
    .update(summaryTranslations)
    .set({
      status: "ready",
      servedModel: result.servedModel,
      effort: result.effort,
      tldr: result.tldr,
      keyPoints: result.keyPoints,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      costUsd: result.costUsd,
      durationMs: result.durationMs,
      stopReason: result.stopReason,
      error: null,
      errorMessage: null,
      completedAt: new Date(),
    })
    .where(where)
    .returning({ id: summaryTranslations.id });
  if (stored) await refreshSearchVector(db, translation.articleId);
}

export async function translateSummaryFailed(db: Db, job: Job, { message, text, willRetry, stopReason }: JobFailure) {
  if (typeof job.payload.translationId !== "string") return;
  await db
    .update(summaryTranslations)
    .set({ status: willRetry ? "pending" : "failed", error: text, errorMessage: message, stopReason })
    .where(ownRow(job));
}
