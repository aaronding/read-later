import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { extractArticle } from "./extract";
import { msnArticlePage, msnArticleRef, msnContentUrl } from "./msn";

const here = path.dirname(fileURLToPath(import.meta.url));
const reply = () => JSON.parse(readFileSync(path.join(here, "fixtures", "msn-article.json"), "utf-8"));
const PAGE_URL = "https://www.msn.com/en-us/news/other/why-a-small-town-library-started-fixing-toasters/ar-AA1test";

describe("msnArticleRef", () => {
  it("finds the article in an MSN article's address", () => {
    expect(msnArticleRef(PAGE_URL)).toEqual({ id: "AA1test", market: "en-us" });
    expect(msnArticleRef("https://msn.com/EN-GB/money/other/some-story/ar-BB1xYz?ocid=msedgntp&cvid=1#top")).toEqual({
      id: "BB1xYz",
      market: "en-gb",
    });
    expect(msnArticleRef("https://www.msn.com/fr-fr/actualite/ar-AA2abc/")).toEqual({ id: "AA2abc", market: "fr-fr" });
  });

  it("ignores other addresses", () => {
    for (const url of [
      "https://www.msn.com/en-us/news/other/a-video/vi-AA2avStn",
      "https://www.msn.com/en-us/news/photos/a-slideshow/ss-AA2abc",
      "https://www.msn.com/en-us/news",
      "https://www.msn.com/news/other/no-market/ar-AA2abc",
      "https://www.msn.com.example/en-us/news/other/a-story/ar-AA2abc",
      "https://evil.example/en-us/news/other/a-story/ar-AA2abc",
      "ftp://www.msn.com/en-us/news/other/a-story/ar-AA2abc",
      "not a url",
    ]) {
      expect(msnArticleRef(url), url).toBeNull();
    }
  });

  it("asks MSN's content service for it", () => {
    expect(msnContentUrl({ id: "AA1test", market: "en-us" })).toBe(
      "https://assets.msn.com/content/view/v2/Detail/en-us/AA1test",
    );
  });
});

describe("msnArticlePage", () => {
  const page = msnArticlePage(reply())!;
  const result = extractArticle({ html: page, url: PAGE_URL, contentSource: "server", httpStatus: 200 });

  it("reads the article and its details", () => {
    expect(result).toMatchObject({
      title: "Why a small-town library started fixing toasters",
      author: "Dana Whitfield",
      siteName: "The Riverside Ledger",
      lang: "en-us",
      excerpt: "Volunteers fix toasters, bicycles and jackets once a month, and the waiting list keeps growing.",
      previewOnly: false,
      previewReason: null,
    });
    expect(result.publishedAt?.toISOString()).toBe("2026-11-02T11:00:00.000Z");
    expect(result.textContent).toContain("smells faintly of solder");
    expect(result.textContent).toContain("left with it playing");
    expect(result.wordCount).toBeGreaterThan(200);
    expect(result.contentHtml).toContain('href="https://www.riversideledger.example/repair-cafe-guide"');
  });

  it("fills in the pictures, at a reasonable size, with their captions", () => {
    const content = result.contentHtml ?? "";
    expect(content).toContain('src="https://img-s-msn-com.akamaized.net/tenant/amp/entityid/AA1hero.img?w=1200"');
    expect(content).toContain('src="https://img-s-msn-com.akamaized.net/tenant/amp/entityid/AA1bench.img?w=960"');
    expect(content).toContain(
      "<figcaption>Marta Lindqvist rewires a lamp at the library's repair bench. © Sam Okafor/Riverside Ledger</figcaption>",
    );
    // The first picture's caption is only the title.
    expect(content.match(/<figcaption>/g)).toHaveLength(1);
    expect(content).not.toContain("data-reference");
  });

  it("leaves out what the publisher's feed adds", () => {
    for (const extra of ["Weekend Ledger newsletter", "Enjoying our content", "Most Read From", "bridge closes"]) {
      expect(result.textContent, extra).not.toContain(extra);
    }
  });

  it("writes the reply's details into the page as text", () => {
    const title = 'A <script>alert(1)</script> "title"';
    const abstract = '"><img src=x onerror=alert(1)>';
    const html = msnArticlePage({ ...reply(), title, abstract })!;
    const { document } = new JSDOM(html).window;
    expect(document.title).toBe(title);
    expect(document.querySelector("h1")?.textContent).toBe(title);
    expect(document.querySelector('meta[name="description"]')?.getAttribute("content")).toBe(abstract);
    expect(document.querySelectorAll("script, img[src=x]")).toHaveLength(0);
  });

  it("gives nothing for a reply without an article MSN shows to anyone", () => {
    expect(msnArticlePage({ ...reply(), type: "video" })).toBeNull();
    expect(msnArticlePage({ ...reply(), body: "  " })).toBeNull();
    expect(msnArticlePage({ ...reply(), renderingRestriction: 1 })).toBeNull();
    expect(msnArticlePage({ ...reply(), subscriptionProductType: 2 })).toBeNull();
    expect(msnArticlePage({ ...reply(), intAttributes: { ...reply().intAttributes, isEmbedOnly: 1 } })).toBeNull();
    expect(msnArticlePage(null)).toBeNull();
    expect(msnArticlePage([])).toBeNull();
    expect(msnArticlePage("<html></html>")).toBeNull();
  });
});
