import { JSDOM } from "jsdom";

// MSN draws an article in the browser, inside its web components' shadow
// roots, from what its content service returns: neither the page we download
// nor the copy the extension sends has any of the article's text. The service
// returns the article as JSON, which is made into a page here, for
// extractArticle to read like any other.

const MSN_HOSTS = new Set(["msn.com", "www.msn.com"]);
// /en-us/news/other/why-mandating-ai-use-in-the-workplace-can-backfire/ar-AA2gAwkW
const ARTICLE_PATH = /^\/([a-z]{2}-[a-z]{2})\/(?:[^/]+\/)*ar-([A-Za-z0-9]+)\/?$/i;
// Wide enough for the reader on a high-density screen; the originals can be
// thousands of pixels and megabytes.
const IMAGE_WIDTH = 1200;
// What a publisher's feed adds to its articles on MSN, in blocks it names:
// links to its other stories, newsletter sign-ups, "Most read" lists.
const FEED_EXTRAS = ".syndication_automated_monetization, .newsletter-cta, .most-read";

export interface MsnArticleRef {
  id: string;
  /** The market in the address, such as `en-us`. */
  market: string;
}

/** The MSN article an address opens, or null for any other address. */
export function msnArticleRef(url: string): MsnArticleRef | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  if (!MSN_HOSTS.has(parsed.hostname.toLowerCase())) return null;
  const match = ARTICLE_PATH.exec(parsed.pathname);
  return match ? { market: match[1]!.toLowerCase(), id: match[2]! } : null;
}

/** Where MSN's own page gets the article. */
export function msnContentUrl({ id, market }: MsnArticleRef): string {
  return `https://assets.msn.com/content/view/v2/Detail/${market}/${id}`;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Any restriction MSN sets on showing the article counts, whatever it means. */
function restricted(content: Record<string, unknown>): boolean {
  const attributes = record(content.intAttributes);
  return [
    content.renderingRestriction,
    content.subscriptionProductType,
    attributes.renderingRestriction,
    attributes.subscriptionProductType,
    attributes.isEmbedOnly,
  ].some((value) => value !== undefined && value !== null && value !== 0);
}

function imageSource(image: Record<string, unknown>): string | null {
  const raw = text(image.url);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return null;
    const width = typeof image.width === "number" && image.width > 0 ? Math.min(image.width, IMAGE_WIDTH) : IMAGE_WIDTH;
    url.searchParams.set("w", String(Math.round(width)));
    return url.href;
  } catch {
    return null;
  }
}

/**
 * The article in a reply from MSN's content service, as a page, or null when
 * the reply holds no article MSN shows in full to anyone: a video or a
 * slideshow, an empty body, or a restriction on showing it.
 */
export function msnArticlePage(reply: unknown): string | null {
  const content = record(reply);
  const body = text(content.body);
  const title = text(content.title);
  if (content.type !== "article" || !body || !title || restricted(content)) return null;

  const dom = new JSDOM("<!DOCTYPE html><html><head></head><body><article></article></body></html>");
  try {
    const { document } = dom.window;
    const addMeta = (attribute: "name" | "property", key: string, value: string | null) => {
      if (!value) return;
      const element = document.createElement("meta");
      element.setAttribute(attribute, key);
      element.setAttribute("content", value);
      document.head.append(element);
    };
    const authors = Array.isArray(content.authors)
      ? content.authors.map((author) => text(record(author).name)).filter((name): name is string => name !== null)
      : [];
    const lang = text(content.locale);
    if (lang) document.documentElement.setAttribute("lang", lang);
    document.title = title;
    addMeta("property", "og:title", title);
    // The publisher, as MSN's page credits it.
    addMeta("property", "og:site_name", text(record(content.provider).name) ?? "MSN");
    addMeta("name", "author", authors.length ? authors.join(", ") : null);
    addMeta("property", "article:published_time", text(content.publishedDateTime));
    addMeta("name", "description", text(content.abstract));

    const article = document.querySelector("article")!;
    const heading = document.createElement("h1");
    heading.textContent = title;
    article.innerHTML = body;
    article.prepend(heading);
    for (const extra of article.querySelectorAll(FEED_EXTRAS)) extra.remove();

    // The body names its pictures by id, and MSN's page fills them in from
    // the reply's list of images. Videos and anything else named that way
    // can't be shown here.
    const images = new Map<string, Record<string, unknown>>();
    if (Array.isArray(content.imageResources)) {
      for (const image of content.imageResources.map(record)) {
        const id = text(image.cmsId);
        if (id) images.set(id, image);
      }
    }
    for (const placeholder of article.querySelectorAll("[data-reference]")) {
      const id = placeholder.getAttribute("data-document-id");
      const image = placeholder.getAttribute("data-reference") === "image" && id ? images.get(id) : undefined;
      const src = image ? imageSource(image) : null;
      if (!image || !src) {
        placeholder.remove();
        continue;
      }
      const figure = document.createElement("figure");
      const picture = document.createElement("img");
      picture.setAttribute("src", src);
      // The caption describes the picture, so alt text would only repeat it.
      picture.setAttribute("alt", "");
      figure.append(picture);
      // A picture's caption is often only the article's title again.
      const caption = text(image.caption);
      const credit = text(image.attribution);
      const line = [caption !== title ? caption : null, credit ? `© ${credit}` : null].filter(Boolean).join(" ");
      if (line) {
        const figcaption = document.createElement("figcaption");
        figcaption.textContent = line;
        figure.append(figcaption);
      }
      placeholder.replaceWith(figure);
    }
    return dom.serialize();
  } finally {
    dom.window.close();
  }
}
