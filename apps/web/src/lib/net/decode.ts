// Turns downloaded bytes into text, honouring the page's character set.

function charsetFromContentType(contentType: string): string | null {
  const match = /charset\s*=\s*["']?([\w.:-]+)/i.exec(contentType);
  return match?.[1] ?? null;
}

function charsetFromMeta(head: string): string | null {
  const meta = /<meta[^>]+charset\s*=\s*["']?([\w.:-]+)/i.exec(head);
  return meta?.[1] ?? null;
}

function makeDecoder(label: string | null): TextDecoder | null {
  if (!label) return null;
  try {
    return new TextDecoder(label);
  } catch {
    return null;
  }
}

export function decodeHtml(body: Buffer, contentType: string): string {
  // A byte order mark wins, then the HTTP header, then <meta charset>.
  if (body[0] === 0xef && body[1] === 0xbb && body[2] === 0xbf) return new TextDecoder("utf-8").decode(body);
  if (body[0] === 0xff && body[1] === 0xfe) return new TextDecoder("utf-16le").decode(body);
  if (body[0] === 0xfe && body[1] === 0xff) return new TextDecoder("utf-16be").decode(body);
  const decoder =
    makeDecoder(charsetFromContentType(contentType)) ??
    makeDecoder(charsetFromMeta(body.subarray(0, 4096).toString("latin1"))) ??
    new TextDecoder("utf-8");
  return decoder.decode(body);
}

export function isHtmlContentType(contentType: string): boolean {
  const type = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  // Some servers send no type at all for HTML pages.
  return type === "" || type === "text/html" || type === "application/xhtml+xml";
}
