import { Readability } from "@mozilla/readability";
import { JSDOM, VirtualConsole } from "jsdom";
import { parse, serialize, type DefaultTreeAdapterTypes } from "parse5";
import type { ContentSource } from "@/db/schema";
import type { StoredMessage } from "@/i18n/stored-message";
import { errorMessage } from "@/lib/error-message";
import {
  checkPreview,
  findPaywallMarkup,
  isJsonLdType,
  hasPaywallMarker,
  markPasswordFields,
  MIN_ARTICLE_WORDS,
  movesOn,
  passwordFieldBesideHeadline,
  passwordMarksIn,
  readJsonLd,
  removeNonFreeSections,
  setsCookie,
  type PreviewKind,
} from "./paywall";
import { sanitizeArticleHtml } from "./sanitize";
import { cleanText, textStats } from "./text-stats";

export interface ExtractInput {
  html: string;
  /** The page URL; relative links and images are resolved against it. */
  url: string;
  contentSource: ContentSource;
  /** HTTP status of our own download, when there was one. */
  httpStatus?: number;
  /** Title sent along with a save, used if the page has none. */
  fallbackTitle?: string | null;
}

export interface ExtractedArticle {
  title: string;
  author: string | null;
  siteName: string | null;
  publishedAt: Date | null;
  lang: string | null;
  excerpt: string | null;
  contentHtml: string | null;
  textContent: string;
  wordCount: number;
  readingMinutes: number;
  previewOnly: boolean;
  previewKind: PreviewKind | null;
  /** Why the copy is only a preview, as a message in the Errors namespace. */
  previewReason: StoredMessage | null;
  canonicalHref: string | null;
}

function meta(document: Document, ...keys: string[]): string | null {
  for (const key of keys) {
    const element =
      document.querySelector(`meta[property="${key}"]`) ?? document.querySelector(`meta[name="${key}" i]`);
    const value = element?.getAttribute("content")?.trim();
    if (value) return value;
  }
  return null;
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function cleanAuthor(byline: string | null | undefined): string | null {
  const value = byline?.replace(/^\s*(by|von|par|por)\s+/i, "").trim();
  return value ? value.slice(0, 300) : null;
}

/** "Story title | Site Name" becomes "Story title" when we know the site name. */
function stripSiteName(title: string, siteName: string | null): string {
  if (!siteName) return title;
  const site = siteName.trim().toLowerCase();
  const separators = /\s+[|\-–—·:•]\s+/;
  const parts = title.split(separators);
  if (parts.length < 2) return title;
  if (parts.at(-1)?.trim().toLowerCase() === site) return parts.slice(0, -1).join(" - ").trim() || title;
  if (parts[0]?.trim().toLowerCase() === site) return parts.slice(1).join(" - ").trim() || title;
  return title;
}

/**
 * The reader shows the title above the article, so a heading at the top of
 * the content that repeats it is removed. Readability only does this when
 * the heading matches its own title, which may still carry the site name.
 */
function withoutLeadingTitle(html: string, title: string): string {
  const fragment = JSDOM.fragment(html);
  const normalize = (text: string | null | undefined) => (text ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  const wanted = normalize(title);
  const headings = [...fragment.querySelectorAll("h1, h2")].slice(0, 2);
  const first = headings.find((heading) => normalize(heading.textContent) === wanted);
  if (!first) return html;
  first.remove();
  const container = new JSDOM("").window.document.createElement("div");
  container.append(fragment);
  return container.innerHTML;
}

/**
 * The most HTML a page may still have once its scripts and style sheets are
 * emptied: the same as a page sent from the browser. Beyond it, building the
 * DOM takes tens of seconds and over a gigabyte.
 */
export const MAX_PAGE_HTML_BYTES = 4 * 1024 * 1024;

export class PageTooLargeError extends Error {
  readonly storedMessage = errorMessage("pageTooLarge");

  constructor() {
    super("The page is too large to save.");
  }
}

function isJsonLd(element: DefaultTreeAdapterTypes.Element): boolean {
  return isJsonLdType(element.attrs.find((a) => a.name === "type")?.value);
}

// A page with this many links is a real one, however little text it has.
const REAL_PAGE_LINKS = 20;

// The types of script a browser runs, as the HTML standard lists them.
const JAVASCRIPT_TYPE =
  /^(?:module|(?:text|application)\/(?:x-)?(?:javascript|ecmascript)|text\/javascript1\.[0-5]|text\/(?:jscript|livescript))?$/i;

/**
 * A script a browser would run from the page itself: JavaScript, written
 * inline (the text of a script with a src is ignored), not only for browsers
 * without modules, and not in a template or noscript.
 */
function runs(element: DefaultTreeAdapterTypes.Element, inert: boolean): boolean {
  const attribute = (name: string) => element.attrs.find((a) => a.name === name)?.value;
  if (inert || attribute("src") !== undefined || attribute("nomodule") !== undefined) return false;
  return JAVASCRIPT_TYPE.test((attribute("type") ?? "").trim());
}

/**
 * Scripts and style sheets are most of a big page's bytes (on a CNN article,
 * 5 of its 5.6 MB) and never part of the article, so their contents go before
 * jsdom builds the DOM. parse5, the parser jsdom itself uses, decides where
 * each one starts and ends. The elements stay, with their attributes, and so
 * does JSON-LD, which the paywall rules read. On the way, it notes whether the
 * scripts set a cookie and move on, as a bot check's do.
 */
export function withoutScriptsAndStyles(html: string): { html: string; scriptMovesOn: boolean } {
  const document = parse(html, { scriptingEnabled: false });
  // Each node, and whether it is inside a template or noscript, where scripts never run.
  const stack: [DefaultTreeAdapterTypes.ParentNode, boolean][] = [[document, false]];
  let cookie = false;
  let moves = false;
  while (stack.length > 0) {
    const [node, inert] = stack.pop()!;
    if ("tagName" in node && (node.tagName === "style" || (node.tagName === "script" && !isJsonLd(node)))) {
      if (node.tagName === "script" && runs(node, inert)) {
        const text = node.childNodes.map((child) => ("value" in child ? child.value : "")).join("");
        cookie ||= setsCookie(text);
        moves ||= movesOn(text);
      }
      node.childNodes = [];
      continue;
    }
    const inside = inert || ("tagName" in node && node.tagName === "noscript");
    for (const child of node.childNodes) if ("childNodes" in child) stack.push([child, inside]);
    if ("content" in node) stack.push([node.content, true]); // <template>
  }
  return { html: serialize(document), scriptMovesOn: cookie && moves };
}

/**
 * Narrows the page to what is left of the article around its removed
 * subscriber-only sections. The head stays, with JSON-LD moved into it, so
 * Readability still finds the title, author and date.
 */
function keepOnlyFreePart(document: Document, containers: Element[]): void {
  for (const script of document.body.querySelectorAll("script")) {
    if (isJsonLdType(script.getAttribute("type"))) document.head.append(script);
  }
  document.body.replaceChildren(...containers);
}

/** How much of `text`, from its start, `held` holds, whitespace aside. */
function heldLength(text: string, held: string): number {
  const stripped = text.replace(/\s+/g, "");
  // Every shorter part of a held start is held too, so a binary search finds the longest.
  let low = 0;
  let high = stripped.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (held.includes(stripped.slice(0, middle))) low = middle;
    else high = middle - 1;
  }
  let seen = 0;
  for (let index = 0; index < text.length; index++) {
    if (seen === low) return index;
    if (!/\s/.test(text[index]!)) seen++;
  }
  return text.length;
}

/**
 * The page's description as paragraphs, as far as the sections marked not
 * free hold it, when that is as long as an article: some publishers give the
 * whole text away there, to anyone, as LinkedIn does for a post. What they add
 * after the text, such as LinkedIn's count of comments, is left out. Null for
 * a sentence or two, or for a blurb about the site those sections don't hold.
 * Whitespace is left out of the comparison, since a page may break its lines
 * with tags where the description has a newline.
 */
function describedArticle(
  document: Document,
  description: string | null,
  removedText: string,
): { html: string; text: string } | null {
  const whole = cleanText(description ?? "");
  if (textStats(whole).wordCount < MIN_ARTICLE_WORDS) return null;
  const text = cleanText(whole.slice(0, heldLength(whole, removedText.replace(/\s+/g, ""))));
  if (textStats(text).wordCount < MIN_ARTICLE_WORDS) return null;
  const container = document.createElement("div");
  for (const paragraph of text.split("\n\n")) {
    const element = document.createElement("p");
    paragraph.split("\n").forEach((line, index) => {
      if (index > 0) element.append(document.createElement("br"));
      element.append(line);
    });
    container.append(element);
  }
  return { html: container.innerHTML, text };
}

const HIDDEN_BY_STYLE = /(^|;)\s*visibility\s*:\s*hidden\s*(!important\s*)?(;|$)/i;

/** The elements hidden only by an inline `visibility: hidden`. */
function hiddenByStyle(document: Document): Element[] {
  return [...document.querySelectorAll("[style]")].filter((element) => HIDDEN_BY_STYLE.test(element.getAttribute("style") ?? ""));
}

function short(value: string | null | undefined, max: number): string | null {
  const text = value?.replace(/\s+/g, " ").trim();
  return text ? text.slice(0, max) : null;
}

/**
 * Extracts the article with Readability on a server-side DOM, applies the
 * paywall rules, and sanitizes the HTML for storage. Scripts never run:
 * jsdom does not execute them unless asked to.
 */
export function extractArticle(input: ExtractInput): ExtractedArticle {
  const { html, scriptMovesOn } = withoutScriptsAndStyles(input.html);
  if (Buffer.byteLength(html) > MAX_PAGE_HTML_BYTES) throw new PageTooLargeError();
  const dom = new JSDOM(html, { url: input.url, virtualConsole: new VirtualConsole() });
  const document = dom.window.document;

  try {
    // Read, or mark, everything Readability would remove (scripts, forms) first.
    const canonicalHref = document.querySelector('link[rel~="canonical" i]')?.getAttribute("href") ?? null;
    const paywall = findPaywallMarkup(readJsonLd(document));
    markPasswordFields(document);
    const paywallMarker = hasPaywallMarker(document);
    const pageTitle = document.title?.trim() ?? "";
    const metaTitle = meta(document, "og:title", "twitter:title");
    const metaSite = meta(document, "og:site_name", "application-name");
    const metaAuthor = meta(document, "author", "article:author");
    const metaPublished = meta(document, "article:published_time", "og:published_time", "datePublished", "date");
    const metaDescription = meta(document, "description", "og:description");
    const htmlLang = document.documentElement.getAttribute("lang")?.trim() || null;
    const besideHeadline = passwordFieldBesideHeadline(document, { titles: [metaTitle, pageTitle], siteName: metaSite });
    // A bot check, or a page that goes on to the article only once its scripts
    // have run in a browser, shows a line such as "Please wait..." and hardly a
    // link, while the scripts of most other pages set cookies and move on too.
    // A password field makes it a login page, paywall markup or a paywall's
    // name an article, and a refusal (401 to 403) keeps its own reason.
    const browserCheck =
      input.contentSource === "server" &&
      (input.httpStatus ?? 200) < 400 &&
      scriptMovesOn &&
      !paywall.notFree &&
      !paywallMarker &&
      !document.querySelector('input[type="password" i]') &&
      document.querySelectorAll("a[href]").length < REAL_PAGE_LINKS &&
      textStats(cleanText(document.body?.textContent ?? "")).wordCount < MIN_ARTICLE_WORDS;
    // Nothing of a check is the article's, not even its title, description or address.
    if (browserCheck) {
      const hostname = new URL(input.url).hostname;
      return {
        title: short(input.fallbackTitle, 500) ?? hostname,
        author: null,
        siteName: hostname.replace(/^www\./, ""),
        publishedAt: null,
        lang: null,
        excerpt: null,
        contentHtml: null,
        textContent: "",
        ...textStats(""),
        previewOnly: true,
        previewKind: "login",
        previewReason: errorMessage("preview.browserCheck"),
        canonicalHref: null,
      };
    }

    const removed =
      input.contentSource === "server"
        ? removeNonFreeSections(document, paywall.selectors)
        : { count: 0, containers: [], text: "" };
    const removedSections = removed.count;

    // Without its subscriber-only sections, the free part of the article is
    // what is left of it, not whatever Readability finds elsewhere on the
    // page, such as a sidebar of stock prices.
    if (removedSections > 0) keepOnlyFreePart(document, removed.containers);
    let keptPasswordField = false;
    const readArticle = (page: Document) =>
      new Readability(page, {
        serializer: (content) => {
          const element = content as Element;
          keptPasswordField = passwordMarksIn(element);
          return element.innerHTML;
        },
      }).parse();
    // Some pages hide their content until their own scripts show it, which
    // they never do here, and Readability skips hidden elements. Readability
    // changes the page it reads, so a copy is kept for a second try.
    const spare = hiddenByStyle(document).length > 0 ? (document.cloneNode(true) as Document) : null;
    let article = readArticle(document);
    if (spare && !cleanText(article?.textContent ?? "")) {
      for (const element of hiddenByStyle(spare)) {
        element.setAttribute("style", (element.getAttribute("style") ?? "").replace(HIDDEN_BY_STYLE, "$1"));
      }
      article = readArticle(spare);
    }
    let content = article?.content ?? "";
    let textContent = cleanText(article?.textContent ?? "");
    let { wordCount, readingMinutes } = textStats(textContent);
    if (removedSections > 0 && wordCount < MIN_ARTICLE_WORDS) {
      // A caption and share buttons are not a free part worth keeping, but a
      // description as long as an article is, since the publisher shows it to
      // anyone, outside the sections it marks.
      const described = describedArticle(document, metaDescription, removed.text);
      article = article && { ...article, excerpt: null };
      content = described?.html ?? "";
      textContent = described?.text ?? "";
      ({ wordCount, readingMinutes } = textStats(textContent));
    }

    const siteName =
      short(article?.siteName ?? metaSite, 200) ?? new URL(input.url).hostname.replace(/^www\./, "");
    const rawTitle =
      short(article?.title, 500) ??
      short(metaTitle, 500) ??
      short(pageTitle, 500) ??
      short(input.fallbackTitle, 500) ??
      new URL(input.url).hostname;
    const title = stripSiteName(rawTitle, siteName);
    const contentHtml = content ? sanitizeArticleHtml(withoutLeadingTitle(content, title)) : null;

    const preview = checkPreview({
      contentSource: input.contentSource,
      httpStatus: input.httpStatus,
      paywall,
      removedSections,
      passwordFieldInArticle: keptPasswordField || besideHeadline,
      paywallMarker,
      pageTitle: pageTitle || title,
      foundArticle: Boolean(contentHtml && textContent),
      wordCount,
    });

    return {
      title,
      author: cleanAuthor(article?.byline ?? metaAuthor),
      siteName,
      publishedAt: parseDate(article?.publishedTime ?? metaPublished),
      lang: short(article?.lang ?? htmlLang, 35),
      excerpt: short(article?.excerpt ?? metaDescription, 1000),
      contentHtml,
      textContent,
      wordCount,
      readingMinutes,
      previewOnly: preview !== null,
      previewKind: preview?.kind ?? null,
      previewReason: preview?.reason ?? null,
      canonicalHref,
    };
  } finally {
    dom.window.close();
  }
}
