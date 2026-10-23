// The extension's text comes from _locales/<language>/messages.json, in the
// browser's language. These helpers take the lookup as an argument, so the
// tests can pass their own.
import type { Outcome } from "./api.js";

/** Looks up a message by name, filling in its placeholders, as chrome.i18n.getMessage does. */
export type GetMessage = (name: string, substitutions?: string | string[]) => string;

/** The browser's lookup, in the catalogue for its language. */
export const browserMessage: GetMessage = (name, substitutions) => chrome.i18n.getMessage(name, substitutions);

/** The extension's own words for the server's error codes, so they are in the same language as the rest. */
function errorText(code: string | undefined, getMessage: GetMessage): string | undefined {
  switch (code) {
    case "unauthorized":
      return getMessage("errorUnauthorized");
    case "too_large":
      return getMessage("errorTooLarge");
    case "bad_request":
      return getMessage("errorBadRequest");
    case "invalid_url":
      return getMessage("errorInvalidUrl");
    case "server_error":
      return getMessage("errorServer");
    default:
      return undefined;
  }
}

/** What to tell the user about a save or a connection check. */
export function outcomeText(outcome: Outcome, getMessage: GetMessage): string {
  switch (outcome.kind) {
    case "saved":
      if (!outcome.detail) return outcome.linkOnly ? getMessage("savedLinkOnly") : getMessage("saved");
      return outcome.linkOnly ? getMessage("serverMessageLinkOnly", outcome.detail) : outcome.detail;
    case "alreadySaved":
      return outcome.linkOnly ? getMessage("alreadySavedLinkOnly") : getMessage("alreadySaved");
    case "refetching":
      return outcome.linkOnly ? getMessage("alreadySavedRefetchingLinkOnly") : getMessage("alreadySavedRefetching");
    case "connected":
      return getMessage("connected");
    case "notConfigured":
      return getMessage("notConfigured");
    case "unreachable":
      return getMessage("unreachable", [outcome.server, outcome.detail]);
    case "notTheApp":
      return getMessage("notTheApp", outcome.server);
    case "server":
      return errorText(outcome.code, getMessage) ?? outcome.detail ?? getMessage("serverAnswered", outcome.status);
  }
}

/**
 * Puts a message into an element as text, where <kbd>…</kbd> and <code>…</code>
 * become those elements. Nothing else is read as markup.
 */
export function setRichText(element: HTMLElement, message: string): void {
  const page = element.ownerDocument;
  const nodes: Node[] = [];
  let at = 0;
  for (const match of message.matchAll(/<(kbd|code)>([^<]*)<\/\1>/g)) {
    nodes.push(page.createTextNode(message.slice(at, match.index)));
    const tag = page.createElement(match[1]!);
    tag.textContent = match[2]!;
    nodes.push(tag);
    at = match.index + match[0].length;
  }
  nodes.push(page.createTextNode(message.slice(at)));
  element.replaceChildren(...nodes.filter((node) => node.textContent));
}

/**
 * Fills a page from the catalogue: data-i18n names the message for an element's
 * text, data-i18n-placeholder and data-i18n-title those for its attributes.
 */
export function localizePage(page: Document, getMessage: GetMessage): void {
  page.documentElement.lang = getMessage("locale");
  page.querySelectorAll<HTMLElement>("[data-i18n]").forEach((element) => {
    setRichText(element, getMessage(element.dataset.i18n!));
  });
  page.querySelectorAll<HTMLInputElement>("[data-i18n-placeholder]").forEach((element) => {
    element.placeholder = getMessage(element.dataset.i18nPlaceholder!);
  });
  page.querySelectorAll<HTMLElement>("[data-i18n-title]").forEach((element) => {
    element.title = getMessage(element.dataset.i18nTitle!);
  });
}
