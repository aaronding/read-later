// Paywall and login rules. Hard rules from the brief: we never get around a
// paywall or a login. We don't pretend to be a search crawler, don't use
// archive sites, and don't remove overlays. On our own downloads we drop
// sections the publisher marks as not free, and we flag pages that look
// truncated or show a login form as "Preview only", so the owner can save the
// full copy from their own signed-in browser instead.

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
      element.remove();
      count++;
    }
  }
  // A stray match elsewhere on the page (a promo box) must not widen the
  // article to the page around it, so only the largest section counts.
  const container = largest?.parent.isConnected ? articleAround(largest.parent) : null;
  return { count, containers: container ? [container] : [] };
}

const PAYWALL_MARKER =
  /(^|[\s_-])(paywall|pay-wall|regwall|reg-wall|subscriber-only|subscription-wall|subscribe-wall|premium-wall|meter-wall|metered-wall|article-locked|locked-content|piano-offer|tp-modal|tp-backdrop)($|[\s_-])/i;

/** True when the page has elements named like a paywall or registration wall. */
export function hasPaywallMarker(document: Document): boolean {
  for (const element of document.querySelectorAll("[class], [id]")) {
    const names = `${element.getAttribute("class") ?? ""} ${element.getAttribute("id") ?? ""}`;
    if (PAYWALL_MARKER.test(names)) return true;
  }
  return false;
}

export function hasPasswordField(document: Document): boolean {
  return document.querySelector('input[type="password" i]') !== null;
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
const REFUSED_DOWNLOAD: Record<number, string> = {
  401: "The site asked for a login before showing this page (HTTP 401).",
  402: "The site asked for a subscription before showing this page (HTTP 402).",
  403: "The site refused the server's download (HTTP 403). It may want a login, or it may turn away downloads that don't come from a browser.",
};

export interface PreviewCheck {
  contentSource: "client" | "server";
  httpStatus?: number;
  paywall: PaywallMarkup;
  removedSections: number;
  passwordField: boolean;
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
  reason: string;
}

/** Why the saved copy is only a preview, or null when it looks complete. */
export function checkPreview(check: PreviewCheck): PreviewVerdict | null {
  if (check.contentSource === "server" && check.httpStatus && check.httpStatus in REFUSED_DOWNLOAD) {
    return { kind: "login", reason: REFUSED_DOWNLOAD[check.httpStatus]! };
  }
  // Publishers keep this markup even for subscribers, so it only counts for
  // our own (signed-out) downloads.
  if (check.contentSource === "server" && (check.paywall.notFree || check.removedSections > 0)) {
    return {
      kind: "subscriber_only",
      reason: check.foundArticle
        ? "The site marks this article as subscriber-only, so only the free part was saved."
        : "The site marks this article as subscriber-only, and too little of it is free to keep.",
    };
  }
  if (!check.foundArticle) {
    return { kind: "no_article", reason: "No article could be found on this page." };
  }
  if ((check.passwordField || LOGIN_TITLE.test(check.pageTitle)) && check.wordCount < LOGIN_PAGE_MAX_WORDS) {
    return { kind: "login", reason: "This looks like a login page rather than the article." };
  }
  if (check.paywallMarker && check.wordCount < TEASER_MAX_WORDS) {
    return { kind: "teaser", reason: "The page shows a paywall and only the start of the article." };
  }
  if (check.wordCount < MIN_ARTICLE_WORDS) {
    return { kind: "too_short", reason: "Only a very short text could be read from this page." };
  }
  return null;
}

/** True when a preview still holds article text worth summarizing. */
export function previewIsSummarizable(kind: PreviewKind | null): boolean {
  return kind === null || kind === "subscriber_only" || kind === "teaser";
}
