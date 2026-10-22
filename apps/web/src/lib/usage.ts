import { and, count, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { aiUsage, type AiUsageKind } from "@/db/schema";
import type { ClaudeUsage } from "@/lib/summarize/summarize";

// What each answer from Claude used, whoever asked for it. The rows of
// summaries and translations keep only their latest answer.

export interface UsageOwner {
  userId: string;
  articleId: string | null;
  summaryId: string | null;
  kind: AiUsageKind;
  /** For a translation, the language asked for. */
  language?: string | null;
  /** The model asked for. */
  model: string;
}

/** Postgres's code for a foreign key that points at a row that is gone. */
const FOREIGN_KEY_VIOLATION = "23503";

function isForeignKeyViolation(error: unknown): boolean {
  // Drizzle wraps the driver's error in its own.
  for (let cause = error; cause && typeof cause === "object"; cause = (cause as { cause?: unknown }).cause) {
    if ((cause as { code?: unknown }).code === FOREIGN_KEY_VIOLATION) return true;
  }
  return false;
}

/**
 * Records one answer from Claude. An article deleted while Claude was
 * answering takes its id along, but the answer is still recorded.
 */
export async function recordUsage(db: Db, owner: UsageOwner, usage: ClaudeUsage): Promise<void> {
  const values = { ...owner, language: owner.language ?? null, ...usage };
  try {
    await db.insert(aiUsage).values(values);
  } catch (error) {
    if (!isForeignKeyViolation(error)) throw error;
    await db.insert(aiUsage).values({ ...values, articleId: null, summaryId: null });
  }
}

/**
 * Records a run before Claude is asked, so a run still waiting on Claude
 * counts toward a limit. fillUsage() completes it, and releaseRun() removes
 * it if the request never reached Claude.
 */
export async function reserveRun(db: Db, owner: UsageOwner): Promise<string> {
  const [row] = await db
    .insert(aiUsage)
    .values({ ...owner, language: owner.language ?? null, inputTokens: 0, outputTokens: 0, durationMs: 0 })
    .returning({ id: aiUsage.id });
  return row!.id;
}

export async function fillUsage(db: Db, id: string, usage: ClaudeUsage): Promise<void> {
  await db.update(aiUsage).set(usage).where(eq(aiUsage.id, id));
}

export async function releaseRun(db: Db, id: string): Promise<void> {
  await db.delete(aiUsage).where(eq(aiUsage.id, id));
}

/** How many times Claude has been asked to translate this summary, in any language, runs still under way included. */
export async function translationRuns(db: Db, summaryId: string): Promise<number> {
  const [row] = await db
    .select({ runs: count() })
    .from(aiUsage)
    .where(and(eq(aiUsage.summaryId, summaryId), eq(aiUsage.kind, "translation")));
  return row?.runs ?? 0;
}
