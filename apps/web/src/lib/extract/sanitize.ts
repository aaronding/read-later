import createDOMPurify from "dompurify";
import { JSDOM } from "jsdom";

// Article HTML comes from arbitrary sites, so it is sanitized before it is
// stored. The reader renders only this cleaned copy.

const purify = createDOMPurify(new JSDOM("").window as unknown as Window & typeof globalThis);

// Article ids and names get a "user-content-" prefix (SANITIZE_NAMED_PROPS),
// so an element like <a id="__next_f"> can't shadow a page global. Links to
// anchors inside the article are rewritten to match.
const ANCHOR_PREFIX = "user-content-";

purify.addHook("afterSanitizeAttributes", (node) => {
  const href = node.getAttribute("href");
  if (node.tagName === "A" && href && href.length > 1 && href.startsWith("#") && !href.startsWith(`#${ANCHOR_PREFIX}`)) {
    node.setAttribute("href", `#${ANCHOR_PREFIX}${href.slice(1)}`);
    return; // an in-page link: no new tab
  }
  if (node.tagName === "A" && href) {
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noopener noreferrer nofollow");
  }
  if (node.tagName === "IMG") {
    node.setAttribute("loading", "lazy");
    node.setAttribute("decoding", "async");
    node.setAttribute("referrerpolicy", "no-referrer");
  }
});

export function sanitizeArticleHtml(html: string): string {
  return purify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: [
      "style",
      "link",
      "meta",
      "base",
      "form",
      "input",
      "button",
      "select",
      "textarea",
      "iframe",
      "frame",
      "frameset",
      "object",
      "embed",
      "dialog",
      "template",
    ],
    FORBID_ATTR: ["style", "srcdoc", "formaction", "ping", "autoplay", "contenteditable"],
    ALLOW_DATA_ATTR: false,
    SANITIZE_NAMED_PROPS: true,
    ADD_ATTR: ["target", "loading", "decoding", "referrerpolicy"],
  });
}
