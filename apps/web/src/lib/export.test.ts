import { createTranslator } from "next-intl";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import { articles, summaries } from "@/db/schema";
import type { AppLocale } from "@/i18n/locales";
import { loadMessages } from "@/i18n/messages";
import { createTestDb, createTestUser } from "@/test/db";
import { exportToMarkdown, loadExport, type ExportData } from "./export";
import { findOrCreateFolder, setArticleFolder } from "./folders";
import { sendFeedback } from "./feedback";
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
  await sendFeedback(db, "user-1", "Thanks for the app.");
  await sendFeedback(db, "user-2", "Not my feedback");
});
afterAll(() => close());

async function markdownIn(locale: AppLocale, data: ExportData) {
  const messages = await loadMessages(locale);
  return exportToMarkdown(
    data,
    createTranslator({ locale, messages, namespace: "Export" }),
    createTranslator({ locale, messages, namespace: "Errors" }),
  );
}

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
    expect(data.feedback.map((row) => row.message)).toEqual(["Thanks for the app."]);
    expect(JSON.stringify(data)).not.toContain("Not mine");
    expect(JSON.stringify(data)).not.toContain("Not my feedback");
  });

  it("writes readable Markdown", async () => {
    const markdown = await markdownIn("en", await loadExport(db, "user-1"));
    expect(markdown).toContain("# ReadSooner export");
    expect(markdown).toMatch(/^Exported \d{4}-\d{2}-\d{2} · 1 article$/m);
    expect(markdown).toMatch(/^- saved \d{4}-\d{2}-\d{2} · unread · in Inbox · ★ favorite$/m);
    expect(markdown).toContain("## Community orchards");
    expect(markdown).toContain("- URL: <https://example.com/orchards>");
    expect(markdown).toContain("- Folder: Long reads");
    expect(markdown).toContain("- Tags: #gardening");
    expect(markdown).toContain("### Summary (Claude Opus 5.5)");
    expect(markdown).toContain("- The fruit is free.");
    expect(markdown).toContain("### Article\n\nVolunteers plant apple trees.");
  });

  it("says why a copy is only a preview, in the reader's language", async () => {
    const data = await loadExport(db, "user-1");
    const preview = {
      ...data.articles[0]!,
      previewOnly: true,
      previewReason: "Old English text.",
      previewReasonMessage: { key: "preview.loginPage" },
    };
    const markdown = await markdownIn("en", { ...data, articles: [preview] });
    expect(markdown).toContain("- Preview only: This looks like a login page rather than the article.");
    // Rows saved before message keys show their English text.
    const older = await markdownIn("en", { ...data, articles: [{ ...preview, previewReasonMessage: null }] });
    expect(older).toContain("- Preview only: Old English text.");
  });

  it("keeps the same structure in another language", async () => {
    const data = await loadExport(db, "user-1");
    const headings = (markdown: string) => markdown.split("\n").filter((line) => /^#+ |^---$/.test(line));
    const english = await markdownIn("en", data);
    const french = await markdownIn("fr", data);
    expect(headings(french).map((line) => line.replace(/ .*/, ""))).toEqual(["#", "---", "##", "###", "###"]);
    expect(headings(french)).toContain("## Community orchards");
    expect(french.split("\n")).toHaveLength(english.split("\n").length);
    expect(french).toContain("<https://example.com/orchards>");
    expect(french).toContain("#gardening");
    expect(french).toContain("Volunteers plant apple trees.");
  });
});
