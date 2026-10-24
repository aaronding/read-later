import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { aiUsage, users, type AiUsageKind } from "@/db/schema";
import { HIGHEST_PRICE } from "@/config/models";
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

/**
 * What a row counts toward a user's monthly limit (lib/allowance.ts): its
 * estimated cost, or, for a model without a known price, its tokens at the
 * highest price. A run still waiting on Claude has no tokens yet, so it
 * counts once it is answered.
 */
export const chargedUsd = sql<number>`coalesce(${aiUsage.costUsd}, (${aiUsage.inputTokens} * ${HIGHEST_PRICE.input} + ${aiUsage.outputTokens} * ${HIGHEST_PRICE.output}) / 1000000.0)`;

export const USAGE_PERIODS = ["week", "month", "year"] as const;
export type UsagePeriod = (typeof USAGE_PERIODS)[number];

export function isUsagePeriod(value: unknown): value is UsagePeriod {
  return typeof value === "string" && (USAGE_PERIODS as readonly string[]).includes(value);
}

/** How many periods each report shows, the current one included; null for every period. */
const PERIODS_SHOWN: Record<UsagePeriod, number | null> = { week: 12, month: 12, year: null };

/** The first moment, in UTC, of the period `back` periods before the one holding `now`. Weeks start on Monday. */
export function periodStart(period: UsagePeriod, now: Date, back = 0): Date {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  if (period === "year") return new Date(Date.UTC(year - back, 0, 1));
  if (period === "month") return new Date(Date.UTC(year, month - back, 1));
  const sinceMonday = (now.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(year, month, now.getUTCDate() - sinceMonday - 7 * back));
}

export interface UsageReportRow {
  /** The period's first moment: a Monday for weeks, in UTC. */
  start: Date;
  userId: string;
  email: string;
  name: string;
  summaries: number;
  translations: number;
  inputTokens: number;
  outputTokens: number;
  /** The estimated cost of the answers whose price is known. */
  costUsd: number;
  /** What the answers count toward a monthly limit: unpriced ones at the highest price. */
  chargedUsd: number;
  /** How many answers came from a model whose price isn't known, or are still under way. */
  unpricedAnswers: number;
  durationMs: number;
}

/**
 * Each user's answers from Claude per week, month or year, newest period
 * first and the costliest user first within it: the last 12 weeks or months,
 * or every year. Periods are in UTC, whatever the database's time zone.
 */
export async function usageReport(db: Db, period: UsagePeriod, now = new Date()): Promise<UsageReportRow[]> {
  if (!isUsagePeriod(period)) throw new Error(`Unknown period: ${String(period)}`);
  // A literal, so the same expression can be selected and grouped by.
  const unit = sql.raw(`'${period}'`);
  const start = sql<Date>`date_trunc(${unit}, ${aiUsage.createdAt}, 'UTC')`;
  const cost = sql<number>`coalesce(sum(${aiUsage.costUsd}), 0)`.mapWith(Number);
  const shown = PERIODS_SHOWN[period];
  return db
    .select({
      start: start.mapWith((value: Date | string) => new Date(value)),
      userId: aiUsage.userId,
      email: users.email,
      name: users.name,
      summaries: sql<number>`count(*) filter (where ${aiUsage.kind} = 'summary')`.mapWith(Number),
      translations: sql<number>`count(*) filter (where ${aiUsage.kind} = 'translation')`.mapWith(Number),
      inputTokens: sql<number>`sum(${aiUsage.inputTokens})`.mapWith(Number),
      outputTokens: sql<number>`sum(${aiUsage.outputTokens})`.mapWith(Number),
      costUsd: cost,
      chargedUsd: sql<number>`coalesce(sum(${chargedUsd}), 0)`.mapWith(Number),
      unpricedAnswers: sql<number>`count(*) filter (where ${aiUsage.costUsd} is null)`.mapWith(Number),
      durationMs: sql<number>`sum(${aiUsage.durationMs})`.mapWith(Number),
    })
    .from(aiUsage)
    .innerJoin(users, eq(users.id, aiUsage.userId))
    .where(shown ? gte(aiUsage.createdAt, periodStart(period, now, shown - 1)) : undefined)
    .groupBy(start, aiUsage.userId, users.email, users.name)
    .orderBy(desc(start), desc(cost), users.email);
}
