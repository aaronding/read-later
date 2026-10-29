import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import { articles, summaries } from "@/db/schema";
import { createTestDb, createTestUser } from "@/test/db";
import { parseHaveVersions } from "./copy";
import { loadOfflineCopies } from "./server";

let db: Db;
let close: () => Promise<void>;
let mine: string;
let theirs: string;
const GONE = "00000000-0000-4000-8000-000000000000";

async function addArticle(userId: string, key: string) {
  const [row] = await db
    .insert(articles)
    .values({
      userId,
      url: `https://example.com/${key}`,
      normalizedUrl: `https://example.com/${key}`,
      title: `Article ${key}`,
      contentHtml: `<p>${key}</p>`,
      status: "ready",
      summaryModel: "claude-sonnet-5-5",
    })
    .returning();
  return row!.id;
}

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await createTestUser(db);
  await createTestUser(db, "other@example.com", "user-2");
  mine = await addArticle("user-1", "mine");
  theirs = await addArticle("user-2", "theirs");
});
afterAll(() => close());

describe("loadOfflineCopies", () => {
  it("sends the copy of an article not kept yet, and says which are gone", async () => {
    const { copies, removed } = await loadOfflineCopies(db, "user-1", { [mine]: null, [GONE]: null });
    expect(copies).toHaveLength(1);
    expect(copies[0]).toMatchObject({ id: mine, title: "Article mine", contentHtml: "<p>mine</p>", summary: null });
    expect(removed).toEqual([GONE]);
  });

  it("never sends another user's article", async () => {
    const { copies, removed } = await loadOfflineCopies(db, "user-1", { [theirs]: null });
    expect(copies).toEqual([]);
    expect(removed).toEqual([theirs]);
  });

  it("sends nothing for an unchanged copy, and the new one once its summary is written", async () => {
    const [first] = (await loadOfflineCopies(db, "user-1", { [mine]: null })).copies;
    expect((await loadOfflineCopies(db, "user-1", { [mine]: first!.version })).copies).toEqual([]);

    await db.insert(summaries).values({
      userId: "user-1",
      articleId: mine,
      model: "claude-sonnet-5-5",
      status: "ready",
      language: "en",
      tldr: "A short summary.",
      keyPoints: ["One point."],
      costUsd: 0.01,
      completedAt: new Date(),
    });
    const [second] = (await loadOfflineCopies(db, "user-1", { [mine]: first!.version })).copies;
    expect(second?.version).not.toBe(first!.version);
    // The summary's text, without what it cost.
    expect(second?.summary).toEqual({
      model: "claude-sonnet-5-5",
      language: "en",
      tldr: "A short summary.",
      keyPoints: ["One point."],
      partial: false,
    });
  });

  it("sends the copy again when the article changes", async () => {
    const [before] = (await loadOfflineCopies(db, "user-1", { [mine]: null })).copies;
    await db.update(articles).set({ title: "A better title" }).where(eq(articles.id, mine));
    const [after] = (await loadOfflineCopies(db, "user-1", { [mine]: before!.version })).copies;
    expect(after?.title).toBe("A better title");
  });
});

describe("parseHaveVersions", () => {
  it("accepts article ids with a version or null", () => {
    expect(parseHaveVersions({ have: { [mine]: null, [GONE]: "1:" } })).toEqual({ [mine]: null, [GONE]: "1:" });
    expect(parseHaveVersions({ have: {} })).toEqual({});
  });

  it("refuses anything else", () => {
    expect(parseHaveVersions(null)).toBeNull();
    expect(parseHaveVersions({})).toBeNull();
    expect(parseHaveVersions({ have: [mine] })).toBeNull();
    expect(parseHaveVersions({ have: { "not-an-id": null } })).toBeNull();
    expect(parseHaveVersions({ have: { [mine]: 3 } })).toBeNull();
    const many = Object.fromEntries(
      Array.from({ length: 1001 }, (_, index) => [`00000000-0000-4000-8000-${String(index).padStart(12, "0")}`, null]),
    );
    expect(parseHaveVersions({ have: many })).toBeNull();
  });
});
