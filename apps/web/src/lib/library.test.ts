import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import { articles, jobs, summaries } from "@/db/schema";
import { createTestDb, createTestUser } from "@/test/db";
import { refreshSearchVector } from "./search-index";
import {
  deleteArticle,
  getArticle,
  listArticles,
  markOpened,
  retryArticle,
  setArchived,
  setFavorite,
  shownSummary,
  triageLater,
  triageQueue,
} from "./library";

let db: Db;
let close: () => Promise<void>;
const ids: Record<string, string> = {};

async function addArticle(
  key: string,
  values: { userId?: string; title: string; text: string; savedAt: string; tldr?: string },
) {
  const userId = values.userId ?? "user-1";
  const [row] = await db
    .insert(articles)
    .values({
      userId,
      url: `https://example.com/${key}`,
      normalizedUrl: `https://example.com/${key}`,
      title: values.title,
      textContent: values.text,
      contentHtml: `<p>${values.text}</p>`,
      status: "ready",
      summaryModel: "claude-opus-5-5",
      savedAt: new Date(values.savedAt),
    })
    .returning();
  if (values.tldr) {
    await db.insert(summaries).values({
      userId,
      articleId: row!.id,
      model: "claude-opus-5-5",
      status: "ready",
      tldr: values.tldr,
      keyPoints: [],
      completedAt: new Date(),
    });
  }
  await refreshSearchVector(db, row!.id);
  ids[key] = row!.id;
}

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await createTestUser(db);
  await createTestUser(db, "other@example.com", "user-2");
  await addArticle("orchards", {
    title: "The quiet return of community orchards",
    text: "Volunteers plant apple trees on public land.",
    savedAt: "2026-10-01",
    tldr: "Towns are planting fruit trees again.",
  });
  await addArticle("trams", { title: "Why the tram plan stalled", text: "Costs rose and the route was disputed.", savedAt: "2026-10-02" });
  await addArticle("doujiang", { title: "老街口的豆浆铺", text: "陈阿姨每天凌晨三点起床泡豆。", savedAt: "2026-10-03" });
  await addArticle("private", {
    userId: "user-2",
    title: "Another user's orchards article",
    text: "Not yours.",
    savedAt: "2026-10-04",
  });
});
afterAll(() => close());

describe("listArticles", () => {
  it("lists the Inbox newest first, only for this user, with the TL;DR", async () => {
    const { items } = await listArticles(db, "user-1", { view: "inbox" });
    expect(items.map((item) => item.title)).toEqual([
      "老街口的豆浆铺",
      "Why the tram plan stalled",
      "The quiet return of community orchards",
    ]);
    expect(items[2]).toMatchObject({ tldr: "Towns are planting fruit trees again.", summaryStatus: "ready" });
  });

  it("separates Inbox, Favorites and Archive", async () => {
    await setArchived(db, "user-1", ids.trams!, true);
    await setFavorite(db, "user-1", ids.orchards!, true);
    const inbox = await listArticles(db, "user-1", { view: "inbox" });
    const archive = await listArticles(db, "user-1", { view: "archive" });
    const favorites = await listArticles(db, "user-1", { view: "favorites" });
    expect(inbox.items.map((item) => item.id)).not.toContain(ids.trams);
    expect(archive.items.map((item) => item.id)).toEqual([ids.trams]);
    expect(favorites.items.map((item) => item.id)).toEqual([ids.orchards]);
    await setArchived(db, "user-1", ids.trams!, false);
  });

  it("can't change another user's article", async () => {
    await setArchived(db, "user-1", ids.private!, true);
    await deleteArticle(db, "user-1", ids.private!);
    const [row] = await db.select().from(articles).where(eq(articles.id, ids.private!));
    expect(row).toMatchObject({ archivedAt: null });
    expect(await getArticle(db, "user-1", ids.private!)).toBeNull();
  });
});

describe("search", () => {
  const search = async (query: string) =>
    (await listArticles(db, "user-1", { view: "inbox", query })).items.map((item) => item.title);

  it("matches title, text and summary words, as prefixes", async () => {
    expect(await search("orchard")).toEqual(["The quiet return of community orchards"]);
    expect(await search("apple")).toEqual(["The quiet return of community orchards"]);
    expect(await search("fruit trees")).toEqual(["The quiet return of community orchards"]);
    expect(await search("disputed")).toEqual(["Why the tram plan stalled"]);
  });

  it("matches Chinese text as a substring", async () => {
    expect(await search("豆浆")).toEqual(["老街口的豆浆铺"]);
    expect(await search("凌晨三点")).toEqual(["老街口的豆浆铺"]);
  });

  it("never returns another user's articles, and handles odd input", async () => {
    expect(await search("another")).toEqual([]);
    expect(await search("&|!:*()'")).toEqual([]);
    expect(await search("100%_")).toEqual([]);
  });
});

describe("triage", () => {
  it("offers unread Inbox articles and moves 'Later' ones to the back", async () => {
    const first = await triageQueue(db, "user-1");
    expect(first).toEqual({ nextId: ids.doujiang, remaining: 3 });
    await triageLater(db, "user-1", ids.doujiang!);
    expect((await triageQueue(db, "user-1")).nextId).toBe(ids.trams);
    await markOpened(db, "user-1", ids.trams!);
    expect(await triageQueue(db, "user-1")).toEqual({ nextId: ids.orchards, remaining: 2 });
  });
});

describe("retryArticle", () => {
  it("queues a failed download again", async () => {
    await db.update(articles).set({ status: "failed", error: "boom", contentHtml: null }).where(eq(articles.id, ids.trams!));
    await retryArticle(db, "user-1", ids.trams!);
    const [row] = await db.select().from(articles).where(eq(articles.id, ids.trams!));
    expect(row).toMatchObject({ status: "pending", error: null });
    const queued = await db.select().from(jobs).where(eq(jobs.articleId, ids.trams!));
    expect(queued).toHaveLength(1);
    expect(queued[0]!.runAt.getTime()).toBeLessThanOrEqual(Date.now());
  });
});

describe("shownSummary", () => {
  it("prefers the chosen model, then the newest ready summary", async () => {
    const found = await getArticle(db, "user-1", ids.orchards!);
    expect(shownSummary(found!.article, found!.summaries)?.model).toBe("claude-opus-5-5");
    const otherModel = { ...found!.article, summaryModel: "claude-haiku-5-5" };
    expect(shownSummary(otherModel, found!.summaries)?.model).toBe("claude-opus-5-5");
  });
});

describe("search inside summaries", () => {
  it("matches Chinese text in a summary", async () => {
    await db.insert(summaries).values({
      userId: "user-1",
      articleId: ids.trams!,
      model: "claude-haiku-5-5",
      status: "ready",
      tldr: "电车计划因成本上升而停滞。",
      keyPoints: [],
      completedAt: new Date(),
    });
    const { items } = await listArticles(db, "user-1", { view: "inbox", query: "成本上升" });
    expect(items.map((item) => item.id)).toEqual([ids.trams]);
  });
});

describe("folders and tag filters", () => {
  it("files an article in one folder and filters by folder and tag", async () => {
    const { findOrCreateFolder, listFolders, setArticleFolder, deleteFolder } = await import("./folders");
    const { addTag } = await import("./tags");
    const reading = await findOrCreateFolder(db, "user-1", "  Long   reads ");
    expect(await findOrCreateFolder(db, "user-1", "long reads")).toBe(reading); // same name, any case
    await setArticleFolder(db, "user-1", ids.orchards!, reading);
    await addTag(db, "user-1", ids.trams!, "Transport");
    await addTag(db, "user-1", ids.trams!, "transport"); // reused, not duplicated

    const inFolder = await listArticles(db, "user-1", { view: "inbox", folderId: reading! });
    expect(inFolder.items.map((item) => [item.id, item.folderName])).toEqual([[ids.orchards, "Long reads"]]);
    const tagged = await listArticles(db, "user-1", { view: "inbox", tag: "TRANSPORT" });
    expect(tagged.items.map((item) => item.id)).toEqual([ids.trams]);
    expect(await listFolders(db, "user-1")).toEqual([{ id: reading, name: "Long reads", count: 1 }]);

    // Another user's folder can't be used, and isn't listed.
    const theirs = await findOrCreateFolder(db, "user-2", "Theirs");
    await setArticleFolder(db, "user-1", ids.trams!, theirs);
    expect((await getArticle(db, "user-1", ids.trams!))?.article.folderId).toBeNull();
    expect((await listFolders(db, "user-1")).map((folder) => folder.name)).toEqual(["Long reads"]);

    // Deleting a folder keeps its articles.
    await deleteFolder(db, "user-1", reading!);
    expect((await getArticle(db, "user-1", ids.orchards!))?.article.folderId).toBeNull();
  });
});
