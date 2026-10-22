// What only admins (ADMIN_EMAILS) may do: the checks in front of Compare,
// writing a summary again, comparison mode and Retry. The session is faked
// and PGlite stands in for Postgres.
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/db";
import { articles, jobs, summaries } from "@/db/schema";
import { createTestDb, createTestUser } from "./db";

vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined }) }));
vi.mock("next/cache", () => ({ refresh: () => {} }));
vi.mock("@vercel/functions", () => ({ waitUntil: () => {}, attachDatabasePool: () => {} }));

let db: Db;
let close: () => Promise<void>;
let articleId: string;
const saved = { ...process.env };

beforeAll(async () => {
  Object.assign(process.env, {
    BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret",
    GOOGLE_CLIENT_ID: "id",
    GOOGLE_CLIENT_SECRET: "secret",
    ALLOWED_EMAILS: "owner@example.com",
    RUN_JOBS_AFTER_RESPONSE: "false",
  });
  ({ db, close } = await createTestDb());
  await createTestUser(db);
  const { getAuth } = await import("@/lib/auth");
  vi.spyOn(getAuth().api, "getSession").mockResolvedValue({
    user: { id: "user-1", email: "owner@example.com", name: "Owner" },
    session: {},
  } as never);
});

beforeEach(async () => {
  await db.delete(jobs);
  await db.delete(articles);
  const [article] = await db
    .insert(articles)
    .values({
      userId: "user-1",
      url: "https://example.com/orchards",
      normalizedUrl: "https://example.com/orchards",
      status: "ready",
      title: "Community orchards",
      contentHtml: "<p>Orchards are back.</p>",
      textContent: "Orchards are back. ".repeat(50),
      summaryModel: "claude-haiku-5-5",
    })
    .returning();
  articleId = article!.id;
  // Every model failed, as after a save in comparison mode.
  await db.insert(summaries).values(
    (["claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-5-5"] as const).map((model) => ({
      userId: "user-1",
      articleId,
      model,
      status: "failed" as const,
      error: "Claude API error 500.",
    })),
  );
});

afterEach(() => {
  delete process.env.ADMIN_EMAILS;
});

afterAll(async () => {
  await close();
  process.env = saved;
});

const asAdmin = () => (process.env.ADMIN_EMAILS = "owner@example.com");
const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
};
const queuedModels = async () =>
  (await db.select().from(jobs).where(eq(jobs.type, "summarize"))).map((job) => job.payload.model).sort();
const notFound = { digest: expect.stringContaining("404") };

describe("admin checks", () => {
  it("answers 404 to anyone who isn't an admin", async () => {
    const { requireAdmin } = await import("@/lib/auth");
    await expect(requireAdmin()).rejects.toMatchObject(notFound);
    asAdmin();
    await expect(requireAdmin()).resolves.toMatchObject({ id: "user-1" });
  });

  it("refuses to write a summary again, or show another model's, for anyone but an admin", async () => {
    const { resummarizeAction, showSummaryAction } = await import("@/app/actions");
    await expect(resummarizeAction(form({ id: articleId, model: "claude-opus-5-5" }))).rejects.toMatchObject(notFound);
    await expect(showSummaryAction(form({ id: articleId, model: "claude-opus-5-5" }))).rejects.toMatchObject(notFound);
    expect(await queuedModels()).toEqual([]);
    const [article] = await db.select().from(articles).where(eq(articles.id, articleId));
    expect(article!.summaryModel).toBe("claude-haiku-5-5");

    asAdmin();
    await resummarizeAction(form({ id: articleId, model: "claude-opus-5-5" }));
    expect(await queuedModels()).toEqual(["claude-opus-5-5"]);
  });

  it("keeps comparison mode off in Settings for anyone but an admin", async () => {
    const { updateSettingsAction } = await import("@/app/actions");
    const { getSettings } = await import("@/lib/settings");
    const settings = form({ defaultModel: "claude-haiku-5-5", comparisonMode: "on" });
    await updateSettingsAction(settings);
    expect((await getSettings(db, "user-1")).comparisonMode).toBe(false);
    asAdmin();
    await updateSettingsAction(settings);
    expect((await getSettings(db, "user-1")).comparisonMode).toBe(true);
  });

  it("retries only the summary someone is shown, and every failed one for an admin", async () => {
    const { retryAction } = await import("@/app/actions");
    await retryAction(form({ id: articleId }));
    expect(await queuedModels()).toEqual(["claude-haiku-5-5"]);

    await db.delete(jobs);
    asAdmin();
    await retryAction(form({ id: articleId }));
    expect(await queuedModels()).toEqual(["claude-haiku-5-5", "claude-opus-5-5", "claude-sonnet-5-5"]);
  });
});
