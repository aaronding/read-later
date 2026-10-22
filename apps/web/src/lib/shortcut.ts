// The script for the Apple Shortcut's "Run JavaScript on Web Page" action. It
// sends the page as the reader sees it, minus scripts and styles, exactly
// like the Chrome extension. Keep docs/safari-shortcut.md in step with it.
export const SHORTCUT_SCRIPT = `var page = document.documentElement.cloneNode(true);
page.querySelectorAll("script, style, noscript").forEach(function (el) {
  el.remove();
});
completion(JSON.stringify({
  url: document.URL,
  title: document.title,
  html: "<!DOCTYPE html>" + page.outerHTML,
  source: "shortcut"
}));`;
