// Each user's monthly AI allowance: what counts toward it, and when it is
// close or used up. PGlite stands in for Postgres.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import { aiUsage } from "@/db/schema";
import { getAllowance, monthlyLimitUsd, sharePercent } from "@/lib/allowance";
import { createTestDb, createTestUser } from "./db";

let db: Db;
let close: () => Promise<void>;
const now = new Date("2026-10-22T12:00:00Z");

const answer = (at: string, costUsd: number | null, tokens = { input: 1000, output: 200 }) => ({
  userId: "user-1",
  articleId: null,
  summaryId: null,
  kind: "summary" as const,
  model: "claude-sonnet-5-5",
  inputTokens: tokens.input,
  outputTokens: tokens.output,
  costUsd,
  durationMs: 1500,
  createdAt: new Date(at),
});

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await createTestUser(db);
});

afterAll(async () => {
  await close();
});

beforeEach(async () => {
  await db.delete(aiUsage);
});

afterEach(() => {
  for (const name of ["AI_MONTHLY_LIMIT_USD", "AI_MONTHLY_LIMIT_EXCEPTIONS", "ADMIN_EMAILS"]) delete process.env[name];
});

describe("monthlyLimitUsd", () => {
  it("is $1 unless AI_MONTHLY_LIMIT_USD says otherwise", () => {
    expect(monthlyLimitUsd("reader@example.com")).toBe(1);
    process.env.AI_MONTHLY_LIMIT_USD = "2.5";
    expect(monthlyLimitUsd("reader@example.com")).toBe(2.5);
    process.env.AI_MONTHLY_LIMIT_USD = "none";
    expect(monthlyLimitUsd("reader@example.com")).toBeNull();
  });

  it("falls back to the default, never to no limit, for a value it can't read", () => {
    for (const value of ["", "lots", "-1", "$2"]) {
      process.env.AI_MONTHLY_LIMIT_USD = value;
      expect(monthlyLimitUsd("reader@example.com")).toBe(1);
    }
  });

  it("gives a user named in AI_MONTHLY_LIMIT_EXCEPTIONS their own limit", () => {
    process.env.AI_MONTHLY_LIMIT_EXCEPTIONS = "Friend@Example.com=5, family@example.com=none tester@example.com=0 odd@example.com=x";
    expect(monthlyLimitUsd("friend@example.com")).toBe(5);
    expect(monthlyLimitUsd("family@example.com")).toBeNull();
    expect(monthlyLimitUsd("tester@example.com")).toBe(0);
    expect(monthlyLimitUsd("odd@example.com")).toBe(1);
    expect(monthlyLimitUsd("reader@example.com")).toBe(1);
  });

  it("gives admins no limit", () => {
    process.env.ADMIN_EMAILS = "owner@example.com";
    process.env.AI_MONTHLY_LIMIT_EXCEPTIONS = "owner@example.com=1";
    expect(monthlyLimitUsd("owner@example.com")).toBeNull();
  });
});

describe("getAllowance", () => {
  it("counts this calendar month in UTC only, and renews on the first of the next", async () => {
    await db.insert(aiUsage).values([
      answer("2026-10-01T00:10:00Z", 0.3),
      answer("2026-10-21T09:00:00Z", 0.2),
      answer("2026-09-30T23:50:00Z", 0.4),
    ]);
    const allowance = await getAllowance(db, "user-1", now);
    expect(allowance).toMatchObject({ limitUsd: 1, reached: false, nearing: false });
    expect(allowance.usedUsd).toBeCloseTo(0.5, 6);
    expect(sharePercent(allowance)).toBe(50);
    expect(allowance.renewsAt.toISOString()).toBe("2026-11-01T00:00:00.000Z");
  });

  it("counts an answer without a known price at the highest price, not as free", async () => {
    await db.insert(aiUsage).values(answer("2026-10-21T09:00:00Z", null, { input: 100_000, output: 10_000 }));
    // 100K tokens in at $5 and 10K out at $25 a million.
    expect((await getAllowance(db, "user-1", now)).usedUsd).toBeCloseTo(0.75, 6);
  });

  it("says when it is close to the limit, and when it is used up", async () => {
    await db.insert(aiUsage).values(answer("2026-10-21T09:00:00Z", 0.85));
    expect(await getAllowance(db, "user-1", now)).toMatchObject({ nearing: true, reached: false });
    await db.insert(aiUsage).values(answer("2026-10-21T10:00:00Z", 0.2));
    const used = await getAllowance(db, "user-1", now);
    expect(used).toMatchObject({ nearing: false, reached: true });
    expect(sharePercent(used)).toBe(100);
  });

  it("doesn't show 99.6% as all of it", () => {
    expect(sharePercent({ share: 0.996 })).toBe(99);
  });

  it("has nothing to reach with no limit", async () => {
    process.env.ADMIN_EMAILS = "owner@example.com";
    await db.insert(aiUsage).values(answer("2026-10-21T09:00:00Z", 5));
    expect(await getAllowance(db, "user-1", now)).toMatchObject({ limitUsd: null, share: 0, reached: false, nearing: false });
  });
});
