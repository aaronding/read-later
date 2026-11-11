import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { decodeHtml } from "@/lib/net/decode";
import { extractArticle, PageTooLargeError, withoutScriptsAndStyles } from "./extract";

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
    expect(result.previewReason).toEqual({ key: "preview.subscriberOnly" });
  });

  it("keeps nothing when the whole article is subscriber-only, not the page around it", () => {
    // Shaped like a CNN article: the article body is marked not free, and a
    // long sidebar of stock prices sits elsewhere on the page.
    const sidebar = Array.from({ length: 40 }, (_, i) => `<p>Stock ${i} rose sharply today on strong earnings and a bright outlook for the year.</p>`).join("");
    const body = Array.from({ length: 30 }, (_, i) => `<p>Paragraph ${i} of the article SECRET-PAYWALLED-PARAGRAPH with enough words to read as text.</p>`).join("");
    const page = `<!DOCTYPE html><html lang="en"><head><title>LinkedIn is tired of AI posts | CNN</title>
      <meta name="description" content="LinkedIn is pushing back on AI-written posts.">
      <script type="application/ld+json">{"@type":"NewsArticle","isAccessibleForFree":false,
        "hasPart":{"@type":"WebPageElement","isAccessibleForFree":false,"cssSelector":".article__content"}}</script>
      <style>${"p{color:red}".repeat(1000)}</style><script>${"var x=1;".repeat(1000)}</script></head>
      <body><section class="markets">${sidebar}</section>
      <article><main><h1>LinkedIn is tired of AI posts</h1><figure><figcaption>A photo of a phone.</figcaption></figure>
      <div class="article__content">${body}</div><p>Share</p></main></article></body></html>`;
    const result = extractArticle({ html: page, url, contentSource: "server", httpStatus: 200 });
    expect(result.textContent).toBe("");
    expect(result.contentHtml).toBeNull();
    expect(result.wordCount).toBe(0);
    expect(result.previewOnly).toBe(true);
    expect(result.previewKind).toBe("subscriber_only");
    expect(result.previewReason).toEqual({ key: "preview.subscriberOnlyNothingFree" });
    expect(result.excerpt).toBe("LinkedIn is pushing back on AI-written posts.");
    expect(result.title).toBe("LinkedIn is tired of AI posts");
    // From the owner's browser the same page is saved in full.
    const full = extractArticle({ html: page, url, contentSource: "client" });
    expect(full.textContent).toContain("SECRET-PAYWALLED-PARAGRAPH");
    expect(full.textContent).not.toContain("Stock 1 rose");
  });

  describe("a description as long as an article", () => {
    // Shaped like a LinkedIn post: the post and its comments are marked not
    // free, and the description holds the whole post, then a comment count.
    const paragraph = (n: number) => Array.from({ length: 40 }, (_, i) => `post${n}word${i}`).join(" ");
    const post = `${paragraph(1)}\n\n${paragraph(2)}\nA line of its own &amp; more\n\n${paragraph(3)}`;
    const page = (description: string, inSection = "") => `<!DOCTYPE html><html lang="en"><head><title>A post | LinkedIn</title>
      <meta name="description" content="${description}">
      <script type="application/ld+json">{"@type":"SocialMediaPosting","headline":"A post",
        "hasPart":{"@type":"WebPageElement","isAccessibleForFree":false,"cssSelector":".details"}}</script></head>
      <body><main><section class="details">${inSection}<p>${paragraph(1)}</p>
      <p>${paragraph(2)}<br>A line of its own &amp; more</p><p>${paragraph(3)}</p>
      <p>SECRET-COMMENT ${paragraph(9)}</p></section></main></body></html>`;

    it("is kept, as far as the marked sections hold it, when nothing else is free", () => {
      const result = extractArticle({ html: page(`${post} | 12 comments on LinkedIn`), url, contentSource: "server", httpStatus: 200 });
      expect(result.contentHtml).toContain(`<p>${paragraph(2)}<br>A line of its own &amp; more</p>`);
      expect(result.textContent).toBe(`${paragraph(1)}\n\n${paragraph(2)}\nA line of its own & more\n\n${paragraph(3)}`);
      expect(result.textContent).not.toContain("SECRET-COMMENT");
      expect(result.wordCount).toBe(126);
      expect(result.previewKind).toBe("subscriber_only");
      expect(result.previewReason).toEqual({ key: "preview.subscriberOnly" });
    });

    it("is not taken for the article when it is about the site", () => {
      const blurb = `${paragraph(4)} ${paragraph(5)} ${paragraph(6)}`;
      // JSON-LD in the marked section that repeats the description doesn't count.
      const jsonLd = `<script type="application/ld+json">{"@type":"WebSite","description":"${blurb}"}</script>`;
      for (const html of [page(blurb), page(blurb, jsonLd)]) {
        const result = extractArticle({ html, url, contentSource: "server", httpStatus: 200 });
        expect(result.contentHtml).toBeNull();
        expect(result.wordCount).toBe(0);
        expect(result.previewReason).toEqual({ key: "preview.subscriberOnlyNothingFree" });
      }
    });

    it("is kept when the page breaks its lines with tags", () => {
      const tagged = page(`Big news today!\n\n${post}`).replace(
        `<section class="details"><p>`,
        `<section class="details"><p>Big news today!<br><br>`,
      );
      const result = extractArticle({ html: tagged, url, contentSource: "server", httpStatus: 200 });
      expect(result.contentHtml).toMatch(/^<p>Big news today!<\/p><p>post1word0 /);
      expect(result.previewReason).toEqual({ key: "preview.subscriberOnly" });
    });
  });

  it("keeps the full copy the owner saved from their own signed-in browser", () => {
    const result = extractArticle({ html: html("paywalled-server.html"), url, contentSource: "client" });
    expect(result.textContent).toContain("SECRET-PAYWALLED-PARAGRAPH");
    expect(result.previewOnly).toBe(false);
  });
});

describe("extractArticle: login pages and teasers", () => {
  const url = "https://metroreview.example/story/123";

  describe("a bot check instead of the article", () => {
    // Shaped like Juejin's: the browser works out an answer, sets it as a
    // cookie and reloads the page, which then shows the article.
    const check = `<!DOCTYPE html><html lang="en"><head><title>Just a moment...</title></head>
      <body><script>var i = 0; while (!solves(i)) i++;
      document.cookie = "challenge=" + i + "; Max-Age=1"; window.location.reload();</script>Please wait...</body></html>`;

    it("keeps nothing of it on our own download, and says why", () => {
      const named = check.replace(
        "<title>",
        `<meta name="description" content="The site's own blurb."><meta name="author" content="The Site">
        <meta property="og:site_name" content="Checker"><link rel="canonical" href="https://metroreview.example/verify"><title>`,
      );
      const result = extractArticle({ html: named, url, contentSource: "server", httpStatus: 200, fallbackTitle: "The story" });
      expect(result).toMatchObject({
        title: "The story",
        siteName: "metroreview.example",
        author: null,
        excerpt: null,
        lang: null,
        canonicalHref: null,
        contentHtml: null,
        textContent: "",
        wordCount: 0,
      });
      expect(result.previewKind).toBe("login");
      expect(result.previewReason).toEqual({ key: "preview.browserCheck" });
      expect(extractArticle({ html: check, url, contentSource: "server", httpStatus: 200 }).title).toBe("metroreview.example");
      // A refusal says what the server was told, and keeps the page as before.
      const refused = extractArticle({ html: check, url, contentSource: "server", httpStatus: 403 });
      expect(refused).toMatchObject({ title: "Just a moment...", previewReason: { key: "preview.downloadRefused" } });
    });

    it("knows a check that waits for a cookie set elsewhere, as reCAPTCHA's does, from other scripts that read one", () => {
      // Shaped like the page NCBI sends: reCAPTCHA sets the cookie, and the page reloads once it is there.
      const recaptcha = `<!DOCTYPE html><html><head><title>Checking your browser - reCAPTCHA</title></head><body>
        <p>Checking your browser before accessing metroreview.example ...</p>
        <p><a href="/story/123">Click here</a> if you are not automatically redirected after 5 seconds.</p>
        <script>function onSuccess() { var wait = setInterval(function () {
          if (document.cookie.indexOf('recaptcha-ca-e=') != -1 || document.cookie.indexOf('recaptcha-fastly-e=') != -1 ||
            document.cookie.indexOf('recaptcha-cf-e') != -1 || document.cookie.indexOf('recaptcha-akam-e') != -1) {
            clearInterval(wait); location.reload(true); } }, 100); }</script>
        </body></html>`;
      const result = extractArticle({ html: recaptcha, url, contentSource: "server", httpStatus: 200 });
      expect(result).toMatchObject({ title: "metroreview.example", textContent: "", contentHtml: null });
      expect(result.previewReason).toEqual({ key: "preview.browserCheck" });
      // An app that reads a cookie and sends the browser elsewhere is routing, not a check.
      const app = recaptcha
        .replace("<title>Checking your browser - reCAPTCHA</title>", "<title>Overview of Open Platform</title>")
        .replace("location.reload(true);", 'window.location.href = "/fallback";');
      expect(extractArticle({ html: app, url, contentSource: "server", httpStatus: 200 }).title).toBe("Overview of Open Platform");
      // Nor is a reload far from the cookie, as Wix's sites do for a page brought back from history.
      const site = recaptcha
        .replace("<title>Checking your browser - reCAPTCHA</title>", "<title>Schedule</title>")
        .replace(/<script>[\s\S]*<\/script>/, `<script>var token = document.cookie.split(";").find(isToken);
          ${"refresh(token);\n".repeat(20)}
          if (navigation.type === "back_forward") window.location.reload();</script>`);
      expect(extractArticle({ html: site, url, contentSource: "server", httpStatus: 200 }).title).toBe("Schedule");
      // Nor a cookie read in one script and a reload in another, as on Taobao's check.
      const split = recaptcha.replace(
        "clearInterval(wait); location.reload(true); }",
        "clearInterval(wait); ready(); }</script><script>function ready() { location.reload(true); }",
      );
      expect(extractArticle({ html: split, url, contentSource: "server", httpStatus: 200 }).title).toBe(
        "Checking your browser - reCAPTCHA",
      );
    });

    it("reads the cookie and the reload from different scripts, but only from scripts that run", () => {
      const split = check.replace(`document.cookie = "challenge=" + i + "; Max-Age=1"; window.location.reload();`, `document.cookie = "challenge=" + i;</script>
        <script type="text/javascript">setTimeout(function () { location.reload(); }, 100);`);
      expect(extractArticle({ html: split, url, contentSource: "server", httpStatus: 200 }).previewReason).toEqual({
        key: "preview.browserCheck",
      });
      for (const inert of [
        `<script type="text/template">`,
        `<script type="text/javascript; charset=utf-8">`,
        `<script src="/app.js">`,
        `<script nomodule>`,
        `<template><script>`,
        `<noscript><script>`,
      ]) {
        const html = split.replace(`<script type="text/javascript">`, inert);
        expect(extractArticle({ html, url, contentSource: "server", httpStatus: 200 }).previewReason?.key, inert).not.toBe(
          "preview.browserCheck",
        );
      }
    });

    it("leaves a page with more on it to the other rules, though a script there sets a cookie and moves on", () => {
      // A homepage's consent or ad script does both, as most big pages' scripts do.
      const menu = Array.from({ length: 60 }, (_, i) => `<li><a href="/section-${i}">Section ${i} news</a></li>`).join("");
      const home = check
        .replace("<title>Just a moment...</title>", "<title>Metro Review</title>")
        .replace("Please wait...", `<nav><ul>${menu}</ul></nav><main><p>Today's top story, in a line or two.</p></main>`);
      const result = extractArticle({ html: home, url, contentSource: "server", httpStatus: 200 });
      expect(result.title).toBe("Metro Review");
      expect(result.previewReason).toEqual({ key: "preview.tooShort" });
      // A short forum post whose menu is icons: little text, but many links.
      const icons = Array.from({ length: 30 }, (_, i) => `<a href="/board-${i}"><img src="/icon-${i}.png" alt=""></a>`).join("");
      const post = home.replace(`<ul>${menu}</ul>`, icons).replace("<title>Metro Review</title>", "<title>Who wins tonight?</title>");
      expect(extractArticle({ html: post, url, contentSource: "server", httpStatus: 200 }).title).toBe("Who wins tonight?");
    });

    it("leaves a short teaser by its paywall to the teaser rule", () => {
      const teaser = check.replace(
        "Please wait...",
        `<article><h1>The story</h1><p>${"A sentence of the free part. ".repeat(10)}</p>
        <div class="paywall"><p>Subscribe to keep reading.</p></div></article>`,
      );
      expect(extractArticle({ html: teaser, url, contentSource: "server", httpStatus: 200 }).previewReason).toEqual({
        key: "preview.teaser",
      });
    });

    it("leaves a page with an article, or a login form, to the other rules", () => {
      const story = check.replace("Please wait...", `<article><p>${"A sentence of the story. ".repeat(40)}</p></article>`);
      expect(extractArticle({ html: story, url, contentSource: "server", httpStatus: 200 }).previewOnly).toBe(false);
      const login = check.replace(
        "Please wait...",
        `<main><p>Sign in with your email address and password to keep reading this story, and every other story on the site.</p>
        <form><input type="email"><input type="password"></form></main>`,
      );
      expect(extractArticle({ html: login, url, contentSource: "server", httpStatus: 200 }).previewReason).toEqual({
        key: "preview.loginPage",
      });
    });
  });

  it("flags a login page as preview only", () => {
    const result = extractArticle({ html: html("login-wall.html"), url, contentSource: "server", httpStatus: 200 });
    expect(result.previewOnly).toBe(true);
    expect(result.previewReason).toEqual({ key: "preview.loginPage" });
  });

  it("flags a 401 or 403 response as preview only", () => {
    for (const httpStatus of [401, 403]) {
      const result = extractArticle({ html: html("login-wall.html"), url, contentSource: "server", httpStatus });
      expect(result.previewOnly).toBe(true);
      expect(result.previewReason).toEqual({
        key: httpStatus === 401 ? "preview.loginRequired" : "preview.downloadRefused",
        values: { status: String(httpStatus) },
      });
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
    expect(result.previewReason).toEqual({ key: "preview.teaser" });
  });
});

describe("extractArticle: sign-in forms", () => {
  it("keeps a short story whose page carries a sign-in box in the header and a hidden modal", () => {
    const result = extractArticle({
      html: html("short-story-login-box.html"),
      url: "https://harbourside.example/story/4471",
      contentSource: "server",
      httpStatus: 200,
    });
    expect(result.textContent).toContain("a shelf of tools that card holders can borrow");
    expect(result.wordCount).toBeLessThan(300);
    expect(result.previewOnly).toBe(false);
  });

  it("keeps a short blog entry whose blog name is its h1 and whose comment form has a password", () => {
    const result = extractArticle({
      html: html("blog-comment-form.html"),
      url: "https://harbourdiary.example/entry-512.html",
      contentSource: "server",
      httpStatus: 200,
    });
    expect(result.textContent).toContain("boats came home out of a white wall");
    expect(result.wordCount).toBeLessThan(300);
    expect(result.previewOnly).toBe(false);
  });

  it("flags a short teaser with a sign-in form inside the article", () => {
    const result = extractArticle({
      html: html("inline-login-teaser.html"),
      url: "https://coastlineweekly.example/ferry",
      contentSource: "client",
    });
    expect(result.textContent).toContain("winter timetable");
    expect(result.previewKind).toBe("login");
  });

  // Readability removes the form and its wrapper once the teaser is long
  // enough to keep on its first try.
  const longer = (page: string) =>
    page.replace(
      "<p>The operator says",
      "<p>Some of them now drive to the far end of the island to catch the earlier freight boat, which takes foot passengers only when there is room on deck and leaves without notice when the tide turns. Others have moved their working day an hour later, and a few have given up the mainland job altogether.</p>\n    <p>The operator says",
    );

  it("flags a longer teaser whose sign-in form Readability removes", () => {
    const result = extractArticle({ html: longer(html("inline-login-teaser.html")), url: "https://coastlineweekly.example/ferry", contentSource: "client" });
    expect(result.wordCount).toBeGreaterThan(100);
    expect(result.previewKind).toBe("login");
  });

  it("flags the same teaser when its password field isn't in a form", () => {
    const formless = longer(html("inline-login-teaser.html"))
      .replace('<form action="/account/login" method="post">', '<div class="fields">')
      .replace("</form>", "</div>");
    const result = extractArticle({ html: formless, url: "https://coastlineweekly.example/ferry", contentSource: "client" });
    expect(result.previewKind).toBe("login");
  });
});

describe("extractArticle: a page hidden until its scripts run", () => {
  const page = html("hidden-until-script.html");
  const url = "https://lanterncity.example/news/night-market";

  it("finds the article inside wrappers hidden by an inline visibility:hidden, and keeps one copy", () => {
    const result = extractArticle({ html: page, url, contentSource: "server", httpStatus: 200 });
    expect(result.previewOnly).toBe(false);
    expect(result.textContent.split("old harbour car park")).toHaveLength(2);
    expect(result.wordCount).toBeGreaterThan(100);
  });

  it("leaves hidden text out when the visible page has the article", () => {
    const visible = page
      .replace('<div id="pc" style="visibility:hidden">', '<div id="pc">')
      .replace("<!-- The page's own script", '<div style="visibility: hidden"><p>Subscribe to our newsletter for the best of Lantern City every morning.</p></div>\n<!-- The page\'s own script');
    const result = extractArticle({ html: visible, url, contentSource: "server", httpStatus: 200 });
    expect(result.textContent).toContain("old harbour car park");
    expect(result.textContent).not.toContain("newsletter");
  });
});

describe("extractArticle: an article hidden from screen readers only", () => {
  const page = html("screen-reader-hidden.html");
  const url = "https://circuitweekly.example/news/radio-repair";
  const opened = page.replace('class="text-copy paywall-locker"', 'class="text-copy"');

  it("reads the paragraphs and headings marked aria-hidden beside the visible ones", () => {
    const result = extractArticle({ html: page, url, contentSource: "server", httpStatus: 200 });
    expect(result.textContent).toContain("thirty years taking apart radios");
    expect(result.textContent).toContain("The hardest part of the work is finding parts.");
    expect(result.textContent).toContain("whatever the weather or the state of the world outside");
    expect(result.contentHtml).toContain("<h2>Parts nobody makes any more</h2>");
    expect(result.contentHtml).not.toContain("aria-hidden");
    expect(result.wordCount).toBeGreaterThan(400);
    expect(result.previewOnly).toBe(false);
  });

  it("leaves out a hidden box beside them, and hidden menus elsewhere", () => {
    const result = extractArticle({ html: page, url, contentSource: "server", httpStatus: 200 });
    expect(result.textContent).not.toContain("newsletter");
    expect(result.textContent).not.toContain("Reviews");
  });

  it("leaves them out on a server download whose paywall markup says the article isn't free", () => {
    const marked = page.replace(
      "</head>",
      '<script type="application/ld+json">{"@type":"NewsArticle","isAccessibleForFree":false}</script></head>',
    );
    const result = extractArticle({ html: marked, url, contentSource: "server", httpStatus: 200 });
    expect(result.textContent).toContain("thirty years taking apart radios");
    expect(result.textContent).not.toContain("finding parts");
    expect(result.previewKind).toBe("subscriber_only");
  });

  it("reads them from the browser once the wall has let the reader through, not while it still holds the article", () => {
    const open = extractArticle({ html: opened, url, contentSource: "client" });
    expect(open.textContent).toContain("whatever the weather or the state of the world outside");
    expect(open.previewOnly).toBe(false);
    const closed = extractArticle({ html: page, url, contentSource: "client" });
    expect(closed.textContent).toContain("thirty years taking apart radios");
    expect(closed.textContent).not.toContain("finding parts");
    expect(closed.previewKind).toBe("teaser");
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

describe("extractArticle: a page with no whitespace between its blocks", () => {
  // Shaped like a minified page, or one built from MSN's content service.
  const blocks = [
    "<h1>Who checks the box</h1>",
    "<p>Most forms ask new staff about their background, and many people hesitate before they check the box.</p>",
    "<p>When employers explain why they ask, more people answer, and the numbers they report get closer to the truth.</p>",
    "<h2>What the survey found</h2>",
    "<ul><li>Two thirds answered every question</li><li>One in ten left the form blank</li></ul>",
    "<blockquote><p>People want to know what happens to their answers.</p></blockquote>",
    '<figure><img src="/chart.png" alt=""><figcaption>Answers by year</figcaption></figure>',
    "<table><tr><th>Year</th><th>Answered</th></tr><tr><td>2025</td><td>61%</td></tr></table>",
    "<div><div><p>The survey ran from March<br>to May, in four cities.</p></div></div>",
    "<p>Next year it will ask the same questions again, so that the change can be measured over time.</p>",
  ];
  const page = (between: string) =>
    `<!DOCTYPE html><html lang="en"><head><title>Who checks the box</title></head><body><article>${blocks.join(between)}</article></body></html>`;
  const url = "https://example.com/survey";
  const minified = extractArticle({ html: page(""), url, contentSource: "client" });

  it("keeps a line break between blocks and for each <br>, and a space between table cells", () => {
    expect(minified.textContent).toContain("check the box.\nWhen employers");
    expect(minified.textContent).toBe(
      [
        "Most forms ask new staff about their background, and many people hesitate before they check the box.",
        "When employers explain why they ask, more people answer, and the numbers they report get closer to the truth.",
        "What the survey found",
        "Two thirds answered every question",
        "One in ten left the form blank",
        "People want to know what happens to their answers.",
        "Answers by year",
        "Year Answered",
        "2025 61%",
        "The survey ran from March",
        "to May, in four cities.",
        "Next year it will ask the same questions again, so that the change can be measured over time.",
      ].join("\n"),
    );
  });

  it("reads the same as the page with a line break between its tags", () => {
    const formatted = extractArticle({ html: page("\n"), url, contentSource: "client" });
    expect(minified.textContent).toBe(formatted.textContent);
    expect(minified.wordCount).toBe(formatted.wordCount);
    expect(minified.readingMinutes).toBe(formatted.readingMinutes);
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

describe("extractArticle: scripts, styles and size", () => {
  const url = "https://example.com/story";
  const words = (n: number, word = "text") => Array.from({ length: n }, (_, i) => `${word}${i}`).join(" ");
  const story = `<article><h1>The story</h1><p>${words(150, "ARTICLE")}</p><p>${words(150, "MORE")}</p></article>`;

  it("empties scripts and styles where the HTML parser sees them, and nowhere else", () => {
    const cases = [
      `<!-- TODO: move <script src="/old.js"> below -->${story}`,
      `<script-loader>${story}</script-loader>`,
      `<div data-embed="<script async src=x>">${story}</div>`,
      `<script>var s = "<\/script>";</script>${story}`,
      `<script>document.write("x")</script foo>${story}`,
    ];
    for (const body of cases) {
      const page = `<!DOCTYPE html><html><head><title>Why the <script> tag blocks rendering</title></head><body>${body}</body></html>`;
      const result = extractArticle({ html: page, url, contentSource: "client" });
      expect(result.textContent, body).toContain("ARTICLE149");
      expect(result.textContent, body).toContain("MORE149");
      expect(result.textContent, body).not.toContain("document.write");
    }
    const { html: stripped } = withoutScriptsAndStyles(`<style id="paywall-css">.x{}</style><script>alert(1)</script><p>keep</p>`);
    expect(stripped).toContain('<style id="paywall-css"></style>'); // the element and its name stay
    expect(stripped).not.toContain("alert(1)");
    expect(stripped).toContain("<p>keep</p>");
  });

  it("keeps JSON-LD, however its tag is written, so the paywall rules still apply", () => {
    const page = `<!DOCTYPE html><html><head>
      <script data-cfg="a>b" type='application/ld+json; charset=utf-8'>{"@type":"NewsArticle","isAccessibleForFree":false,
        "hasPart":{"@type":"WebPageElement","isAccessibleForFree":false,"cssSelector":".locked"}}</script></head>
      <body><article><h1>The story</h1><p>${words(120, "FREE")}</p><div class="locked"><p>${words(200, "SECRET")}</p></div></article></body></html>`;
    const result = extractArticle({ html: page, url, contentSource: "server", httpStatus: 200 });
    expect(result.textContent).toContain("FREE119");
    expect(result.textContent).not.toContain("SECRET");
    expect(result.previewKind).toBe("subscriber_only");
  });

  it("keeps the article's JSON-LD details in the free part", () => {
    const page = `<!DOCTYPE html><html><head><title>Story | Example News</title></head><body>
      <script type="application/ld+json">{"@context":"https://schema.org","@type":"NewsArticle","headline":"The Real Headline","author":{"@type":"Person","name":"Jane Writer"},
        "datePublished":"2026-01-02T08:00:00Z","publisher":{"@type":"Organization","name":"Example News"},"isAccessibleForFree":false,
        "hasPart":{"@type":"WebPageElement","isAccessibleForFree":false,"cssSelector":".locked"}}</script>
      <article><p>${words(120, "FREE")}</p><div class="locked"><p>${words(200, "SECRET")}</p></div></article></body></html>`;
    const result = extractArticle({ html: page, url, contentSource: "server", httpStatus: 200 });
    expect(result).toMatchObject({ title: "The Real Headline", author: "Jane Writer", siteName: "Example News" });
    expect(result.publishedAt?.toISOString()).toBe("2026-01-02T08:00:00.000Z");
  });

  it("never takes the rest of the page as the free part when the locked part sits in the body", () => {
    const page = `<!DOCTYPE html><html><head><script type="application/ld+json">{"@type":"NewsArticle","isAccessibleForFree":false,
      "hasPart":{"@type":"WebPageElement","isAccessibleForFree":false,"cssSelector":".paywall"}}</script></head>
      <body><nav><p>${words(300, "SIDEBAR")}</p></nav><div class="paywall"><p>${words(300, "SECRET")}</p></div></body></html>`;
    const result = extractArticle({ html: page, url, contentSource: "server", httpStatus: 200 });
    expect(result.textContent).toBe("");
    expect(result.previewReason).toEqual({ key: "preview.subscriberOnlyNothingFree" });
  });

  it("refuses a page with too much HTML to parse, but not one made big by its scripts", () => {
    const markup = `<!DOCTYPE html><html><body>${"<div><p>word word word</p></div>".repeat(150_000)}</body></html>`; // ~4.8 MB
    expect(() => extractArticle({ html: markup, url, contentSource: "server", httpStatus: 200 })).toThrow(PageTooLargeError);
    const scripted = `<!DOCTYPE html><html><head><script>${"x".repeat(5_000_000)}</script></head><body>${story}</body></html>`;
    expect(extractArticle({ html: scripted, url, contentSource: "server", httpStatus: 200 }).textContent).toContain("ARTICLE149");
  });

  it("stays fast on a page of unclosed script tags", () => {
    const started = performance.now();
    extractArticle({ html: "<script>".repeat(125_000) + "<script ".repeat(125_000), url, contentSource: "server", httpStatus: 200 });
    expect(performance.now() - started).toBeLessThan(5_000);
  });
});
