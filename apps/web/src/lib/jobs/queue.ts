import { and, eq, inArray, lt, lte, or, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { jobs, type Job, type JobType } from "@/db/schema";

// A job queue in a plain Postgres table. Workers claim jobs with
// FOR UPDATE SKIP LOCKED, so several workers (after(), the cron safety net,
// a worker process) can run at once without taking the same job.

/** A running job whose worker vanished (crash, timeout) is retried after this. */
export const STALE_LOCK_MS = 10 * 60 * 1000;

export async function enqueueJob(
  db: Db,
  job: { userId: string; articleId: string; type: JobType; payload?: Record<string, unknown>; maxAttempts?: number },
): Promise<Job> {
  const [created] = await db
    .insert(jobs)
    .values({
      userId: job.userId,
      articleId: job.articleId,
      type: job.type,
      payload: job.payload ?? {},
      maxAttempts: job.maxAttempts ?? 5,
    })
    .returning();
  return created!;
}

/** Claims up to `limit` due jobs for this worker and marks them running. */
export async function claimJobs(db: Db, limit: number, workerId: string): Promise<Job[]> {
  const staleBefore = new Date(Date.now() - STALE_LOCK_MS);
  const due = db
    .select({ id: jobs.id })
    .from(jobs)
    .where(
      or(
        and(eq(jobs.status, "queued"), lte(jobs.runAt, sql`now()`)),
        and(eq(jobs.status, "running"), lt(jobs.lockedAt, staleBefore)),
      ),
    )
    .orderBy(jobs.runAt)
    .limit(limit)
    .for("update", { skipLocked: true });

  return db
    .update(jobs)
    .set({
      status: "running",
      lockedAt: sql`now()`,
      lockedBy: workerId,
      attempts: sql`${jobs.attempts} + 1`,
    })
    .where(inArray(jobs.id, due))
    .returning();
}

export async function completeJob(db: Db, job: Job): Promise<void> {
  await db
    .update(jobs)
    .set({ status: "done", lockedAt: null, lockedBy: null, lastError: null, finishedAt: sql`now()` })
    .where(eq(jobs.id, job.id));
}

/** 30 s, 2 min, 8 min, 32 min, then hourly; with ±20% jitter. */
export function backoffDelayMs(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(30_000 * 4 ** Math.max(0, attempt - 1), 60 * 60 * 1000);
  return Math.round(base * (0.8 + random() * 0.4));
}

/**
 * Records a failure. Retryable failures go back in the queue with backoff
 * until the job runs out of attempts. Returns true if the job will retry.
 */
export async function failJob(db: Db, job: Job, error: string, retryable: boolean): Promise<boolean> {
  const willRetry = retryable && job.attempts < job.maxAttempts;
  await db
    .update(jobs)
    .set(
      willRetry
        ? {
            status: "queued",
            runAt: new Date(Date.now() + backoffDelayMs(job.attempts)),
            lockedAt: null,
            lockedBy: null,
            lastError: error.slice(0, 2000),
          }
        : {
            status: "failed",
            lockedAt: null,
            lockedBy: null,
            lastError: error.slice(0, 2000),
            finishedAt: sql`now()`,
          },
    )
    .where(eq(jobs.id, job.id));
  return willRetry;
}

/** True if the article already has a queued or running job of this type. */
export async function hasPendingJob(db: Db, articleId: string, type: JobType, model?: string): Promise<boolean> {
  const rows = await db
    .select({ id: jobs.id, payload: jobs.payload })
    .from(jobs)
    .where(and(eq(jobs.articleId, articleId), eq(jobs.type, type), inArray(jobs.status, ["queued", "running"])));
  return model ? rows.some((row) => row.payload.model === model) : rows.length > 0;
}

/** Finished jobs are kept for a week for debugging, then deleted. */
export async function pruneFinishedJobs(db: Db): Promise<void> {
  await db
    .delete(jobs)
    .where(and(inArray(jobs.status, ["done", "failed"]), lt(jobs.finishedAt, new Date(Date.now() - 7 * 24 * 3600 * 1000))));
}
