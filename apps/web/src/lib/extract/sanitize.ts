import createDOMPurify from "dompurify";
import { JSDOM } from "jsdom";

// Article HTML comes from arbitrary sites, so it is sanitized before it is
// stored. The reader renders only this cleaned copy.

const purify = createDOMPurify(new JSDOM("").window as unknown as Window & typeof globalThis);

purify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A" && node.getAttribute("href")) {
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
    ADD_ATTR: ["target", "loading", "decoding", "referrerpolicy"],
  });
}
