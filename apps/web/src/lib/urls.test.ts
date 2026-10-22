import { describe, expect, it } from "vitest";
import {
  extractFirstUrl,
  findCanonicalHref,
  normalizeUrl,
  parseHttpUrl,
  parsePastedUrl,
  trustedCanonicalUrl,
} from "./urls";

describe("parseHttpUrl", () => {
  it("accepts http and https only", () => {
    expect(parseHttpUrl("https://example.com/a")?.href).toBe("https://example.com/a");
    expect(parseHttpUrl("http://example.com")?.href).toBe("http://example.com/");
    expect(parseHttpUrl("ftp://example.com/file")).toBeNull();
    expect(parseHttpUrl("javascript:alert(1)")).toBeNull();
    expect(parseHttpUrl("file:///etc/passwd")).toBeNull();
    expect(parseHttpUrl("not a url")).toBeNull();
  });
});

describe("normalizeUrl", () => {
  it("removes utm_*, fbclid, gclid and the fragment", () => {
    expect(
      normalizeUrl("https://example.com/post?utm_source=x&utm_medium=y&id=7&fbclid=abc&gclid=def#comments"),
    ).toBe("https://example.com/post?id=7");
  });

  it("matches tracking parameters case-insensitively", () => {
    expect(normalizeUrl("https://example.com/p?UTM_Campaign=z&FBCLID=1")).toBe("https://example.com/p");
  });

  it("drops the question mark when nothing is left", () => {
    expect(normalizeUrl("https://example.com/p?utm_source=x")).toBe("https://example.com/p");
  });

  it("keeps other parameters exactly, in order and encoding", () => {
    expect(normalizeUrl("https://example.com/s?q=a%20b&page=2&utm_term=x&sort=new")).toBe(
      "https://example.com/s?q=a%20b&page=2&sort=new",
    );
  });

  it("does not treat lookalike parameter names as tracking", () => {
    expect(normalizeUrl("https://example.com/p?utmost=1&gclid_extra=2")).toBe(
      "https://example.com/p?utmost=1&gclid_extra=2",
    );
  });

  it("lowercases the host and removes default ports", () => {
    expect(normalizeUrl("HTTPS://Example.COM:443/Path")).toBe("https://example.com/Path");
  });
});

describe("trustedCanonicalUrl", () => {
  const page = "https://www.example.com/2026/10/story?utm_source=feed";

  it("uses a same-site canonical, normalized", () => {
    expect(trustedCanonicalUrl(page, "https://example.com/2026/10/story#top")).toBe(
      "https://example.com/2026/10/story",
    );
  });

  it("resolves relative canonical links against the page", () => {
    expect(trustedCanonicalUrl(page, "/2026/10/story")).toBe("https://www.example.com/2026/10/story");
  });

  it("ignores canonicals on another site", () => {
    expect(trustedCanonicalUrl(page, "https://syndication.example.net/story")).toBeNull();
    expect(trustedCanonicalUrl(page, "https://notexample.com/2026/10/story")).toBeNull();
  });

  it("ignores canonicals that point at the homepage", () => {
    expect(trustedCanonicalUrl(page, "https://www.example.com/")).toBeNull();
    expect(trustedCanonicalUrl(page, "/")).toBeNull();
  });

  it("ignores missing or non-http canonicals", () => {
    expect(trustedCanonicalUrl(page, null)).toBeNull();
    expect(trustedCanonicalUrl(page, "javascript:void(0)")).toBeNull();
  });
});

describe("findCanonicalHref", () => {
  it("finds the canonical link in raw HTML", () => {
    const html = `<html><head><link rel="stylesheet" href="/a.css"><link href='https://example.com/x?a=1&amp;b=2' rel='canonical'></head></html>`;
    expect(findCanonicalHref(html)).toBe("https://example.com/x?a=1&b=2");
  });

  it("returns null when there is none", () => {
    expect(findCanonicalHref("<html><head><title>x</title></head></html>")).toBeNull();
  });
});

describe("extractFirstUrl", () => {
  it("finds a URL after a headline in shared text", () => {
    expect(extractFirstUrl("Great read: https://example.com/story?id=1.")).toBe("https://example.com/story?id=1");
  });

  it("handles full-width punctuation after the URL", () => {
    expect(extractFirstUrl("看看这篇 https://example.com/a。")).toBe("https://example.com/a");
  });

  it("returns null when there is no URL", () => {
    expect(extractFirstUrl("just some words")).toBeNull();
    expect(extractFirstUrl(undefined)).toBeNull();
  });
});

describe("parsePastedUrl", () => {
  it("accepts full URLs and bare domains", () => {
    expect(parsePastedUrl(" https://example.com/a ")?.href).toBe("https://example.com/a");
    expect(parsePastedUrl("example.com/a")?.href).toBe("https://example.com/a");
  });

  it("rejects other schemes and non-URLs", () => {
    expect(parsePastedUrl("javascript:alert(1)")).toBeNull();
    expect(parsePastedUrl("ftp://example.com")).toBeNull();
    expect(parsePastedUrl("hello")).toBeNull();
    expect(parsePastedUrl("")).toBeNull();
  });
});
