import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { englishText } from "@/i18n/stored-message";
import {
  findPaywallMarkup,
  hasPaywallMarker,
  checkPreview,
  markPasswordFields,
  passwordFieldBesideHeadline,
  passwordMarksIn,
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
    expect(removeNonFreeSections(document, [".locked", "::not a selector"]).count).toBe(2);
    expect(document.body.textContent).toBe("free");
  });

  it("says where the rest of the article is: the article or main around the removed part", () => {
    const document = doc(`<aside>Markets</aside><main><article><h1>Title</h1><div class="body"><p>free</p><div class="locked">a</div></div></article></main>`);
    const { count, containers } = removeNonFreeSections(document, [".locked"]);
    expect(count).toBe(1);
    expect(containers.map((c) => c.tagName)).toEqual(["ARTICLE"]);
    const bare = doc(`<p>other</p><div class="wrap"><p>free</p><div class="locked">a</div></div>`);
    expect(removeNonFreeSections(bare, [".locked"]).containers.map((c) => c.className)).toEqual(["wrap"]);
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

describe("markPasswordFields", () => {
  it("marks the field's parent, its form and the form's parent, which passwordMarksIn finds", () => {
    const page = doc(
      `<div id="outer"><form id="form"><p id="row"><input type="PASSWORD"></p></form></div><div id="other"><p>Text</p></div>`,
    );
    markPasswordFields(page);
    expect([...page.querySelectorAll("[data-read-later-password]")].map((element) => element.id)).toEqual(["outer", "form", "row"]);
    expect(passwordMarksIn(page.querySelector("#other")!)).toBe(false);
    expect(passwordMarksIn(page.querySelector("#outer")!.parentElement!)).toBe(true);
  });
});

describe("passwordFieldBesideHeadline", () => {
  const titles = ["The ferry timetable nobody asked for | Coastline Weekly"];
  const siteName = "Coastline Weekly";
  const wall = `<form><label>Password <input type="password"></label></form>`;
  const story = `<p>When the island ferry switched to its winter timetable, the first crossing left too late for the train.</p>`;

  it("finds a sign-in form in the article's own block, with or without a form element", () => {
    const page = doc(`<div class="story"><h1>The ferry timetable nobody asked for</h1>${story}${wall}</div>`);
    expect(passwordFieldBesideHeadline(page, { titles, siteName })).toBe(true);
    const formless = doc(`<div class="story"><h1>The ferry timetable nobody asked for</h1>${story}<div><input type="password"></div></div>`);
    expect(passwordFieldBesideHeadline(formless, { titles, siteName })).toBe(true);
  });

  it("ignores a sign-in form that only meets the headline in the whole page", () => {
    const filler = `<p>${"Another story on the front page. ".repeat(60)}</p>`;
    const page = doc(`<div class="top">${wall}</div><div class="story"><h1>The ferry timetable nobody asked for</h1>${story}</div>${filler}`);
    expect(passwordFieldBesideHeadline(page, { titles, siteName })).toBe(false);
  });

  it("needs the field inside the article or main element that holds the headline", () => {
    const inside = doc(`<div id="page"><main><article><h1>The ferry timetable nobody asked for</h1>${story}${wall}</article></main></div>`);
    expect(passwordFieldBesideHeadline(inside, { titles, siteName })).toBe(true);
    // A sidebar sign-in box in the same row as a short post, as in Joomla's layout.
    const sidebar = doc(
      `<div class="row"><main id="content"><h1>The ferry timetable nobody asked for</h1>${story}</main><aside class="sidebar-right">${wall}</aside></div>`,
    );
    expect(passwordFieldBesideHeadline(sidebar, { titles, siteName })).toBe(false);
    // A comment form whose password lets the commenter edit it later, as on FC2 blogs.
    const comments = doc(
      `<main class="primary"><article><h1>The ferry timetable nobody asked for</h1>${story}</article><article id="comment-top"><form><textarea></textarea><input type="password"></form></article></main>`,
    );
    expect(passwordFieldBesideHeadline(comments, { titles, siteName })).toBe(false);
  });

  it("ignores the site's name as a headline, and the page's header", () => {
    const named = doc(`<div class="top"><h1>Coastline Weekly</h1>${wall}</div><article><h2>Ferries</h2>${story}</article>`);
    expect(passwordFieldBesideHeadline(named, { titles: ["Ferries - Coastline Weekly"], siteName })).toBe(false);
    const header = doc(`<header><h1>The ferry timetable nobody asked for</h1>${wall}</header><article>${story}</article>`);
    expect(passwordFieldBesideHeadline(header, { titles, siteName })).toBe(false);
  });

  it("ignores a sign-in box hidden beside the headline until it is opened", () => {
    for (const hidden of [
      `<div class="hide">${wall}</div>`,
      `<div id="login-modal">${wall}</div>`,
      `<div class="newspack-ui__modal-container">${wall}</div>`,
      `<div aria-hidden="true">${wall}</div>`,
      `<div style="display: none">${wall}</div>`,
      `<dialog>${wall}</dialog>`,
    ]) {
      const page = doc(`<section><div class="story"><h1>The ferry timetable nobody asked for</h1>${story}</div>${hidden}</section>`);
      expect(passwordFieldBesideHeadline(page, { titles, siteName }), hidden).toBe(false);
    }
    // Utility classes that merely contain "hidden" don't count.
    const page = doc(`<div class="story overflow-hidden"><h1>The ferry timetable nobody asked for</h1>${story}${wall}</div>`);
    expect(passwordFieldBesideHeadline(page, { titles, siteName })).toBe(true);
  });

  it("needs a headline that is most of the title", () => {
    const page = doc(`<div><h1>Ferries</h1>${story}${wall}</div>`);
    expect(passwordFieldBesideHeadline(page, { titles, siteName })).toBe(false);
    expect(passwordFieldBesideHeadline(page, { titles: [null, ""], siteName: null })).toBe(false);
  });
});

describe("checkPreview", () => {
  const complete: PreviewCheck = {
    contentSource: "server",
    httpStatus: 200,
    paywall: { notFree: false, selectors: [] },
    removedSections: 0,
    passwordFieldInArticle: false,
    paywallMarker: false,
    pageTitle: "A long story",
    foundArticle: true,
    wordCount: 1200,
  };

  it("accepts a complete free article", () => {
    expect(checkPreview(complete)).toBeNull();
  });

  it("flags login, subscription and refused responses on our own downloads", async () => {
    expect(checkPreview({ ...complete, httpStatus: 401 })).toEqual({
      kind: "login",
      reason: { key: "preview.loginRequired", values: { status: "401" } },
    });
    expect(checkPreview({ ...complete, httpStatus: 402 })?.reason).toEqual({
      key: "preview.subscriptionRequired",
      values: { status: "402" },
    });
    // A 403 may be a site turning away downloads that aren't from a browser, not a login.
    const refused = checkPreview({ ...complete, httpStatus: 403 })!.reason;
    expect(refused).toEqual({ key: "preview.downloadRefused", values: { status: "403" } });
    expect(await englishText(refused)).toMatch(/refused the server’s download \(HTTP 403\).*browser/);
    expect(checkPreview({ ...complete, httpStatus: 403, contentSource: "client" })).toBeNull();
  });

  it("flags subscriber-only markup on our own downloads, not on the owner's browser copy", () => {
    const marked = { ...complete, paywall: { notFree: true, selectors: [] } };
    expect(checkPreview(marked)?.reason).toEqual({ key: "preview.subscriberOnly" });
    expect(checkPreview({ ...marked, contentSource: "client" })).toBeNull();
  });

  it("flags short pages with a password field in the article or a sign-in title", () => {
    const loginPage = { key: "preview.loginPage" };
    expect(checkPreview({ ...complete, passwordFieldInArticle: true, wordCount: 120 })?.reason).toEqual(loginPage);
    expect(checkPreview({ ...complete, pageTitle: "Log in | Example", wordCount: 150 })?.reason).toEqual(loginPage);
    expect(checkPreview({ ...complete, pageTitle: "请登录", wordCount: 150 })?.reason).toEqual(loginPage);
    expect(checkPreview({ ...complete, passwordFieldInArticle: true, wordCount: 1500 })).toBeNull();
  });

  it("flags short teasers next to a paywall, and very short texts", () => {
    expect(checkPreview({ ...complete, contentSource: "client", paywallMarker: true, wordCount: 250 })?.reason).toEqual({
      key: "preview.teaser",
    });
    expect(checkPreview({ ...complete, wordCount: 40 })?.reason).toEqual({ key: "preview.tooShort" });
  });

  it("says which previews are worth summarizing", () => {
    expect(checkPreview({ ...complete, passwordFieldInArticle: true, wordCount: 120 })?.kind).toBe("login");
    expect(previewIsSummarizable("login")).toBe(false);
    expect(previewIsSummarizable("no_article")).toBe(false);
    expect(previewIsSummarizable("too_short")).toBe(false);
    expect(previewIsSummarizable("subscriber_only")).toBe(true);
    expect(previewIsSummarizable("teaser")).toBe(true);
    expect(previewIsSummarizable(null)).toBe(true);
  });

  it("flags pages where no article was found", () => {
    expect(checkPreview({ ...complete, foundArticle: false })?.reason).toEqual({ key: "preview.noArticle" });
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

describe("sanitizeArticleHtml", () => {
  it("prefixes ids so article content can't shadow page globals, and keeps anchor links working", async () => {
    const { sanitizeArticleHtml } = await import("./sanitize");
    const html = sanitizeArticleHtml(
      `<p>Text<a href="#fn1">1</a></p><a id="__next_f">x</a><p id="fn1">Footnote</p><a href="https://example.com">out</a>`,
    );
    expect(html).toContain('id="user-content-fn1"');
    expect(html).toContain('href="#user-content-fn1"');
    expect(html).toContain('id="user-content-__next_f"');
    expect(html).not.toMatch(/id="__next_f"/);
    expect(html).toContain('href="https://example.com" target="_blank" rel="noopener noreferrer nofollow"');
  });
});
