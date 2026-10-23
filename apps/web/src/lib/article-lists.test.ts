import { describe, expect, it } from "vitest";
import { listOf, listUrl } from "./article-lists";

describe("listOf", () => {
  it("names the list an address shows, whatever its query", () => {
    expect(listOf("/inbox")).toBe("inbox");
    expect(listOf("/archive?folder=f1&page=2")).toBe("archive");
    expect(listOf("/favorites/?q=bridge")).toBe("favorites");
    expect(listOf("/triage#next")).toBe("triage");
  });

  it("is null for any other page", () => {
    for (const url of ["/", "/articles/abc", "/articles/abc/compare", "/settings", "/inboxes", "/admin/usage"]) {
      expect(listOf(url), url).toBeNull();
    }
  });
});

describe("listUrl", () => {
  it("keeps a list's folder, tag, search and page, and drops a one-off notice", () => {
    expect(listUrl("/inbox", "")).toBe("/inbox");
    expect(listUrl("/inbox", "?saved=saved")).toBe("/inbox");
    expect(listUrl("/archive", "?shared=nolink&folder=f1&page=2")).toBe("/archive?folder=f1&page=2");
    expect(listUrl("/favorites", "q=bridge+closure&tag=city")).toBe("/favorites?q=bridge+closure&tag=city");
  });

  it("is null for any other page", () => {
    expect(listUrl("/articles/abc", "?q=x")).toBeNull();
  });
});
