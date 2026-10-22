import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { envInt } from "@/config/env";
import { getDb, type Db } from "@/db";
import type { Job, JobType } from "@/db/schema";
import { englishText } from "@/i18n/stored-message";
import { errorMessage } from "@/lib/error-message";
import { JobError, type JobFailure } from "./errors";
import { translateSummaryFailed, translateSummaryJob } from "@/lib/translations";
import { processArticle, processArticleFailed, summarize, summarizeFailed } from "./handlers";
import { claimJobs, completeJob, failJob, pruneFinishedJobs } from "./queue";

interface Handler {
  run(db: Db, job: Job): Promise<void>;
  failed(db: Db, job: Job, failure: JobFailure): Promise<void>;
}

const HANDLERS: Record<JobType, Handler> = {
  process_article: { run: processArticle, failed: processArticleFailed },
  summarize: { run: summarize, failed: summarizeFailed },
  translate_summary: { run: translateSummaryJob, failed: translateSummaryFailed },
};

export interface ProcessOptions {
  db?: Db;
  /** Stop claiming new jobs after this long. */
  timeBudgetMs?: number;
  /** Jobs run at the same time (comparison mode runs three summaries). */
  concurrency?: number;
  maxJobs?: number;
  workerId?: string;
}

export interface ProcessStats {
  claimed: number;
  succeeded: number;
  retrying: number;
  failed: number;
}

async function runJob(db: Db, job: Job, stats: ProcessStats): Promise<void> {
  const handler = HANDLERS[job.type];
  try {
    // A job whose worker died repeatedly comes back here with no attempts left.
    if (job.attempts > job.maxAttempts) throw new JobError(errorMessage("job.tooManyAttempts"), false);
    await handler.run(db, job);
    await completeJob(db, job);
    stats.succeeded++;
  } catch (error) {
    // Unknown errors (a database hiccup, a bug) are retried, with their own
    // text; JobError says.
    const known = error instanceof JobError ? error : null;
    const message =
      known?.storedMessage ??
      errorMessage("job.unexpected", { detail: error instanceof Error ? error.message : String(error) });
    const retryable = known ? known.retryable : true;
    const stopReason = known ? known.stopReason : null;
    if (!known) console.error(`Job ${job.id} (${job.type}) failed:`, error);
    try {
      const text = await englishText(message);
      // The job and its row record the failure together, so a row is never
      // left waiting on a job that has ended.
      const willRetry = await db.transaction(async (tx) => {
        const retry = await failJob(tx, job, text, retryable);
        if (retry !== null) await handler.failed(tx, job, { message, text, willRetry: retry, stopReason });
        return retry;
      });
      if (willRetry === null) return; // another worker owns this job now
      if (willRetry) stats.retrying++;
      else stats.failed++;
    } catch (recordError) {
      // The lock goes stale and the job is retried later.
      console.error(`Could not record the failure of job ${job.id}:`, recordError);
    }
  }
}

/**
 * Runs due jobs until there are none left or the time budget is used up.
 * Called after a save (Next.js after()), by the cron safety net through
 * /api/jobs/run, and in a loop by the worker process on a server.
 */
export async function processJobs(options: ProcessOptions = {}): Promise<ProcessStats> {
  const db = options.db ?? getDb();
  const deadline = Date.now() + (options.timeBudgetMs ?? envInt("JOBS_TIME_BUDGET_MS", 240_000));
  const concurrency = Math.max(1, options.concurrency ?? envInt("JOBS_CONCURRENCY", 3));
  const maxJobs = options.maxJobs ?? 100;
  const workerId = options.workerId ?? `${hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`;
  const stats: ProcessStats = { claimed: 0, succeeded: 0, retrying: 0, failed: 0 };

  await pruneFinishedJobs(db).catch((error) => console.error("Could not prune old jobs:", error));

  while (Date.now() < deadline && stats.claimed < maxJobs) {
    const batch = await claimJobs(db, Math.min(concurrency, maxJobs - stats.claimed), workerId);
    if (batch.length === 0) break;
    stats.claimed += batch.length;
    await Promise.all(batch.map((job) => runJob(db, job, stats)));
  }
  return stats;
}
