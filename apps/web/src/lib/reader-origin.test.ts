import { describe, expect, it } from "vitest";
import { articleHref, originList, readerBack } from "./reader-origin";

describe("articleHref", () => {
  it("carries the list's whole address", () => {
    expect(articleHref("abc", "/favorites?tag=css&page=1")).toBe("/articles/abc?from=%2Ffavorites%3Ftag%3Dcss%26page%3D1");
  });
});

describe("originList", () => {
  it("knows the lists, with their search, filters and page", () => {
    expect(originList("/inbox")).toEqual({ list: "inbox", href: "/inbox" });
    expect(originList("/favorites?tag=css&page=1")).toEqual({ list: "favorites", href: "/favorites?tag=css&page=1" });
    expect(originList("/archive?q=rust")).toEqual({ list: "archive", href: "/archive?q=rust" });
    expect(originList("/triage")).toEqual({ list: "triage", href: "/triage" });
  });

  it("drops a fragment", () => {
    expect(originList("/inbox#top")).toEqual({ list: "inbox", href: "/inbox" });
  });

  it("refuses anything else", () => {
    for (const value of ["/settings", "/inboxes", "/articles/abc", "//evil.com/inbox", "https://evil.com/inbox", "inbox", "", null, ["/inbox"]]) {
      expect(originList(value), String(value)).toBeNull();
    }
  });
});

describe("readerBack", () => {
  it("goes back to the list the article was opened from", () => {
    expect(readerBack("/favorites", true)).toEqual({ list: "favorites", href: "/favorites" });
  });

  it("otherwise goes to the list the article is in", () => {
    expect(readerBack(undefined, false)).toEqual({ list: "inbox", href: "/inbox" });
    expect(readerBack("/settings", true)).toEqual({ list: "archive", href: "/archive" });
  });
});
