import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import {
  findPaywallMarkup,
  hasPaywallMarker,
  checkPreview,
  previewIsSummarizable,
  readJsonLd,
  removeNonFreeSections,
  type PreviewCheck,
} from "./paywall";
import { textStats } from "./text-stats";

const doc = (html: string) => new JSDOM(html).window.document;

describe("isAccessibleForFree markup", () => {
  it("finds marked sections through @graph and arrays, with string or boolean false", () => {
    const document = doc(`<script type="application/ld+json">[
      {"@type":"NewsArticle","isAccessibleForFree":false,"hasPart":{"@type":"WebPageElement","isAccessibleForFree":false,"cssSelector":".locked"}},
      {"@graph":[{"@type":"Article","hasPart":[{"isAccessibleForFree":"False","cssSelector":["#more", ".extra"]}]}]}
    ]</script>`);
    expect(findPaywallMarkup(readJsonLd(document))).toEqual({ notFree: true, selectors: [".locked", "#more", ".extra"] });
  });

  it("reports nothing for free articles or broken JSON-LD", () => {
    const document = doc(`<script type="application/ld+json">{"isAccessibleForFree": true}</script>
      <script type="application/ld+json">{ not json </script>`);
    expect(findPaywallMarkup(readJsonLd(document))).toEqual({ notFree: false, selectors: [] });
  });

  it("removes only the marked sections and survives bad selectors", () => {
    const document = doc(`<p class="free">free</p><div class="locked">a</div><div class="locked">b</div>`);
    expect(removeNonFreeSections(document, [".locked", "::not a selector"])).toBe(2);
    expect(document.body.textContent).toBe("free");
  });
});

describe("paywall markers", () => {
  it("spots elements named like a paywall", () => {
    expect(hasPaywallMarker(doc(`<div class="article-body paywall"></div>`))).toBe(true);
    expect(hasPaywallMarker(doc(`<div id="regwall"></div>`))).toBe(true);
    expect(hasPaywallMarker(doc(`<div class="tp-modal"></div>`))).toBe(true);
  });

  it("ignores lookalike names", () => {
    expect(hasPaywallMarker(doc(`<div class="paywalled-content-free-preview-x paywalls"></div>`))).toBe(false);
    expect(hasPaywallMarker(doc(`<div class="wallpaper"></div>`))).toBe(false);
  });
});

describe("checkPreview", () => {
  const complete: PreviewCheck = {
    contentSource: "server",
    httpStatus: 200,
    paywall: { notFree: false, selectors: [] },
    removedSections: 0,
    passwordField: false,
    paywallMarker: false,
    pageTitle: "A long story",
    foundArticle: true,
    wordCount: 1200,
  };

  it("accepts a complete free article", () => {
    expect(checkPreview(complete)).toBeNull();
  });

  it("flags login and subscription responses on our own downloads", () => {
    expect(checkPreview({ ...complete, httpStatus: 402 })?.reason).toMatch(/login or subscription/);
  });

  it("flags subscriber-only markup on our own downloads, not on the owner's browser copy", () => {
    const marked = { ...complete, paywall: { notFree: true, selectors: [] } };
    expect(checkPreview(marked)?.reason).toMatch(/subscriber-only/);
    expect(checkPreview({ ...marked, contentSource: "client" })).toBeNull();
  });

  it("flags short pages with a password field or a sign-in title", () => {
    expect(checkPreview({ ...complete, passwordField: true, wordCount: 120 })?.reason).toMatch(/login page/);
    expect(checkPreview({ ...complete, pageTitle: "Log in | Example", wordCount: 150 })?.reason).toMatch(/login page/);
    expect(checkPreview({ ...complete, pageTitle: "请登录", wordCount: 150 })?.reason).toMatch(/login page/);
    // A long article that merely has a login box in the header is fine.
    expect(checkPreview({ ...complete, passwordField: true, wordCount: 1500 })).toBeNull();
  });

  it("flags short teasers next to a paywall, and very short texts", () => {
    expect(checkPreview({ ...complete, contentSource: "client", paywallMarker: true, wordCount: 250 })?.reason).toMatch(
      /paywall/,
    );
    expect(checkPreview({ ...complete, wordCount: 40 })?.reason).toMatch(/very short/);
  });

  it("says which previews are worth summarizing", () => {
    expect(checkPreview({ ...complete, passwordField: true, wordCount: 120 })?.kind).toBe("login");
    expect(previewIsSummarizable("login")).toBe(false);
    expect(previewIsSummarizable("no_article")).toBe(false);
    expect(previewIsSummarizable("too_short")).toBe(false);
    expect(previewIsSummarizable("subscriber_only")).toBe(true);
    expect(previewIsSummarizable("teaser")).toBe(true);
    expect(previewIsSummarizable(null)).toBe(true);
  });

  it("flags pages where no article was found", () => {
    expect(checkPreview({ ...complete, foundArticle: false })?.reason).toMatch(/No article/);
  });
});

describe("textStats", () => {
  it("counts nothing in an empty string", () => {
    expect(textStats("").wordCount).toBe(0);
  });

  it("counts space-separated words", () => {
    expect(textStats("The quick brown fox — it's fast.").wordCount).toBe(6);
  });

  it("counts Chinese and Japanese characters individually", () => {
    expect(textStats("你好世界").wordCount).toBe(4);
    expect(textStats("日本語のテキスト").wordCount).toBe(8);
    expect(textStats("Next.js 很好用").wordCount).toBe(5);
  });

  it("gives at least one minute", () => {
    expect(textStats("short").readingMinutes).toBe(1);
    expect(textStats("word ".repeat(2300)).readingMinutes).toBe(10);
  });
});
