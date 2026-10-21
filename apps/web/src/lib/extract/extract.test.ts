import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { decodeHtml } from "@/lib/net/decode";
import { extractArticle } from "./extract";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => readFileSync(path.join(here, "fixtures", name));
const html = (name: string) => fixture(name).toString("utf-8");

describe("extractArticle: a typical news page", () => {
  const url = "https://www.riversideledger.example/features/community-orchards?utm_source=newsletter";
  const result = extractArticle({ html: html("news-article.html"), url, contentSource: "server", httpStatus: 200 });

  it("reads the metadata", () => {
    expect(result.title).toBe("The quiet return of community orchards");
    expect(result.siteName).toBe("Riverside Ledger");
    expect(result.author).toBe("Dana Whitfield");
    expect(result.publishedAt?.toISOString()).toBe("2026-09-14T08:30:00.000Z");
    expect(result.lang).toBe("en-GB");
    expect(result.excerpt).toBeTruthy();
    expect(result.canonicalHref).toBe(
      "https://www.riversideledger.example/features/community-orchards?utm_source=canonical",
    );
  });

  it("keeps the article and drops the page furniture", () => {
    expect(result.textContent).toContain("forty young apple trees");
    expect(result.textContent).toContain("That's sort of the point.");
    expect(result.textContent).not.toContain("Most read");
    expect(result.textContent).not.toContain("We use cookies");
    expect(result.textContent).not.toContain("All rights reserved");
  });

  it("stores sanitized HTML only", () => {
    const content = result.contentHtml ?? "";
    expect(content).toContain("<h2>Why councils are saying yes</h2>");
    for (const unsafe of ["<script", "onclick", "onerror", "javascript:", "<iframe", "<form", "<input", "<style", "<noscript"]) {
      expect(content, unsafe).not.toContain(unsafe);
    }
  });

  it("makes image and link URLs absolute and opens links safely", () => {
    const content = result.contentHtml ?? "";
    expect(content).toContain('src="https://www.riversideledger.example/images/orchard.jpg"');
    expect(content).toContain('referrerpolicy="no-referrer"');
    expect(content).toMatch(/<a href="https:\/\/www\.riversideledger\.example\/features\/orchard-guide" target="_blank" rel="noopener noreferrer nofollow">/);
  });

  it("counts words and reading time", () => {
    expect(result.wordCount).toBeGreaterThan(650);
    expect(result.wordCount).toBeLessThan(750);
    expect(result.readingMinutes).toBe(3);
  });

  it("is not a preview", () => {
    expect(result.previewOnly).toBe(false);
    expect(result.previewReason).toBeNull();
  });
});

describe("extractArticle: paywall markup", () => {
  const url = "https://coastlinecourier.example/news/harbour-budget";

  it("drops sections marked isAccessibleForFree: false on our own downloads and flags a preview", () => {
    const result = extractArticle({ html: html("paywalled-server.html"), url, contentSource: "server", httpStatus: 200 });
    expect(result.textContent).toContain("could not agree on next year's budget");
    expect(result.textContent).not.toContain("SECRET-PAYWALLED-PARAGRAPH");
    expect(result.contentHtml).not.toContain("SECRET-PAYWALLED-PARAGRAPH");
    expect(result.previewOnly).toBe(true);
    expect(result.previewReason).toMatch(/subscriber-only/);
  });

  it("keeps the full copy the owner saved from their own signed-in browser", () => {
    const result = extractArticle({ html: html("paywalled-server.html"), url, contentSource: "client" });
    expect(result.textContent).toContain("SECRET-PAYWALLED-PARAGRAPH");
    expect(result.previewOnly).toBe(false);
  });
});

describe("extractArticle: login pages and teasers", () => {
  const url = "https://metroreview.example/story/123";

  it("flags a login page as preview only", () => {
    const result = extractArticle({ html: html("login-wall.html"), url, contentSource: "server", httpStatus: 200 });
    expect(result.previewOnly).toBe(true);
    expect(result.previewReason).toMatch(/login/i);
  });

  it("flags a 401 or 403 response as preview only", () => {
    for (const httpStatus of [401, 403]) {
      const result = extractArticle({ html: html("login-wall.html"), url, contentSource: "server", httpStatus });
      expect(result.previewOnly).toBe(true);
      expect(result.previewReason).toMatch(/login or subscription/);
    }
  });

  it("flags a short teaser behind a paywall, even from the browser", () => {
    const result = extractArticle({
      html: html("teaser-paywall.html"),
      url: "https://northernstandard.example/trams",
      contentSource: "client",
    });
    expect(result.textContent).toContain("tram line along the old canal route");
    expect(result.previewOnly).toBe(true);
    expect(result.previewReason).toMatch(/paywall/);
  });
});

describe("extractArticle: a GBK-encoded Chinese page", () => {
  const page = decodeHtml(fixture("chinese-gbk.html"), "text/html");
  const result = extractArticle({ html: page, url: "https://chenbao.example/life/doujiang", contentSource: "server" });

  it("decodes the text and reads the metadata", () => {
    expect(result.title).toBe("老街口的豆浆铺");
    expect(result.siteName).toBe("城市晨报");
    expect(result.lang).toBe("zh-CN");
    expect(result.textContent).toContain("陈阿姨每天凌晨三点起床");
  });

  it("doesn't repeat the title as the first heading", () => {
    expect(result.contentHtml).not.toContain("<h1>老街口的豆浆铺</h1>");
    expect(result.contentHtml).toContain("早上七点");
  });

  it("counts Chinese characters as words", () => {
    expect(result.wordCount).toBeGreaterThan(450);
    expect(result.readingMinutes).toBeGreaterThanOrEqual(1);
    expect(result.previewOnly).toBe(false);
  });
});

describe("extractArticle: unusual input", () => {
  it("handles a page with no article", () => {
    const result = extractArticle({
      html: "<html><head><title>Empty</title></head><body></body></html>",
      url: "https://example.com/empty",
      contentSource: "server",
    });
    expect(result.title).toBe("Empty");
    expect(result.previewOnly).toBe(true);
    expect(result.textContent).toBe("");
  });

  it("never executes page scripts", () => {
    const result = extractArticle({
      html: `<html><body><script>globalThis.__ranPageScript = true;</script><article><p>${"Words here. ".repeat(80)}</p></article></body></html>`,
      url: "https://example.com/s",
      contentSource: "server",
    });
    expect((globalThis as Record<string, unknown>).__ranPageScript).toBeUndefined();
    expect(result.textContent).toContain("Words here.");
  });
});

describe("extractArticle: titles", () => {
  const page = (title: string, site: string) =>
    `<html><head><title>${title}</title><meta property="og:site_name" content="${site}"></head><body><article><p>${"Plenty of words in this paragraph. ".repeat(40)}</p></article></body></html>`;
  const extract = (title: string, site: string) =>
    extractArticle({ html: page(title, site), url: "https://example.com/a", contentSource: "client" }).title;

  it("removes the site name before or after a separator", () => {
    expect(extract("A headline | Example Times", "Example Times")).toBe("A headline");
    expect(extract("Example Times — A headline", "Example Times")).toBe("A headline");
  });

  it("keeps titles that merely contain a separator", () => {
    expect(extract("Cats - a history", "Example Times")).toBe("Cats - a history");
  });
});
