import { sql } from "drizzle-orm";
import {
  boolean,
  customType,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { StoredMessage } from "@/i18n/stored-message";

const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

// ---------------------------------------------------------------------------
// Better Auth tables. Field names follow Better Auth's core schema; the
// adapter runs with `usePlural: true`, so the tables are users, sessions, ...
// ---------------------------------------------------------------------------

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [index("sessions_user_id_idx").on(t.userId)],
);

export const accounts = pgTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("accounts_user_id_idx").on(t.userId)],
);

export const verifications = pgTable(
  "verifications",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("verifications_identifier_idx").on(t.identifier)],
);

// ---------------------------------------------------------------------------
// App tables. Every one has a user_id, and every query filters on it.
// ---------------------------------------------------------------------------

export const userSettings = pgTable("user_settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  // Null until chosen in Settings: then DEFAULT_SUMMARY_MODEL applies.
  defaultModel: text("default_model"),
  comparisonMode: boolean("comparison_mode").notNull().default(false),
  // The interface language (en, fr, zh-Hans, zh-Hant), or null to follow the browser.
  locale: text("locale"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// How articles look for this user (see lib/appearance.ts).
export const userAppearance = pgTable("user_appearance", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  theme: text("theme").notNull(),
  lightPalette: text("light_palette").notNull(),
  darkPalette: text("dark_palette").notNull(),
  font: text("font").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const apiTokens = pgTable(
  "api_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // SHA-256 of the token. The token itself is shown once and never stored.
    tokenHash: text("token_hash").notNull().unique(),
    // The first few characters, so the owner can tell tokens apart.
    tokenPrefix: text("token_prefix").notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("api_tokens_user_id_idx").on(t.userId)],
);

export const folders = pgTable(
  "folders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("folders_user_name_idx").on(t.userId, sql`lower(${t.name})`)],
);

export type ArticleStatus = "pending" | "processing" | "ready" | "failed";
export type ContentSource = "client" | "server";
export type SaveSource = "extension" | "shortcut" | "android" | "web" | "api";

export const articles = pgTable(
  "articles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // The URL exactly as it was saved.
    url: text("url").notNull(),
    // Tracking parameters and fragment removed; used to catch duplicates.
    normalizedUrl: text("normalized_url").notNull(),
    // Download and extraction state. Summaries have their own status.
    status: text("status").$type<ArticleStatus>().notNull().default("pending"),
    // Why saving failed, in English (for logs and rows from before
    // error_message); error_message is the same as a message key and its
    // values, translated when shown.
    error: text("error"),
    errorMessage: jsonb("error_message").$type<StoredMessage>(),
    saveSource: text("save_source").$type<SaveSource>().notNull().default("api"),
    // Where the stored copy came from: the user's browser or our own download.
    contentSource: text("content_source").$type<ContentSource>(),
    // HTML sent by the extension or Shortcut, kept only until it is extracted.
    submittedHtml: text("submitted_html"),
    submittedTitle: text("submitted_title"),

    title: text("title"),
    author: text("author"),
    siteName: text("site_name"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    lang: text("lang"),
    excerpt: text("excerpt"),
    contentHtml: text("content_html"),
    textContent: text("text_content"),
    wordCount: integer("word_count"),
    readingMinutes: integer("reading_minutes"),
    previewOnly: boolean("preview_only").notNull().default(false),
    previewReason: text("preview_reason"),
    previewReasonMessage: jsonb("preview_reason_message").$type<StoredMessage>(),

    // The model whose summary is shown. Set from the default model at save
    // time and changed by "Re-summarize with...".
    summaryModel: text("summary_model"),

    favorite: boolean("favorite").notNull().default(false),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    readAt: timestamp("read_at", { withTimezone: true }),
    // Set by "Later" in Triage, which moves the article to the back of the queue.
    triagedAt: timestamp("triaged_at", { withTimezone: true }),
    folderId: uuid("folder_id").references(() => folders.id, { onDelete: "set null" }),
    // Library order. Re-saving an article moves it back to the top.
    savedAt: timestamp("saved_at", { withTimezone: true }).notNull().defaultNow(),
    searchVector: tsvector("search_vector"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("articles_user_normalized_url_idx").on(t.userId, t.normalizedUrl),
    index("articles_user_saved_at_idx").on(t.userId, t.savedAt.desc()),
    index("articles_search_idx").using("gin", t.searchVector),
  ],
);

// Every address that led to an article, normalized, so that saving any of
// them again finds it: the link as saved, the page's trusted canonical
// address, and where our own download ended after redirects. The article's
// normalized_url is one of them.
export const articleUrls = pgTable(
  "article_urls",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    normalizedUrl: text("normalized_url").notNull(),
    articleId: uuid("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.normalizedUrl] }), index("article_urls_article_id_idx").on(t.articleId)],
);

export type SummaryStatus = "pending" | "running" | "ready" | "failed";

export const summaries = pgTable(
  "summaries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    articleId: uuid("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    // The model that was asked for.
    model: text("model").notNull(),
    status: text("status").$type<SummaryStatus>().notNull().default("pending"),
    // The model that actually answered (differs when a refusal fell back).
    servedModel: text("served_model"),
    effort: text("effort"),
    language: text("language"),
    tldr: text("tldr"),
    keyPoints: jsonb("key_points").$type<string[]>(),
    suggestedTags: jsonb("suggested_tags").$type<string[]>(),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    costUsd: numeric("cost_usd", { precision: 12, scale: 6, mode: "number" }),
    durationMs: integer("duration_ms"),
    // True when the article was longer than the input limit and only its
    // beginning was summarized.
    partial: boolean("partial").notNull().default(false),
    inputChars: integer("input_chars"),
    totalChars: integer("total_chars"),
    stopReason: text("stop_reason"),
    // As on articles: English text, and the same as a message key and values.
    error: text("error"),
    errorMessage: jsonb("error_message").$type<StoredMessage>(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("summaries_article_model_idx").on(t.articleId, t.model),
    index("summaries_user_id_idx").on(t.userId),
  ],
);

// A summary in another language (lib/summarize/languages.ts says which). It
// is translated by the model that wrote the summary, and again whenever the
// summary is written again.
export const summaryTranslations = pgTable(
  "summary_translations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    articleId: uuid("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    summaryId: uuid("summary_id")
      .notNull()
      .references(() => summaries.id, { onDelete: "cascade" }),
    // en, fr, zh-Hans or zh-Hant.
    language: text("language").notNull(),
    status: text("status").$type<SummaryStatus>().notNull().default("pending"),
    // The model asked, the summary's own; servedModel as on summaries.
    model: text("model").notNull(),
    servedModel: text("served_model"),
    effort: text("effort"),
    tldr: text("tldr"),
    keyPoints: jsonb("key_points").$type<string[]>(),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    costUsd: numeric("cost_usd", { precision: 12, scale: 6, mode: "number" }),
    durationMs: integer("duration_ms"),
    stopReason: text("stop_reason"),
    error: text("error"),
    errorMessage: jsonb("error_message").$type<StoredMessage>(),
    // The job that may write this row. A job it no longer names was
    // superseded (the summary was written again) and changes nothing.
    jobId: uuid("job_id"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("summary_translations_summary_language_idx").on(t.summaryId, t.language),
    index("summary_translations_article_id_idx").on(t.articleId),
    index("summary_translations_user_id_idx").on(t.userId),
  ],
);

export type AiUsageKind = "summary" | "translation";

// Every answer Claude gave, usable or not, for cost reports and limits.
// Summaries and translations are written again or removed, so their own rows
// can't say what was spent. A row outlives its article, not its user.
export const aiUsage = pgTable(
  "ai_usage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    articleId: uuid("article_id").references(() => articles.id, { onDelete: "set null" }),
    summaryId: uuid("summary_id").references(() => summaries.id, { onDelete: "set null" }),
    kind: text("kind").$type<AiUsageKind>().notNull(),
    // For a translation, the language asked for.
    language: text("language"),
    // The model asked; servedModel as on summaries.
    model: text("model").notNull(),
    servedModel: text("served_model"),
    effort: text("effort"),
    inputTokens: integer("input_tokens").notNull(),
    outputTokens: integer("output_tokens").notNull(),
    costUsd: numeric("cost_usd", { precision: 12, scale: 6, mode: "number" }),
    durationMs: integer("duration_ms").notNull(),
    stopReason: text("stop_reason"),
    createdAt: createdAt(),
  },
  (t) => [
    index("ai_usage_user_created_idx").on(t.userId, t.createdAt),
    index("ai_usage_summary_kind_idx").on(t.summaryId, t.kind),
    // Deleting an article clears its rows' article_id.
    index("ai_usage_article_id_idx").on(t.articleId),
  ],
);

export type JobType = "process_article" | "summarize" | "translate_summary";
export type JobStatus = "queued" | "running" | "done" | "failed";

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    articleId: uuid("article_id").references(() => articles.id, { onDelete: "cascade" }),
    type: text("type").$type<JobType>().notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    status: text("status").$type<JobStatus>().notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lockedBy: text("locked_by"),
    lastError: text("last_error"),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("jobs_claim_idx").on(t.status, t.runAt),
    index("jobs_article_id_idx").on(t.articleId),
  ],
);

export const tags = pgTable(
  "tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("tags_user_name_idx").on(t.userId, sql`lower(${t.name})`)],
);

export const articleTags = pgTable(
  "article_tags",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    articleId: uuid("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.articleId, t.tagId] }), index("article_tags_tag_id_idx").on(t.tagId)],
);

export type Article = typeof articles.$inferSelect;
export type Summary = typeof summaries.$inferSelect;
export type SummaryTranslation = typeof summaryTranslations.$inferSelect;
export type AiUsage = typeof aiUsage.$inferSelect;
export type Job = typeof jobs.$inferSelect;
export type ApiToken = typeof apiTokens.$inferSelect;
export type UserSettings = typeof userSettings.$inferSelect;
