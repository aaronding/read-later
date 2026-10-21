// Paywall and login rules. Hard rules from the brief: we never get around a
// paywall or a login. We don't pretend to be a search crawler, don't use
// archive sites, and don't remove overlays. On our own downloads we drop
// sections the publisher marks as not free, and we flag pages that look
// truncated or show a login form as "Preview only", so the owner can save the
// full copy from their own signed-in browser instead.

type JsonLdNode = Record<string, unknown>;

/** All JSON-LD objects on the page, with arrays and @graph flattened. */
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
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
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

/** Removes the marked sections. Returns how many elements were removed. */
export function removeNonFreeSections(document: Document, selectors: string[]): number {
  let removed = 0;
  for (const selector of selectors) {
    let matches: NodeListOf<Element>;
    try {
      matches = document.querySelectorAll(selector);
    } catch {
      continue; // invalid selector in the publisher's markup
    }
    for (const element of matches) {
      element.remove();
      removed++;
    }
  }
  return removed;
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
  if (check.contentSource === "server" && check.httpStatus && [401, 402, 403].includes(check.httpStatus)) {
    return { kind: "login", reason: "The site asked for a login or subscription before showing this page." };
  }
  if (!check.foundArticle) {
    return { kind: "no_article", reason: "No article could be found on this page." };
  }
  // Publishers keep this markup even for subscribers, so it only counts for
  // our own (signed-out) downloads.
  if (check.contentSource === "server" && (check.paywall.notFree || check.removedSections > 0)) {
    return {
      kind: "subscriber_only",
      reason: "The site marks this article as subscriber-only, so only the free part was saved.",
    };
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
