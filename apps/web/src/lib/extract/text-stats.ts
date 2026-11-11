// Word counts and reading time that also work for Chinese and Japanese,
// which do not separate words with spaces.

// Han ideographs, Hiragana, Katakana and CJK symbols are counted one by one.
const CJK_CHAR = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu;
const WORD = /[\p{L}\p{N}][\p{L}\p{N}'’_-]*/gu;

// Typical silent reading speeds.
const WORDS_PER_MINUTE = 230;
const CJK_CHARS_PER_MINUTE = 500;

export interface TextStats {
  /** Space-separated words plus CJK characters. */
  wordCount: number;
  readingMinutes: number;
}

export function textStats(text: string): TextStats {
  const cjkChars = text.match(CJK_CHAR)?.length ?? 0;
  const words = text.replace(CJK_CHAR, " ").match(WORD)?.length ?? 0;
  const minutes = words / WORDS_PER_MINUTE + cjkChars / CJK_CHARS_PER_MINUTE;
  return {
    wordCount: words + cjkChars,
    readingMinutes: Math.max(1, Math.round(minutes)),
  };
}

// The elements a browser shows as blocks of their own, as the HTML standard's
// rendering section lists them, leaving out the obsolete ones.
const BLOCKS = new Set([
  "address", "article", "aside", "blockquote", "caption", "center", "dd", "details", "dialog", "div", "dl", "dt",
  "fieldset", "figcaption", "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hgroup", "hr",
  "legend", "li", "main", "menu", "nav", "ol", "p", "pre", "search", "section", "summary", "table", "tbody", "tfoot",
  "thead", "tr", "ul",
]);
const CELLS = new Set(["td", "th"]);
const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

/**
 * An element's text, as its textContent, with a line break between blocks
 * and for each <br>, and a space between table cells, where the HTML has no
 * whitespace there, as in a minified page. The text itself is kept as it is,
 * so a page that already breaks its lines between blocks reads the same.
 */
export function textWithBreaks(root: Node): string {
  let text = "";
  let started = false;
  // What the next text needs before it: line breaks, or else a space.
  let breaks = 0;
  let space = false;
  const add = (data: string) => {
    const start = data.search(/\S/);
    if (start < 0) {
      text += data;
      return;
    }
    text += data.slice(0, start);
    if (started && (breaks > 0 || space)) {
      let end = text.length;
      let newlines = 0;
      while (end > 0 && /\s/.test(text[end - 1]!)) {
        end--;
        if (text[end] === "\n") newlines++;
      }
      if (newlines < breaks) text += "\n".repeat(breaks - newlines);
      else if (breaks === 0 && end === text.length) text += " ";
    }
    text += data.slice(start);
    started = true;
    breaks = 0;
    space = false;
  };
  const edge = (element: Element) => {
    if (BLOCKS.has(element.localName)) breaks = Math.max(breaks, 1);
    else if (CELLS.has(element.localName)) space = true;
  };
  // Walked without recursion, since a page can nest elements thousands deep.
  let node: Node | null = root.firstChild;
  while (node) {
    if (node.nodeType === TEXT_NODE) add(node.nodeValue ?? "");
    else if (node.nodeType === ELEMENT_NODE) {
      const element = node as Element;
      if (element.localName === "br") breaks++;
      edge(element);
      if (node.firstChild) {
        node = node.firstChild;
        continue;
      }
      edge(element);
    }
    while (node !== root && !node.nextSibling) {
      node = node.parentNode!;
      if (node !== root) edge(node as Element);
    }
    node = node === root ? null : node.nextSibling;
  }
  return text;
}

/** Collapses the whitespace Readability leaves in textContent. */
export function cleanText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
