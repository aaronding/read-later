import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OfflineCopy } from "./copy";
import {
  claimOwner,
  clearKept,
  closeStore,
  getKept,
  getOwner,
  keptBytes,
  keptIdList,
  keptVersions,
  listKept,
  putCopies,
  removeKept,
  subscribe,
  updateCopies,
} from "./store";
import { keepArticle, syncKept } from "./sync";

const ID_A = "00000000-0000-4000-8000-00000000000a";
const ID_B = "00000000-0000-4000-8000-00000000000b";

function copy(id: string, overrides: Partial<OfflineCopy> = {}): OfflineCopy {
  return {
    id,
    version: "1:",
    url: `https://example.com/${id}`,
    title: `Article ${id.slice(-1)}`,
    siteName: "Example",
    author: null,
    lang: "en",
    publishedAt: null,
    savedAt: "2026-10-01T00:00:00.000Z",
    readingMinutes: 4,
    previewOnly: false,
    contentHtml: "<p>Text</p>",
    excerpt: null,
    summary: null,
    ...overrides,
  };
}

beforeEach(() => {
  // A fresh, empty IndexedDB for each test; one tab, so no BroadcastChannel.
  vi.stubGlobal("indexedDB", new IDBFactory());
  vi.stubGlobal("BroadcastChannel", undefined);
});

afterEach(async () => {
  await closeStore();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the kept articles", () => {
  it("keeps copies, lists the most recently kept first and removes them", async () => {
    await putCopies([copy(ID_A)], new Date("2026-10-02T00:00:00Z"));
    await putCopies([copy(ID_B)], new Date("2026-10-03T00:00:00Z"));
    expect((await listKept()).map((article) => article.id)).toEqual([ID_B, ID_A]);
    expect((await getKept(ID_A))?.keptAt).toBe("2026-10-02T00:00:00.000Z");
    expect((await keptIdList()).sort()).toEqual([ID_A, ID_B]);

    await removeKept([ID_B]);
    expect((await listKept()).map((article) => article.id)).toEqual([ID_A]);
    expect(await getKept(ID_B)).toBeUndefined();
  });

  it("keeps the time an article was first kept when its copy is replaced", async () => {
    await putCopies([copy(ID_A)], new Date("2026-10-02T00:00:00Z"));
    await putCopies([copy(ID_A, { version: "2:", title: "New title" })], new Date("2026-10-05T00:00:00Z"));
    const kept = await getKept(ID_A);
    expect(kept).toMatchObject({ version: "2:", title: "New title", keptAt: "2026-10-02T00:00:00.000Z" });
    expect(await keptVersions()).toEqual({ [ID_A]: "2:" });
  });

  it("updates only copies still kept", async () => {
    await putCopies([copy(ID_A)]);
    await updateCopies([copy(ID_A, { version: "2:" }), copy(ID_B, { version: "2:" })]);
    expect(await keptVersions()).toEqual({ [ID_A]: "2:" });
  });

  it("tells listeners about each change", async () => {
    const listener = vi.fn();
    const stop = subscribe(listener);
    await putCopies([copy(ID_A)]);
    await removeKept([ID_A]);
    expect(listener).toHaveBeenCalledTimes(2);
    stop();
    await putCopies([copy(ID_A)]);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("counts about two bytes a character", () => {
    const article = { ...copy(ID_A), keptAt: "2026-10-02T00:00:00.000Z" };
    expect(keptBytes([article, article])).toBe(JSON.stringify(article).length * 4);
  });
});

describe("the account they belong to", () => {
  it("keeps the articles for the same account", async () => {
    expect(await claimOwner({ id: "user-1", email: "one@example.com" })).toBe(false);
    await putCopies([copy(ID_A)]);
    expect(await claimOwner({ id: "user-1", email: "one@example.com" })).toBe(false);
    expect(await listKept()).toHaveLength(1);
  });

  it("removes another account's articles when someone else signs in", async () => {
    await claimOwner({ id: "user-1", email: "one@example.com" });
    await putCopies([copy(ID_A)]);
    expect(await claimOwner({ id: "user-2", email: "two@example.com" })).toBe(true);
    expect(await listKept()).toEqual([]);
    expect(await getOwner()).toEqual({ id: "user-2", email: "two@example.com" });
  });

  it("forgets the articles and the account on signing out", async () => {
    await claimOwner({ id: "user-1", email: "one@example.com" });
    await putCopies([copy(ID_A)]);
    await clearKept();
    expect(await listKept()).toEqual([]);
    expect(await getOwner()).toBeUndefined();
  });
});

describe("keeping and syncing with the server", () => {
  function answer(body: unknown, status = 200) {
    return vi.fn(async (_url: string, init?: RequestInit) => {
      void init;
      return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    });
  }
  const sent = (fetchMock: ReturnType<typeof answer>) => JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as unknown;

  it("keeps an article the server sends", async () => {
    const fetchMock = answer({ copies: [copy(ID_A)], removed: [] });
    vi.stubGlobal("fetch", fetchMock);
    expect(await keepArticle(ID_A)).toBe(true);
    expect(sent(fetchMock)).toEqual({ have: { [ID_A]: null } });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/offline");
    expect((await getKept(ID_A))?.title).toBe("Article a");
  });

  it("asks the browser to keep the storage once something is kept", async () => {
    vi.stubGlobal("fetch", answer({ copies: [copy(ID_A)], removed: [] }));
    const persist = vi.fn(async () => true);
    vi.stubGlobal("navigator", { storage: { persisted: async () => false, persist } });
    await keepArticle(ID_A);
    expect(persist).toHaveBeenCalledOnce();
  });

  it("keeps nothing when the server no longer has the article", async () => {
    vi.stubGlobal("fetch", answer({ copies: [], removed: [ID_A] }));
    expect(await keepArticle(ID_A)).toBe(false);
    expect(await listKept()).toEqual([]);
  });

  it("fails without keeping anything when the server refuses", async () => {
    vi.stubGlobal("fetch", answer({ ok: false }, 401));
    await expect(keepArticle(ID_A)).rejects.toThrow("401");
    expect(await listKept()).toEqual([]);
  });

  it("brings changed copies up to date and drops deleted ones", async () => {
    await putCopies([copy(ID_A), copy(ID_B)]);
    const fetchMock = answer({ copies: [copy(ID_A, { version: "2:", summary: { model: "m", language: "en", tldr: "Short.", keyPoints: [], partial: false } })], removed: [ID_B] });
    vi.stubGlobal("fetch", fetchMock);
    await syncKept();
    expect(sent(fetchMock)).toEqual({ have: { [ID_A]: "1:", [ID_B]: "1:" } });
    const kept = await listKept();
    expect(kept.map((article) => article.id)).toEqual([ID_A]);
    expect(kept[0]?.summary?.tldr).toBe("Short.");
  });

  it("asks nothing when nothing is kept", async () => {
    const fetchMock = answer({ copies: [], removed: [] });
    vi.stubGlobal("fetch", fetchMock);
    await syncKept();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
