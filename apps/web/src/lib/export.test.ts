import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import { articles, summaries } from "@/db/schema";
import { createTestDb, createTestUser } from "@/test/db";
import { exportToMarkdown, loadExport } from "./export";
import { findOrCreateFolder, setArticleFolder } from "./folders";
import { addTag } from "./tags";

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await createTestUser(db);
  await createTestUser(db, "other@example.com", "user-2");
  const [article] = await db
    .insert(articles)
    .values({
      userId: "user-1",
      url: "https://example.com/orchards",
      normalizedUrl: "https://example.com/orchards",
      title: "Community orchards",
      siteName: "Example",
      status: "ready",
      textContent: "Volunteers plant apple trees.",
      contentHtml: "<p>Volunteers plant apple trees.</p>",
      summaryModel: "claude-opus-5-5",
      favorite: true,
    })
    .returning();
  await db.insert(summaries).values({
    userId: "user-1",
    articleId: article!.id,
    model: "claude-opus-5-5",
    status: "ready",
    tldr: "Towns plant fruit trees.",
    keyPoints: ["Volunteers do the work.", "The fruit is free."],
    costUsd: 0.012,
    completedAt: new Date(),
  });
  await addTag(db, "user-1", article!.id, "gardening");
  await setArticleFolder(db, "user-1", article!.id, await findOrCreateFolder(db, "user-1", "Long reads"));
  await db.insert(articles).values({ userId: "user-2", url: "https://example.com/x", normalizedUrl: "https://example.com/x", title: "Not mine" });
});
afterAll(() => close());

describe("export", () => {
  it("includes everything for this user and nothing of anyone else's", async () => {
    const data = await loadExport(db, "user-1");
    expect(data.articles).toHaveLength(1);
    expect(data.articles[0]).toMatchObject({
      title: "Community orchards",
      folder: "Long reads",
      tags: ["gardening"],
      favorite: true,
      text: "Volunteers plant apple trees.",
      html: "<p>Volunteers plant apple trees.</p>",
    });
    expect(data.articles[0]!.summaries[0]).toMatchObject({ model: "claude-opus-5-5", tldr: "Towns plant fruit trees.", costUsd: 0.012 });
    expect(JSON.stringify(data)).not.toContain("Not mine");
  });

  it("writes readable Markdown", async () => {
    const markdown = exportToMarkdown(await loadExport(db, "user-1"));
    expect(markdown).toContain("# Read Later export");
    expect(markdown).toContain("## Community orchards");
    expect(markdown).toContain("- URL: <https://example.com/orchards>");
    expect(markdown).toContain("- Folder: Long reads");
    expect(markdown).toContain("- Tags: #gardening");
    expect(markdown).toContain("### Summary (Claude Opus 5.5)");
    expect(markdown).toContain("- The fruit is free.");
    expect(markdown).toContain("### Article\n\nVolunteers plant apple trees.");
  });
});
