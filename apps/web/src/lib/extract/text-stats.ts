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

/** Collapses the whitespace Readability leaves in textContent. */
export function cleanText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
