// An article kept on the device for reading offline (decision 153): what the
// server sends for it, and what the browser keeps in IndexedDB. Shared by the
// server and the browser, so it holds only types and plain functions.

/** The summary shown with a kept article: its text, without costs. */
export interface KeptSummary {
  model: string;
  language: string | null;
  tldr: string | null;
  keyPoints: string[] | null;
  partial: boolean;
}

/** A kept article's clean copy and summary, as the server sends it. */
export interface OfflineCopy {
  id: string;
  /** Changes whenever the article or its shown summary does, so a kept copy can be checked cheaply. */
  version: string;
  url: string;
  title: string | null;
  siteName: string | null;
  author: string | null;
  lang: string | null;
  /** ISO dates. */
  publishedAt: string | null;
  savedAt: string;
  readingMinutes: number | null;
  previewOnly: boolean;
  /** Sanitized with DOMPurify before it was stored on the server. */
  contentHtml: string | null;
  excerpt: string | null;
  summary: KeptSummary | null;
}

/** A copy as the browser keeps it, with when it was kept. */
export interface KeptArticle extends OfflineCopy {
  keptAt: string;
}

/** What the browser asks the server for: the kept articles' ids, each with the version it has (null for none yet). */
export type HaveVersions = Record<string, string | null>;

/** The server's answer: copies that are new or changed, and the ids it no longer has. */
export interface OfflineSync {
  copies: OfflineCopy[];
  removed: string[];
}

/** The most articles one request may ask about. */
export const MAX_SYNC_IDS = 1000;

/** The version of an article's copy, from when it and its shown summary last changed. */
export function copyVersion(articleUpdatedAt: Date, summary: { id: string; updatedAt: Date } | undefined): string {
  return `${articleUpdatedAt.getTime()}:${summary ? `${summary.id}:${summary.updatedAt.getTime()}` : ""}`;
}

/** Reads a request body that should be HaveVersions, or null when it isn't one. */
export function parseHaveVersions(body: unknown): HaveVersions | null {
  if (!body || typeof body !== "object" || !("have" in body)) return null;
  const have = body.have;
  if (!have || typeof have !== "object" || Array.isArray(have)) return null;
  const entries = Object.entries(have);
  if (entries.length > MAX_SYNC_IDS) return null;
  for (const [id, version] of entries) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    if (version !== null && typeof version !== "string") return null;
  }
  return have as HaveVersions;
}
