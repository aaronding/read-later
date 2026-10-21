import { Readability } from "@mozilla/readability";
import { JSDOM, VirtualConsole } from "jsdom";
import type { ContentSource } from "@/db/schema";
import {
  checkPreview,
  findPaywallMarkup,
  hasPasswordField,
  hasPaywallMarker,
  readJsonLd,
  removeNonFreeSections,
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
  previewReason: string | null;
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
  const dom = new JSDOM(input.html, { url: input.url, virtualConsole: new VirtualConsole() });
  const document = dom.window.document;

  try {
    // Read everything Readability would remove (scripts, forms) first.
    const canonicalHref = document.querySelector('link[rel~="canonical" i]')?.getAttribute("href") ?? null;
    const paywall = findPaywallMarkup(readJsonLd(document));
    const passwordField = hasPasswordField(document);
    const paywallMarker = hasPaywallMarker(document);
    const pageTitle = document.title?.trim() ?? "";
    const metaTitle = meta(document, "og:title", "twitter:title");
    const metaSite = meta(document, "og:site_name", "application-name");
    const metaAuthor = meta(document, "author", "article:author");
    const metaPublished = meta(document, "article:published_time", "og:published_time", "datePublished", "date");
    const metaDescription = meta(document, "description", "og:description");
    const htmlLang = document.documentElement.getAttribute("lang")?.trim() || null;

    const removedSections =
      input.contentSource === "server" ? removeNonFreeSections(document, paywall.selectors) : 0;

    const article = new Readability(document).parse();
    const textContent = cleanText(article?.textContent ?? "");
    const { wordCount, readingMinutes } = textStats(textContent);

    const siteName =
      short(article?.siteName ?? metaSite, 200) ?? new URL(input.url).hostname.replace(/^www\./, "");
    const rawTitle =
      short(article?.title, 500) ??
      short(metaTitle, 500) ??
      short(pageTitle, 500) ??
      short(input.fallbackTitle, 500) ??
      new URL(input.url).hostname;
    const title = stripSiteName(rawTitle, siteName);
    const contentHtml = article?.content ? sanitizeArticleHtml(withoutLeadingTitle(article.content, title)) : null;

    const preview = checkPreview({
      contentSource: input.contentSource,
      httpStatus: input.httpStatus,
      paywall,
      removedSections,
      passwordField,
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
