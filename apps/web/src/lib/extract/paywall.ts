// Paywall and login rules. Hard rules from the brief: we never get around a
// paywall or a login. We don't pretend to be a search crawler, don't use
// archive sites, and don't remove overlays. On our own downloads we drop
// sections the publisher marks as not free, and we flag pages that look
// truncated or show a login form as "Preview only", so the owner can save the
// full copy from their own signed-in browser instead.

import type { StoredMessage } from "@/i18n/stored-message";
import { errorMessage, type ErrorKey } from "@/lib/error-message";
import { cleanText, textStats } from "./text-stats";

type JsonLdNode = Record<string, unknown>;

/** All JSON-LD objects on the page, with arrays and @graph flattened. */
/** True for a script type of JSON-LD, written in any case and with any parameters. */
export function isJsonLdType(type: string | null | undefined): boolean {
  return /^\s*application\/ld\+json\s*(;|$)/i.test(type ?? "");
}

export function readJsonLd(document: Document): JsonLdNode[] {
  const nodes: JsonLdNode[] = [];
  const visit = (value: unknown, depth: number) => {
    if (depth > 4 || value === null || typeof value !== "object") return;
    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1);
      return;
    }
    const node = value as JsonLdNode;
    nodes.push(node);
    if (node["@graph"]) visit(node["@graph"], depth + 1);
  };
  for (const script of document.querySelectorAll("script")) {
    if (!isJsonLdType(script.getAttribute("type"))) continue;
    try {
      visit(JSON.parse(script.textContent ?? ""), 0);
    } catch {
      // Broken JSON-LD is common; ignore it.
    }
  }
  return nodes;
}

function isFalse(value: unknown): boolean {
  return value === false || (typeof value === "string" && value.trim().toLowerCase() === "false");
}

function asArray(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

export interface PaywallMarkup {
  /** The publisher says some or all of the article is not free. */
  notFree: boolean;
  /** CSS selectors of the sections marked isAccessibleForFree: false. */
  selectors: string[];
}

/** Reads schema.org isAccessibleForFree markup (Google's paywall markup). */
export function findPaywallMarkup(nodes: JsonLdNode[]): PaywallMarkup {
  const selectors: string[] = [];
  let notFree = false;
  for (const node of nodes) {
    if (isFalse(node.isAccessibleForFree)) notFree = true;
    for (const part of asArray(node.hasPart)) {
      if (!part || typeof part !== "object") continue;
      const element = part as JsonLdNode;
      if (!isFalse(element.isAccessibleForFree)) continue;
      notFree = true;
      for (const selector of asArray(element.cssSelector)) {
        if (typeof selector === "string" && selector.trim()) selectors.push(selector.trim());
      }
    }
  }
  return { notFree, selectors };
}

export interface RemovedSections {
  count: number;
  /**
   * What is left of the article around the largest removed section: its
   * nearest article element, or main, or else the nearest wrapper that still
   * holds text. Never the whole body. The free part of the article is in
   * here, never elsewhere on the page; empty when there is no such place.
   */
  containers: Element[];
  /** The removed sections' text, without their scripts, whose JSON-LD may repeat the description. */
  text: string;
}

function articleAround(parent: Element): Element | null {
  const container = parent.closest("article") ?? parent.closest("main, [role=main]");
  if (container) return container;
  // No article or main: the nearest wrapper that still holds text, short of the body.
  let node: Element | null = parent;
  while (node && node.tagName !== "BODY" && node.tagName !== "HTML") {
    if (node.textContent?.trim()) return node;
    node = node.parentElement;
  }
  return null;
}

/** Removes the marked sections, and says where the rest of the article is. */
export function removeNonFreeSections(document: Document, selectors: string[]): RemovedSections {
  let count = 0;
  let largest: { parent: Element; size: number } | null = null;
  const texts: string[] = [];
  for (const selector of selectors) {
    let matches: NodeListOf<Element>;
    try {
      matches = document.querySelectorAll(selector);
    } catch {
      continue; // invalid selector in the publisher's markup
    }
    for (const element of matches) {
      const size = element.textContent?.length ?? 0;
      if (element.parentElement && (!largest || size > largest.size)) largest = { parent: element.parentElement, size };
      for (const script of element.querySelectorAll("script")) script.remove();
      texts.push(element.textContent ?? "");
      element.remove();
      count++;
    }
  }
  // A stray match elsewhere on the page (a promo box) must not widen the
  // article to the page around it, so only the largest section counts.
  const container = largest?.parent.isConnected ? articleAround(largest.parent) : null;
  return { count, containers: container ? [container] : [], text: texts.join(" ") };
}

const PAYWALL_MARKER =
  /(^|[\s_-])(paywall|pay-wall|regwall|reg-wall|subscriber-only|subscription-wall|subscribe-wall|premium-wall|meter-wall|metered-wall|article-locked|locked-content|piano-offer|tp-modal|tp-backdrop)($|[\s_-])/i;

function namedLikePaywall(element: Element): boolean {
  return PAYWALL_MARKER.test(`${element.getAttribute("class") ?? ""} ${element.getAttribute("id") ?? ""}`);
}

/** True when the page has elements named like a paywall or registration wall. */
export function hasPaywallMarker(document: Document): boolean {
  for (const element of document.querySelectorAll("[class], [id]")) {
    if (namedLikePaywall(element)) return true;
  }
  return false;
}

/**
 * True when the element, or one around it, is named like a paywall or
 * registration wall. `known` keeps the answer for every element on the way
 * up, so asking about many elements of one page costs no more than its size.
 */
export function insidePaywall(element: Element, known = new Map<Element, boolean>()): boolean {
  const path: Element[] = [];
  let inside = false;
  for (let node: Element | null = element; node; node = node.parentElement) {
    const answer = known.get(node);
    if (answer !== undefined) {
      inside = answer;
      break;
    }
    path.push(node);
    if (namedLikePaywall(node)) {
      inside = true;
      break;
    }
  }
  for (const node of path) known.set(node, inside);
  return inside;
}

// Many sites carry a sign-in form on every page: in the header or a sidebar,
// or hidden in a modal until someone clicks "Sign in". A password field makes
// a page a login page only when it belongs to the article: when it is in what
// Readability takes for the article, or beside the article's headline.

const PASSWORD_MARK = "data-read-later-password";

/**
 * True for a comment form, whose password lets the commenter edit or delete
 * the comment later, as on FC2's blogs: it has a visible text area, or it is
 * named for comments, as N-DSoft's delete box is. The hidden text area
 * reCAPTCHA and hCaptcha put inside sign-in forms for their answer doesn't
 * count.
 */
function isCommentForm(form: Element): boolean {
  if (/(^|[\s_-])comments?($|[\s_-])/i.test(`${form.id} ${form.getAttribute("class") ?? ""}`)) return true;
  return [...form.querySelectorAll("textarea")].some(
    (box) => !box.closest("noscript") && !/-response$/i.test(box.getAttribute("name") ?? "") && !hiddenWithin(box, form),
  );
}

/** True for a form around the whole page, as on ASP.NET sites: it holds the headline or the main part, or most of the text. */
function wrapsPage(form: Element): boolean {
  if (form.querySelector("h1, main, [role=main]")) return true;
  return (form.textContent ?? "").trim().length * 2 >= (form.ownerDocument.body?.textContent ?? "").trim().length;
}

/** The password fields that could be a sign-in or registration form's: all but a comment form's. */
function signInFields(document: Document): Element[] {
  return [...document.querySelectorAll('input[type="password" i]')].filter((field) => {
    const form = field.closest("form");
    return !form || !isCommentForm(form) || wrapsPage(form);
  });
}

/**
 * Marks the elements around each password field before Readability runs,
 * since Readability drops the fields themselves. On a teaser longer than a
 * few lines it drops their forms, and often the forms' parents, too; the
 * headline check makes up for that.
 */
export function markPasswordFields(document: Document): void {
  for (const field of signInFields(document)) {
    const form = field.closest("form");
    for (const element of [field.parentElement, form, form?.parentElement]) element?.setAttribute(PASSWORD_MARK, "");
  }
}

/**
 * True when Readability kept an element that held a password field. The
 * marks can stay: sanitizeArticleHtml drops every data attribute.
 */
export function passwordMarksIn(article: Element): boolean {
  return article.querySelector(`[${PASSWORD_MARK}]`) !== null;
}

const normalized = (text: string | null | undefined) => (text ?? "").replace(/\s+/g, " ").trim().toLowerCase();

// How sites hide a sign-in box until someone opens it: whole class names for
// hiding, and any part of a class or id for popups ("newspack-ui__modal").
const HIDING_CLASSES = new Set(["hide", "hidden", "d-none", "is-hidden", "invisible", "mfp-hide", "u-hidden"]);
const POPUP_PARTS = new Set(["modal", "popup", "popover", "dropdown", "tooltip", "lightbox", "offcanvas", "flyout", "drawer"]);

/** True when an element between the field and the container hides it or is a popup, going by the markup alone. */
function hiddenWithin(field: Element, container: Element): boolean {
  for (let node: Element | null = field; node && node !== container; node = node.parentElement) {
    if (node.hasAttribute("hidden") || node.getAttribute("aria-hidden") === "true") return true;
    if (/display\s*:\s*none|visibility\s*:\s*hidden/i.test(node.getAttribute("style") ?? "")) return true;
    if (node.tagName === "DIALOG" && !node.hasAttribute("open")) return true;
    const classes = [...node.classList].map((name) => name.toLowerCase());
    if (classes.some((name) => HIDING_CLASSES.has(name))) return true;
    if ([...classes, node.id.toLowerCase()].some((name) => name.split(/[-_]+/).some((part) => POPUP_PARTS.has(part)))) return true;
  }
  return false;
}

/** True when the heading is only a link to the site's home page, as a site's or blog's name often is. */
function linksHome(heading: Element): boolean {
  const link = heading.querySelector("a[href]");
  if (!link || normalized(link.textContent) !== normalized(heading.textContent)) return false;
  const host = (url: URL) => url.hostname.replace(/^www\./, "");
  try {
    const page = new URL(heading.ownerDocument.URL);
    const target = new URL(link.getAttribute("href") ?? "", heading.ownerDocument.baseURI);
    return host(target) === host(page) && target.pathname === "/" && !target.search;
  } catch {
    return false;
  }
}

/**
 * True when a visible password field sits beside the article's headline: the
 * smallest part of the page holding both is shorter than a login page, and
 * isn't the page's header or navigation. When the headline is in an article
 * or main element, the field must be in it too: a site's own sign-in box sits
 * outside it, in a top bar, a sidebar or a comment form, and on a short post
 * still meets the headline in a small container. Otherwise it is hidden until
 * opened. The headline is an h1 that makes up most of the page's title and
 * isn't the site's name, either the one in its metadata or a link to its home
 * page. This finds a wall when Readability removes its form, or takes
 * something else on the page for the article.
 */
export function passwordFieldBesideHeadline(
  document: Document,
  { titles, siteName }: { titles: (string | null | undefined)[]; siteName: string | null },
): boolean {
  const wanted = titles.map(normalized).filter(Boolean);
  const site = normalized(siteName);
  const headlines = [...document.querySelectorAll("h1")].filter((heading) => {
    const text = normalized(heading.textContent);
    if (!text || text === site || linksHome(heading)) return false;
    return wanted.some((title) => title.includes(text) && text.length * 2 >= title.length);
  });
  if (!headlines.length) return false;
  const words = new Map<Element, number>();
  for (const field of signInFields(document)) {
    for (const headline of headlines) {
      const story = headline.closest("article, main, [role=main]");
      if (story && !story.contains(field)) continue;
      let shared: Element | null = field.parentElement;
      while (shared && !shared.contains(headline)) shared = shared.parentElement;
      if (!shared || shared.tagName === "BODY" || shared.tagName === "HTML") continue;
      const chrome = shared.closest("header, nav, [role=banner], [role=navigation]");
      if (chrome && !chrome.closest("article, main, [role=main]")) continue;
      if (hiddenWithin(field, shared)) continue;
      let count = words.get(shared);
      if (count === undefined) words.set(shared, (count = textStats(cleanText(shared.textContent ?? "")).wordCount));
      if (count < LOGIN_PAGE_MAX_WORDS) return true;
    }
  }
  return false;
}

// How a bot check, or a page that goes on to the article only in a browser,
// lets the browser through: its scripts set a cookie, then reload the page or
// go to another address; or they wait for the cookie a check such as
// reCAPTCHA sets, and reload as soon as it is there. The app never runs a
// page's scripts.
const SETS_COOKIE = /\bdocument\s*(?:\.\s*cookie|\[\s*["']cookie["']\s*\])\s*=(?![=>])/;
const COOKIE = /\bdocument\s*(?:\.\s*cookie|\[\s*["']cookie["']\s*\])(?![\w$])/;
// The page's own location, not a property of that name on something else. A
// bare "location =" takes a window first, since it is as often a variable of
// that name, or "location=" in a query or a pop-up's features.
const LOCATION = String.raw`(?<![\w$.])(?:(?:window|self|top|document)\s*\.\s*)?location`;
const WINDOW_LOCATION = String.raw`(?<![\w$.])(?:window|self|top|document)\s*\.\s*location`;
const CALL = String.raw`\s*(?:\.\s*(?:reload|replace|assign)|\[\s*["'](?:reload|replace|assign)["']\s*\])\s*\(`;
const HREF = String.raw`\s*(?:\.\s*href|\[\s*["']href["']\s*\])`;
const SET = String.raw`\s*=(?![=>])`;
const MOVES_ON = new RegExp(`${LOCATION}(?:${CALL}|${HREF}${SET})|${WINDOW_LOCATION}${SET}`);
// reCAPTCHA's page tests for the cookie under each of its four names, and
// reloads in the same "if", some 60 characters after the last test. Wix's sites
// read their cookies and, thousands of characters further, reload a page the
// browser brought back from its history.
const WAITS_FOR_COOKIE = new RegExp(
  String.raw`${COOKIE.source}[\s\S]{0,200}?${LOCATION}\s*(?:\.\s*reload|\[\s*["']reload["']\s*\])\s*\(`,
);

/** True for a script that sets a cookie. */
export function setsCookie(script: string): boolean {
  return SETS_COOKIE.test(script);
}

/** True for a script that reloads the page at most 200 characters after it reads or sets a cookie. */
export function waitsForCookie(script: string): boolean {
  return WAITS_FOR_COOKIE.test(script);
}

/** True for a script that reloads the page or goes to another address. */
export function movesOn(script: string): boolean {
  return MOVES_ON.test(script);
}

const LOGIN_TITLE =
  /\b(sign[ -]?in|log[ -]?in|subscribe|register|create an account)\b|登录|登入|注册|ログイン|로그인|anmelden|connexion|iniciar sesión/i;

// Below these sizes a page with a login form or a paywall is a preview.
export const LOGIN_PAGE_MAX_WORDS = 300;
export const TEASER_MAX_WORDS = 400;
// Below this, whatever we saved is too short to be the article.
export const MIN_ARTICLE_WORDS = 100;

// What our own download was told instead of the page. A 403 is not always a
// login: some sites turn away any download that doesn't come from a browser.
const REFUSED_DOWNLOAD: Record<number, ErrorKey> = {
  401: "preview.loginRequired",
  402: "preview.subscriptionRequired",
  403: "preview.downloadRefused",
};

export interface PreviewCheck {
  contentSource: "client" | "server";
  httpStatus?: number;
  paywall: PaywallMarkup;
  removedSections: number;
  /** A password field belongs to the article, not only to the page around it (see passwordFieldBesideHeadline). */
  passwordFieldInArticle: boolean;
  paywallMarker: boolean;
  pageTitle: string;
  /** Readability found article content. */
  foundArticle: boolean;
  wordCount: number;
}

/**
 * login, no_article and too_short previews hold no article text worth
 * summarizing; subscriber_only and teaser previews hold the free beginning.
 */
export type PreviewKind = "login" | "no_article" | "subscriber_only" | "teaser" | "too_short";

export interface PreviewVerdict {
  kind: PreviewKind;
  /** Why, as a message in the Errors namespace. */
  reason: StoredMessage;
}

/** Why the saved copy is only a preview, or null when it looks complete. */
export function checkPreview(check: PreviewCheck): PreviewVerdict | null {
  if (check.contentSource === "server" && check.httpStatus && check.httpStatus in REFUSED_DOWNLOAD) {
    return {
      kind: "login",
      reason: errorMessage(REFUSED_DOWNLOAD[check.httpStatus]!, { status: String(check.httpStatus) }),
    };
  }
  // Publishers keep this markup even for subscribers, so it only counts for
  // our own (signed-out) downloads.
  if (check.contentSource === "server" && (check.paywall.notFree || check.removedSections > 0)) {
    return {
      kind: "subscriber_only",
      reason: errorMessage(check.foundArticle ? "preview.subscriberOnly" : "preview.subscriberOnlyNothingFree"),
    };
  }
  if (!check.foundArticle) {
    return { kind: "no_article", reason: errorMessage("preview.noArticle") };
  }
  if ((check.passwordFieldInArticle || LOGIN_TITLE.test(check.pageTitle)) && check.wordCount < LOGIN_PAGE_MAX_WORDS) {
    return { kind: "login", reason: errorMessage("preview.loginPage") };
  }
  if (check.paywallMarker && check.wordCount < TEASER_MAX_WORDS) {
    return { kind: "teaser", reason: errorMessage("preview.teaser") };
  }
  if (check.wordCount < MIN_ARTICLE_WORDS) {
    return { kind: "too_short", reason: errorMessage("preview.tooShort") };
  }
  return null;
}

/** True when a preview still holds article text worth summarizing. */
const KIND_OF_REASON: Partial<Record<ErrorKey, PreviewKind>> = {
  "preview.subscriberOnly": "subscriber_only",
  "preview.subscriberOnlyNothingFree": "subscriber_only",
  "preview.noArticle": "no_article",
  "preview.loginPage": "login",
  "preview.browserCheck": "login",
  "preview.teaser": "teaser",
  "preview.tooShort": "too_short",
  ...Object.fromEntries(Object.values(REFUSED_DOWNLOAD).map((key) => [key, "login"])),
};

/** The kind of a stored preview, from the reason it was given: articles keep the reason, not the kind. */
export function previewKindOfReason(key: string | null | undefined): PreviewKind | null {
  return (key && KIND_OF_REASON[key as ErrorKey]) || null;
}

export function previewIsSummarizable(kind: PreviewKind | null): boolean {
  return kind === null || kind === "subscriber_only" || kind === "teaser";
}
