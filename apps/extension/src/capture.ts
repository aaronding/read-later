/**
 * Runs inside the page (chrome.scripting.executeScript), so it must not use
 * anything from outside its own body. Returns the page as the reader sees it
 * now, without scripts, styles and noscript blocks.
 */
export function capturePage(): { url: string; title: string; html: string } {
  const page = document.documentElement.cloneNode(true) as HTMLElement;
  page.querySelectorAll("script, style, noscript").forEach((element) => element.remove());
  return { url: document.URL, title: document.title, html: `<!DOCTYPE html>\n${page.outerHTML}` };
}
