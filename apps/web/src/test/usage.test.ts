// The admin's report of what Claude's answers cost, per user and period.
// PGlite stands in for Postgres, set to a time zone other than UTC.
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import { aiUsage } from "@/db/schema";
import { periodStart, usageReport } from "@/lib/usage";
import { createTestDb, createTestUser } from "./db";

let db: Db;
let close: () => Promise<void>;
// A Thursday.
const now = new Date("2026-10-22T12:00:00Z");

const answer = (userId: string, kind: "summary" | "translation", at: string, costUsd: number | null) => ({
  userId,
  articleId: null,
  summaryId: null,
  kind,
  model: "claude-haiku-5-5",
  inputTokens: 1000,
  outputTokens: 200,
  costUsd,
  durationMs: 1500,
  createdAt: new Date(at),
});

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  // Periods are in UTC whatever the database's own time zone is.
  await db.execute(sql`set time zone 'America/Los_Angeles'`);
  await createTestUser(db);
  await createTestUser(db, "other@example.com", "user-2");
  await db.insert(aiUsage).values([
    // Monday of this week, just after midnight UTC (still Sunday in Los Angeles), and later the same week.
    answer("user-1", "summary", "2026-10-19T00:30:00Z", 0.01),
    answer("user-1", "translation", "2026-10-21T10:00:00Z", 0.002),
    // The Sunday before, just before midnight UTC: last week, but this month. Its price isn't known.
    answer("user-2", "summary", "2026-10-18T23:30:00Z", null),
    answer("user-1", "summary", "2026-09-30T12:00:00Z", 0.05),
    // Just inside and just outside the 12 weeks.
    answer("user-2", "summary", "2026-08-03T00:10:00Z", 0.003),
    answer("user-2", "summary", "2026-08-02T23:50:00Z", 0.004),
    // Just inside and just outside the 12 months.
    answer("user-2", "summary", "2025-11-01T00:10:00Z", 0.005),
    answer("user-2", "summary", "2025-10-31T23:50:00Z", 0.006),
    answer("user-1", "summary", "2025-06-01T12:00:00Z", 0.1),
  ]);
});

afterAll(async () => {
  await close();
});

const brief = (rows: Awaited<ReturnType<typeof usageReport>>) =>
  rows.map((row) => ({
    start: row.start.toISOString(),
    userId: row.userId,
    summaries: row.summaries,
    translations: row.translations,
    costUsd: Number(row.costUsd.toFixed(6)),
    unpricedAnswers: row.unpricedAnswers,
  }));

describe("the AI usage report", () => {
  it("adds up each user's week, starting on Monday in UTC, for the last 12 weeks", async () => {
    const rows = await usageReport(db, "week", now);
    expect(brief(rows)).toEqual([
      { start: "2026-10-19T00:00:00.000Z", userId: "user-1", summaries: 1, translations: 1, costUsd: 0.012, unpricedAnswers: 0 },
      { start: "2026-10-12T00:00:00.000Z", userId: "user-2", summaries: 1, translations: 0, costUsd: 0, unpricedAnswers: 1 },
      { start: "2026-09-28T00:00:00.000Z", userId: "user-1", summaries: 1, translations: 0, costUsd: 0.05, unpricedAnswers: 0 },
      { start: "2026-08-03T00:00:00.000Z", userId: "user-2", summaries: 1, translations: 0, costUsd: 0.003, unpricedAnswers: 0 },
    ]);
    expect(rows[0]).toMatchObject({ email: "owner@example.com", name: "Owner", inputTokens: 2000, outputTokens: 400, durationMs: 3000 });
  });

  it("adds up each month for the last 12 months, the costliest user first", async () => {
    expect(brief(await usageReport(db, "month", now))).toEqual([
      { start: "2026-10-01T00:00:00.000Z", userId: "user-1", summaries: 1, translations: 1, costUsd: 0.012, unpricedAnswers: 0 },
      { start: "2026-10-01T00:00:00.000Z", userId: "user-2", summaries: 1, translations: 0, costUsd: 0, unpricedAnswers: 1 },
      { start: "2026-09-01T00:00:00.000Z", userId: "user-1", summaries: 1, translations: 0, costUsd: 0.05, unpricedAnswers: 0 },
      { start: "2026-08-01T00:00:00.000Z", userId: "user-2", summaries: 2, translations: 0, costUsd: 0.007, unpricedAnswers: 0 },
      { start: "2025-11-01T00:00:00.000Z", userId: "user-2", summaries: 1, translations: 0, costUsd: 0.005, unpricedAnswers: 0 },
    ]);
  });

  it("adds up every year", async () => {
    expect(brief(await usageReport(db, "year", now))).toEqual([
      { start: "2026-01-01T00:00:00.000Z", userId: "user-1", summaries: 2, translations: 1, costUsd: 0.062, unpricedAnswers: 0 },
      { start: "2026-01-01T00:00:00.000Z", userId: "user-2", summaries: 3, translations: 0, costUsd: 0.007, unpricedAnswers: 1 },
      { start: "2025-01-01T00:00:00.000Z", userId: "user-1", summaries: 1, translations: 0, costUsd: 0.1, unpricedAnswers: 0 },
      { start: "2025-01-01T00:00:00.000Z", userId: "user-2", summaries: 2, translations: 0, costUsd: 0.011, unpricedAnswers: 0 },
    ]);
  });

  it("refuses any other period", async () => {
    await expect(usageReport(db, "day" as never, now)).rejects.toThrow(/Unknown period/);
  });
});

describe("periodStart", () => {
  it("finds the Monday, the first of the month or the first of the year, in UTC", () => {
    expect(periodStart("week", now).toISOString()).toBe("2026-10-19T00:00:00.000Z");
    expect(periodStart("week", new Date("2026-10-25T23:59:00Z")).toISOString()).toBe("2026-10-19T00:00:00.000Z");
    expect(periodStart("week", new Date("2026-10-19T00:00:00Z")).toISOString()).toBe("2026-10-19T00:00:00.000Z");
    expect(periodStart("week", now, 11).toISOString()).toBe("2026-08-03T00:00:00.000Z");
    expect(periodStart("month", now, 11).toISOString()).toBe("2025-11-01T00:00:00.000Z");
    expect(periodStart("month", new Date("2026-03-31T23:00:00Z"), 1).toISOString()).toBe("2026-02-01T00:00:00.000Z");
    expect(periodStart("year", now, 1).toISOString()).toBe("2025-01-01T00:00:00.000Z");
  });
});
