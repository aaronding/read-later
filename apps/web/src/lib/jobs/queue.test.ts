import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import { migrationsFolder } from "@/db/migrations-folder";
import * as schema from "@/db/schema";
import { backoffDelayMs, claimJobs, enqueueJob, failJob, STALE_LOCK_MS } from "./queue";
import { createTestDb, createTestUser } from "@/test/db";

describe("backoffDelayMs", () => {
  it("grows by four each attempt and caps at an hour", () => {
    const noJitter = () => 0.5;
    expect(backoffDelayMs(1, noJitter)).toBe(30_000);
    expect(backoffDelayMs(2, noJitter)).toBe(120_000);
    expect(backoffDelayMs(3, noJitter)).toBe(480_000);
    expect(backoffDelayMs(10, noJitter)).toBe(3_600_000);
  });

  it("adds up to 20% jitter either way", () => {
    expect(backoffDelayMs(1, () => 0)).toBe(24_000);
    expect(backoffDelayMs(1, () => 1)).toBe(36_000);
  });
});

describe("job queue on PGlite", () => {
  let db: Db;
  let close: () => Promise<void>;
  let articleId: string;

  beforeAll(async () => {
    ({ db, close } = await createTestDb());
    await createTestUser(db);
    const [article] = await db
      .insert(schema.articles)
      .values({ userId: "user-1", url: "https://example.com/a", normalizedUrl: "https://example.com/a" })
      .returning();
    articleId = article!.id;
  });
  afterAll(() => close());

  it("claims due jobs once, skips future ones, and retries with backoff", async () => {
    const job = await enqueueJob(db, { userId: "user-1", articleId, type: "process_article", maxAttempts: 2 });
    const [claimed] = await claimJobs(db, 5, "w1");
    expect(claimed).toMatchObject({ id: job.id, status: "running", attempts: 1, lockedBy: "w1" });
    expect(await claimJobs(db, 5, "w2")).toHaveLength(0); // already taken

    expect(await failJob(db, claimed!, "temporary", true)).toBe(true);
    expect(await claimJobs(db, 5, "w1")).toHaveLength(0); // waiting for its backoff

    await db.update(schema.jobs).set({ runAt: new Date(Date.now() - 1) });
    const [second] = await claimJobs(db, 5, "w1");
    expect(second?.attempts).toBe(2);
    expect(await failJob(db, second!, "still failing", true)).toBe(false); // out of attempts
    const [final] = await db.select().from(schema.jobs);
    expect(final).toMatchObject({ status: "failed", lastError: "still failing" });
  });

  it("takes back a job whose worker stopped responding", async () => {
    await db.delete(schema.jobs);
    await enqueueJob(db, { userId: "user-1", articleId, type: "summarize", payload: { model: "claude-opus-5-5" } });
    const [taken] = await claimJobs(db, 1, "crashed-worker");
    await db
      .update(schema.jobs)
      .set({ lockedAt: new Date(Date.now() - STALE_LOCK_MS - 1000) })
      .where(sql`id = ${taken!.id}`);
    const [reclaimed] = await claimJobs(db, 1, "healthy-worker");
    expect(reclaimed).toMatchObject({ id: taken!.id, lockedBy: "healthy-worker", attempts: 2 });
  });
});

// Real Postgres, to prove FOR UPDATE SKIP LOCKED keeps concurrent workers
// apart. Runs when TEST_DATABASE_URL points at an empty database.
const testDatabaseUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!testDatabaseUrl)("job queue on Postgres with concurrent workers", () => {
  const pools: Pool[] = [];
  let setupDb: Db;

  beforeAll(async () => {
    const pool = new Pool({ connectionString: testDatabaseUrl, max: 2 });
    pools.push(pool);
    const raw = drizzle(pool, { schema });
    await raw.execute(sql`DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;`);
    await migrate(raw, { migrationsFolder });
    setupDb = raw as unknown as Db;
    await createTestUser(setupDb);
    const [article] = await setupDb
      .insert(schema.articles)
      .values({ userId: "user-1", url: "https://example.com/a", normalizedUrl: "https://example.com/a" })
      .returning();
    for (let i = 0; i < 40; i++) {
      await enqueueJob(setupDb, { userId: "user-1", articleId: article!.id, type: "process_article" });
    }
  });

  afterAll(async () => {
    await Promise.all(pools.map((pool) => pool.end()));
  });

  it("never hands the same job to two workers", async () => {
    const workers = Array.from({ length: 6 }, (_, index) => {
      const pool = new Pool({ connectionString: testDatabaseUrl, max: 1 });
      pools.push(pool);
      return { id: `worker-${index}`, db: drizzle(pool, { schema }) as unknown as Db };
    });
    const claimedBy = new Map<string, string[]>();
    await Promise.all(
      workers.map(async (worker) => {
        for (;;) {
          const batch = await claimJobs(worker.db, 3, worker.id);
          if (batch.length === 0) return;
          for (const job of batch) claimedBy.set(job.id, [...(claimedBy.get(job.id) ?? []), worker.id]);
        }
      }),
    );
    expect(claimedBy.size).toBe(40);
    expect([...claimedBy.values()].every((owners) => owners.length === 1)).toBe(true);
    const busyWorkers = new Set([...claimedBy.values()].flat());
    expect(busyWorkers.size).toBeGreaterThan(1);
  });
});
