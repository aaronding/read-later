// Integration test: POST /api/save -> job queue -> extraction -> summary,
// with the Claude API mocked and PGlite standing in for Postgres.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, OPTIONS, POST } from "@/app/api/save/route";
import { SUMMARY_MODELS } from "@/config/models";
import type { Db } from "@/db";
import { aiUsage, articles, jobs, summaries } from "@/db/schema";
import type { AppLocale } from "@/i18n/locales";
import { englishText } from "@/i18n/stored-message";
import { processJobs } from "@/lib/jobs/process";
import { processArticle, requestSummary } from "@/lib/jobs/handlers";
import { claimJobs } from "@/lib/jobs/queue";
import { retryArticle } from "@/lib/library";
import { safeFetch } from "@/lib/net/safe-fetch";
import { updateSettings } from "@/lib/settings";
import { setAnthropicClient } from "@/lib/summarize/summarize";
import { createApiToken, revokeApiToken } from "@/lib/tokens";
import { SHORTCUT_SCRIPT } from "@/lib/shortcut";
import { JSDOM } from "jsdom";
import { createTestDb, createTestUser } from "./db";

// Server-side downloads are replaced so no test touches the network.
vi.mock("@/lib/net/safe-fetch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/net/safe-fetch")>();
  return { ...actual, safeFetch: vi.fn() };
});

// Some French replies of the save API, whatever messages/fr holds, to tell
// which language a reply is in.
const FRENCH = vi.hoisted(() => ({
  Api: {
    unauthorized: "Jeton d’accès manquant ou non valide.",
    connected: "Connecté à {app}",
    saved: "Enregistré dans {app}",
    badRequest: "Envoyez du JSON comme {example}.",
  },
  invalidUrl: "{field} doit être une URL http ou https absolue.",
}));

vi.mock("@/i18n/messages", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/i18n/messages")>();
  return {
    ...actual,
    async loadMessages(locale: AppLocale) {
      const messages = await actual.loadMessages(locale);
      if (locale !== "fr") return messages;
      const { Api, Errors } = messages;
      return {
        ...messages,
        Api: { ...Api, ...FRENCH.Api },
        Errors: { ...Errors, save: { ...Errors.save, invalidUrl: FRENCH.invalidUrl } },
      } as typeof messages;
    },
  };
});

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => readFileSync(path.join(here, "../lib/extract/fixtures", name), "utf-8");
const ARTICLE_URL = "https://www.riversideledger.example/features/community-orchards";

// ---------------------------------------------------------------------------
// A fake Anthropic client that records each request.
// ---------------------------------------------------------------------------

type StreamParams = Parameters<Anthropic["beta"]["messages"]["stream"]>[0];
type Reply = (params: StreamParams) => Partial<Anthropic.Beta.BetaMessage> | Error | "hang";

const requests: StreamParams[] = [];
let reply: Reply;

function summaryJson(model: string) {
  return JSON.stringify({
    language: "en",
    tldr: `Community orchards are returning to public land (${model}).`,
    key_points: [
      "More than sixty orchards have been planted on public land in the region.",
      "Volunteers do most of the work, and the fruit is free to anyone.",
      "Councils save on mowing and see fewer complaints.",
      "Projects fail without a plan for watering in the first summers.",
      "Millbrook made nearly 300 litres of juice last year.",
      "A sixth point that should be dropped.",
    ],
    suggested_tags: ["Gardening", "#community", "gardening", "local government"],
  });
}

const defaultReply: Reply = (params) => ({
  content: [
    { type: "thinking", thinking: "", signature: "sig" },
    { type: "text", text: summaryJson(params.model), citations: null },
  ] as Anthropic.Beta.BetaContentBlock[],
  stop_reason: "end_turn",
});

const fakeClient = {
  beta: {
    messages: {
      stream(params: StreamParams, options?: { signal?: AbortSignal }) {
        requests.push(params);
        const result = reply(params);
        return {
          async finalMessage() {
            if (result === "hang") {
              // Never answers, like a stalled stream; only the abort signal ends it.
              return new Promise<never>((_, reject) =>
                options?.signal?.addEventListener("abort", () => reject(new Anthropic.APIUserAbortError())),
              );
            }
            if (result instanceof Error) throw result;
            return {
              id: "msg_test",
              type: "message",
              role: "assistant",
              model: params.model,
              stop_sequence: null,
              stop_details: null,
              container: null,
              context_management: null,
              usage: {
                input_tokens: 2_000,
                output_tokens: 400,
                cache_creation_input_tokens: 0,
                cache_read_input_tokens: 0,
                iterations: null,
              },
              ...result,
            };
          },
        };
      },
    },
  },
} as unknown as Anthropic;

// ---------------------------------------------------------------------------

let db: Db;
let close: () => Promise<void>;
let token: string;

function saveRequest(body: unknown, authorization = `Bearer ${token}`, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/save", {
    method: "POST",
    headers: { authorization, "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function articleById(id: string) {
  const [row] = await db.select().from(articles).where(eq(articles.id, id));
  return row!;
}

async function summariesFor(articleId: string) {
  return db.select().from(summaries).where(eq(summaries.articleId, articleId));
}

beforeAll(async () => {
  process.env.ALLOWED_EMAILS = "owner@example.com";
  process.env.RUN_JOBS_AFTER_RESPONSE = "false";
  process.env.APP_URL = "https://read.example.com";
  ({ db, close } = await createTestDb());
  setAnthropicClient(fakeClient);
});

afterAll(async () => {
  setAnthropicClient(undefined);
  await close();
});

beforeEach(async () => {
  await db.delete(articles);
  await db.delete(jobs);
  const { users } = await import("@/db/schema");
  await db.delete(users);
  await createTestUser(db);
  ({ token } = await createApiToken(db, "user-1", "Test"));
  requests.length = 0;
  reply = defaultReply;
  vi.mocked(safeFetch).mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("save -> job -> summary", () => {
  it("saves quickly, then extracts and summarizes in the background", async () => {
    const started = performance.now();
    const response = await POST(
      saveRequest({ url: `${ARTICLE_URL}?utm_source=x`, html: fixture("news-article.html"), title: "Orchards", source: "extension" }),
    );
    const elapsed = performance.now() - started;
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toMatchObject({ ok: true, status: "saved", message: "Saved to ReadSooner", outcome: "created" });
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(elapsed).toBeLessThan(1000);

    const pending = await articleById(body.id);
    expect(pending.status).toBe("pending");
    expect(pending.url).toBe(`${ARTICLE_URL}?utm_source=x`); // exactly as saved
    expect(pending.saveSource).toBe("extension");
    expect(pending.summaryModel).toBe("claude-sonnet-5-5");
    expect(requests).toHaveLength(0); // nothing slow happened during the request

    const stats = await processJobs({ db });
    expect(stats).toEqual({ claimed: 2, succeeded: 2, retrying: 0, failed: 0 });
    expect(safeFetch).not.toHaveBeenCalled(); // the browser's HTML was used

    const article = await articleById(body.id);
    expect(article).toMatchObject({
      status: "ready",
      contentSource: "client",
      title: "The quiet return of community orchards",
      siteName: "Riverside Ledger",
      previewOnly: false,
      submittedHtml: null,
      // The page's same-site canonical became the duplicate key.
      normalizedUrl: ARTICLE_URL,
    });
    expect(article.contentHtml).toContain("forty young apple trees");
    expect(article.readingMinutes).toBe(3);

    const [summary] = await summariesFor(article.id);
    expect(summary).toMatchObject({
      model: "claude-sonnet-5-5",
      servedModel: "claude-sonnet-5-5",
      status: "ready",
      language: "en",
      tldr: "Community orchards are returning to public land (claude-sonnet-5-5).",
      inputTokens: 2_000,
      outputTokens: 400,
      partial: false,
      effort: "low",
    });
    // A short article gets three points, and the answer's extra ones are dropped.
    expect(summary!.keyPoints).toHaveLength(3);
    expect(summary!.suggestedTags).toEqual(["Gardening", "community", "local government"]);
    expect(summary!.costUsd).toBeCloseTo((2_000 * 2 + 400 * 10) / 1e6, 6);
    expect(summary!.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("sends the request shape from the claude-api guidance", async () => {
    const response = await POST(saveRequest({ url: ARTICLE_URL, html: fixture("news-article.html") }));
    await processJobs({ db });
    expect(response.status).toBe(201);
    const [params] = requests;
    expect(params).toMatchObject({
      model: "claude-sonnet-5-5",
      thinking: { type: "adaptive" },
      output_config: { effort: "low", format: { type: "json_schema" } },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
    expect(params!.max_tokens).toBeGreaterThanOrEqual(16_000);
    expect(String(params!.system)).toContain("language the article is written in");
    const userMessage = String(params!.messages[0]!.content);
    expect(userMessage).toContain("<article_text>");
    expect(userMessage).toContain("forty young apple trees");
    expect(userMessage).toContain("Title: The quiet return of community orchards");
    expect(userMessage).toContain("Summarize this article in 3 key points.");
  });

  it("runs all three models in comparison mode, without fallbacks on Haiku", async () => {
    process.env.ADMIN_EMAILS = "owner@example.com";
    let id: string;
    try {
      await updateSettings(db, "user-1", { defaultModel: "claude-sonnet-5-5", comparisonMode: true });
      const response = await POST(saveRequest({ url: ARTICLE_URL, html: fixture("news-article.html") }));
      ({ id } = await response.json());
      expect((await processJobs({ db })).succeeded).toBe(4);
    } finally {
      delete process.env.ADMIN_EMAILS;
    }

    const rows = await summariesFor(id);
    expect(rows.map((row) => row.model).sort()).toEqual(["claude-haiku-5-5", "claude-opus-5-5", "claude-sonnet-5-5"]);
    expect(rows.every((row) => row.status === "ready")).toBe(true);
    expect((await articleById(id)).summaryModel).toBe("claude-sonnet-5-5");

    const haiku = requests.find((params) => params.model === "claude-haiku-5-5")!;
    expect(haiku).not.toHaveProperty("fallbacks");
    expect(haiku).not.toHaveProperty("betas");
    const haikuRow = rows.find((row) => row.model === "claude-haiku-5-5")!;
    expect(haikuRow.costUsd).toBeCloseTo((2_000 * 0.1 + 400 * 0.5) / 1e6, 8);
  });

  it("ignores comparison mode for someone who isn't an admin", async () => {
    await updateSettings(db, "user-1", { defaultModel: "claude-sonnet-5-5", comparisonMode: true });
    const { id } = await (await POST(saveRequest({ url: ARTICLE_URL, html: fixture("news-article.html") }))).json();
    expect((await processJobs({ db })).succeeded).toBe(2);
    expect((await summariesFor(id)).map((row) => row.model)).toEqual(["claude-sonnet-5-5"]);
  });

  it("runs other models that summarized an earlier copy again only for an admin", async () => {
    for (const admin of [false, true]) {
      if (admin) process.env.ADMIN_EMAILS = "owner@example.com";
      // Both rounds save the same page.
      await db.delete(articles);
      try {
        // A teaser saved first, summarized by the default model, and by the
        // others too, as comparison mode did for everyone before.
        const { id } = await (await POST(saveRequest({ url: ARTICLE_URL, html: fixture("teaser-paywall.html") }))).json();
        await processJobs({ db });
        const shown = (await articleById(id)).summaryModel!;
        const others = SUMMARY_MODELS.filter((model) => model !== shown);
        await db.insert(summaries).values(others.map((model) => ({ userId: "user-1", articleId: id, model, status: "ready" as const })));

        // The full page replaces the teaser.
        requests.length = 0;
        await POST(saveRequest({ url: ARTICLE_URL, html: fixture("news-article.html") }));
        await processJobs({ db });
        expect(requests.map((params) => params.model).sort()).toEqual(admin ? [...SUMMARY_MODELS].sort() : [shown]);
      } finally {
        delete process.env.ADMIN_EMAILS;
      }
    }
  });

  it("marks a summary partial when the article is longer than the input limit", async () => {
    process.env.SUMMARY_MAX_INPUT_CHARS = "2000";
    try {
      const { id } = await (await POST(saveRequest({ url: ARTICLE_URL, html: fixture("news-article.html") }))).json();
      await processJobs({ db });
      const [summary] = await summariesFor(id);
      expect(summary!.partial).toBe(true);
      expect(summary!.inputChars).toBeLessThanOrEqual(2000);
      expect(summary!.totalChars).toBeGreaterThan(2000);
      expect(String(requests[0]!.messages[0]!.content)).toContain("This is the first");
    } finally {
      delete process.env.SUMMARY_MAX_INPUT_CHARS;
    }
  });
});

describe("the monthly AI allowance", () => {
  // What the user's answers cost this month, as if earlier summaries had used it.
  const spend = (costUsd: number) =>
    db.insert(aiUsage).values({
      userId: "user-1",
      articleId: null,
      summaryId: null,
      kind: "summary",
      model: "claude-sonnet-5-5",
      inputTokens: 1000,
      outputTokens: 200,
      costUsd,
      durationMs: 1000,
    });

  it("still saves at the limit, but doesn't ask Claude until next month", async () => {
    await spend(1);
    const response = await POST(saveRequest({ url: ARTICLE_URL, html: fixture("news-article.html") }));
    const body = await response.json();
    expect(response.status).toBe(201);
    expect(body.message).toMatch(/^Saved to .+\. This month’s AI allowance is used up, so it won’t be summarized until [A-Z][a-z]+ 1\.$/);
    expect(body.aiAllowance).toEqual({ usedPercent: 100, renewsOn: expect.stringMatching(/^\d{4}-\d{2}-01$/) });
    expect(JSON.stringify(body)).not.toMatch(/usd|cost/i);

    await processJobs({ db });
    expect(requests).toHaveLength(0);
    expect(await articleById(body.id)).toMatchObject({ status: "ready" });
    const [summary] = await summariesFor(body.id);
    expect(summary).toMatchObject({ status: "failed", errorMessage: { key: "summary.monthlyLimit" } });

    // A new month: what was spent is last month's, and Retry summarizes it.
    await db.update(aiUsage).set({ createdAt: new Date(Date.now() - 40 * 24 * 3600 * 1000) });
    await retryArticle(db, "user-1", body.id, { admin: false });
    await processJobs({ db });
    expect(requests).toHaveLength(1);
    expect((await summariesFor(body.id))[0]).toMatchObject({ status: "ready" });
  });

  it("warns when it is close, and still summarizes", async () => {
    await spend(0.85);
    const body = await (await POST(saveRequest({ url: ARTICLE_URL, html: fixture("news-article.html") }))).json();
    expect(body.message).toMatch(/^Saved to .+\. You’ve used 85% of this month’s AI allowance\.$/);
    expect(body.aiAllowance).toMatchObject({ usedPercent: 85 });
    await processJobs({ db });
    expect((await summariesFor(body.id))[0]).toMatchObject({ status: "ready" });
  });

  it("says nothing well before the limit", async () => {
    await spend(0.5);
    const body = await (await POST(saveRequest({ url: ARTICLE_URL, html: fixture("news-article.html") }))).json();
    expect(body.message).toMatch(/^Saved to [^.]+$/);
    expect(body.aiAllowance).toMatchObject({ usedPercent: 50 });
  });

  it("doesn't limit an admin", async () => {
    process.env.ADMIN_EMAILS = "owner@example.com";
    try {
      await spend(5);
      const body = await (await POST(saveRequest({ url: ARTICLE_URL, html: fixture("news-article.html") }))).json();
      expect(body.aiAllowance).toBeUndefined();
      await processJobs({ db });
      expect((await summariesFor(body.id))[0]).toMatchObject({ status: "ready" });
    } finally {
      delete process.env.ADMIN_EMAILS;
    }
  });
});

describe("the Apple Shortcut", () => {
  it("sends a payload the save API accepts", async () => {
    // Run the Shortcut's script the way "Run JavaScript on Web Page" does.
    const page = new JSDOM(fixture("news-article.html"), { url: `${ARTICLE_URL}?utm_source=share` });
    let result = "";
    new Function("document", "completion", SHORTCUT_SCRIPT)(page.window.document, (value: string) => {
      result = value;
    });
    const payload = JSON.parse(result);
    expect(payload).toMatchObject({ url: `${ARTICLE_URL}?utm_source=share`, source: "shortcut" });
    expect(payload.html).not.toContain("<script");

    // "Get Contents of URL" sends the script's text as a file body.
    const response = await POST(
      new Request("http://localhost/api/save", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/octet-stream" },
        body: result,
      }),
    );
    const body = await response.json();
    expect(response.status).toBe(201);
    expect(body.message).toBe("Saved to ReadSooner");
    await processJobs({ db });
    expect(await articleById(body.id)).toMatchObject({ saveSource: "shortcut", contentSource: "client", previewOnly: false });
  });
});

describe("duplicates and previews", () => {
  it("moves a re-saved article back to the top of the Inbox instead of saving it twice", async () => {
    const first = await (await POST(saveRequest({ url: ARTICLE_URL, html: fixture("news-article.html") }))).json();
    await processJobs({ db });
    await db.update(articles).set({ archivedAt: new Date(), savedAt: new Date("2026-01-01") }).where(eq(articles.id, first.id));

    const again = await POST(saveRequest({ url: `${ARTICLE_URL}?utm_campaign=y&fbclid=z#comments` }));
    const body = await again.json();
    expect(again.status).toBe(200);
    expect(body).toMatchObject({ id: first.id, outcome: "resaved" });

    const article = await articleById(first.id);
    expect(article.archivedAt).toBeNull();
    expect(article.savedAt.getTime()).toBeGreaterThan(new Date("2026-06-01").getTime());
    expect(await db.select().from(articles)).toHaveLength(1);
    expect((await processJobs({ db })).claimed).toBe(0); // nothing to redo
  });

  it("replaces a preview-only copy with a full-page save", async () => {
    // A URL-only save: our download gets a login wall.
    vi.mocked(safeFetch).mockResolvedValue({
      url: ARTICLE_URL,
      status: 200,
      headers: {},
      contentType: "text/html; charset=utf-8",
      body: Buffer.from(fixture("login-wall.html")),
      redirects: [],
    });
    const { id } = await (await POST(saveRequest({ url: ARTICLE_URL, source: "shortcut" }))).json();
    await processJobs({ db });
    const preview = await articleById(id);
    expect(preview).toMatchObject({
      status: "ready",
      previewOnly: true,
      contentSource: "server",
      previewReason: "This looks like a login page rather than the article.",
      previewReasonMessage: { key: "preview.loginPage" },
    });
    expect(requests).toHaveLength(0); // too little text to summarize

    // The owner saves the full page from their signed-in browser.
    const replaced = await (await POST(saveRequest({ url: ARTICLE_URL, html: fixture("news-article.html") }))).json();
    expect(replaced).toMatchObject({ id, outcome: "replaced" });
    await processJobs({ db });
    const full = await articleById(id);
    expect(full).toMatchObject({ previewOnly: false, previewReason: null, previewReasonMessage: null, contentSource: "client" });
    expect((await summariesFor(id))[0]?.status).toBe("ready");
  });

  it("keeps different users' copies separate", async () => {
    await createTestUser(db, "second@example.com", "user-2");
    process.env.ALLOWED_EMAILS = "owner@example.com,second@example.com";
    const { token: secondToken } = await createApiToken(db, "user-2", "Second");
    const a = await (await POST(saveRequest({ url: ARTICLE_URL, html: fixture("news-article.html") }))).json();
    const b = await (await POST(saveRequest({ url: ARTICLE_URL }, `Bearer ${secondToken}`))).json();
    expect(a.id).not.toBe(b.id);
    const rows = await db.select({ userId: articles.userId }).from(articles);
    expect(rows.map((row) => row.userId).sort()).toEqual(["user-1", "user-2"]);
    process.env.ALLOWED_EMAILS = "owner@example.com";
  });
});

async function enqueueTestJob(articleId: string) {
  const { enqueueJob } = await import("@/lib/jobs/queue");
  await enqueueJob(db, { userId: "user-1", articleId, type: "process_article" });
}

describe("saving an address again", () => {
  const download = (url: string, body: string) => ({
    url,
    status: 200,
    headers: {},
    contentType: "text/html; charset=utf-8",
    body: Buffer.from(body),
    redirects: [],
  });
  const count = async () => (await db.select().from(articles)).length;
  const save = async (url: string) => (await POST(saveRequest({ url, source: "shortcut" }))).json();

  it("finds an article by the link it was saved from, after its key became the page's canonical address", async () => {
    const shared = "https://riversideledger.example/features/community-orchards?ref=share";
    vi.mocked(safeFetch).mockResolvedValue(download(shared, fixture("news-article.html")));
    const first = await save(shared);
    await processJobs({ db });
    expect((await articleById(first.id)).normalizedUrl).toBe(ARTICLE_URL);
    expect(await save(shared)).toMatchObject({ id: first.id, outcome: "resaved" });
    expect(await count()).toBe(1);
  });

  it("finds an article by a short link that redirected to it, and by the address it landed on", async () => {
    vi.mocked(safeFetch).mockResolvedValue(download(ARTICLE_URL, fixture("news-article.html")));
    const first = await save("https://sho.rt/abc");
    await processJobs({ db });
    for (const url of ["https://sho.rt/abc", `${ARTICLE_URL}#comments`, `${ARTICLE_URL}?utm_source=x`]) {
      expect(await save(url), url).toMatchObject({ id: first.id, outcome: "resaved" });
    }
    expect(await count()).toBe(1);
  });

  it("finds an article by where its download landed, when the page names another canonical address", async () => {
    const landed = "https://riversideledger.example/features/community-orchards?amp=1";
    vi.mocked(safeFetch).mockResolvedValue(download(landed, fixture("news-article.html")));
    const first = await save("https://sho.rt/amp");
    await processJobs({ db });
    expect((await articleById(first.id)).normalizedUrl).toBe(ARTICLE_URL);
    expect(await save(landed)).toMatchObject({ id: first.id, outcome: "resaved" });
    expect(await count()).toBe(1);
  });

  it("downloads a preview again when its address is saved again, and keeps the full copy", async () => {
    vi.mocked(safeFetch).mockResolvedValue(download(ARTICLE_URL, fixture("login-wall.html")));
    const { id } = await save(ARTICLE_URL);
    await processJobs({ db });
    expect((await articleById(id)).previewOnly).toBe(true);

    vi.mocked(safeFetch).mockResolvedValue(download(ARTICLE_URL, fixture("news-article.html")));
    expect(await save(ARTICLE_URL)).toMatchObject({ id, outcome: "resaved" });
    await processJobs({ db });
    expect(await articleById(id)).toMatchObject({ previewOnly: false, contentSource: "server" });
    expect((await summariesFor(id))[0]?.status).toBe("ready");
  });

  it("keeps a preview when the new download is a shorter one", async () => {
    vi.mocked(safeFetch).mockResolvedValue(download(ARTICLE_URL, fixture("login-wall.html")));
    const { id } = await save(ARTICLE_URL);
    await processJobs({ db });
    const before = await articleById(id);

    const shorter = "<html><head><title>Sign in</title></head><body><form><input type=\"password\"></form><p>Sign in to read.</p></body></html>";
    vi.mocked(safeFetch).mockResolvedValue(download(ARTICLE_URL, shorter));
    await save(ARTICLE_URL);
    await processJobs({ db });
    expect(await articleById(id)).toMatchObject({ previewOnly: true, wordCount: before.wordCount, textContent: before.textContent });
  });

  it("only moves a complete article to the top when its address is saved again", async () => {
    vi.mocked(safeFetch).mockResolvedValue(download(ARTICLE_URL, fixture("news-article.html")));
    const { id } = await save(ARTICLE_URL);
    await processJobs({ db });
    vi.mocked(safeFetch).mockClear();
    expect(await save(ARTICLE_URL)).toMatchObject({ id, outcome: "resaved" });
    expect((await processJobs({ db })).claimed).toBe(0);
    expect(safeFetch).not.toHaveBeenCalled();
  });

  // A sign-in page of about this many words, flagged as a login page.
  const signInPage = (words: number) =>
    `<html><head><title>Sign in</title></head><body><form><input type="password"></form><p>${"Members read every story. ".repeat(Math.ceil(words / 4))}</p></body></html>`;

  it("asks for no new summary when a teaser saved again by its address comes back the same", async () => {
    vi.mocked(safeFetch).mockResolvedValue(download(ARTICLE_URL, fixture("teaser-paywall.html")));
    const { id } = await save(ARTICLE_URL);
    await processJobs({ db });
    const before = await articleById(id);
    expect(before.previewOnly).toBe(true);
    expect(requests).toHaveLength(1);

    expect(await save(ARTICLE_URL)).toMatchObject({ id, outcome: "resaved", queued: true, message: "Already in ReadSooner, downloading it again" });
    await processJobs({ db });
    expect(requests).toHaveLength(1);
    expect(await articleById(id)).toMatchObject({ status: "ready", textContent: before.textContent });
  });

  it("keeps a teaser over a longer sign-in page, and takes a teaser over a longer sign-in page it replaces", async () => {
    vi.mocked(safeFetch).mockResolvedValue(download(ARTICLE_URL, fixture("teaser-paywall.html")));
    const { id } = await save(ARTICLE_URL);
    await processJobs({ db });
    const teaser = await articleById(id);
    vi.mocked(safeFetch).mockResolvedValue(download(ARTICLE_URL, signInPage(250)));
    await save(ARTICLE_URL);
    await processJobs({ db });
    expect(await articleById(id)).toMatchObject({ textContent: teaser.textContent, previewReasonMessage: { key: "preview.teaser" } });

    await db.delete(articles);
    vi.mocked(safeFetch).mockResolvedValue(download(ARTICLE_URL, signInPage(250)));
    const second = await save(ARTICLE_URL);
    await processJobs({ db });
    expect((await articleById(second.id)).previewReasonMessage).toEqual({ key: "preview.loginPage" });
    vi.mocked(safeFetch).mockResolvedValue(download(ARTICLE_URL, fixture("teaser-paywall.html")));
    await save(ARTICLE_URL);
    await processJobs({ db });
    expect(await articleById(second.id)).toMatchObject({ textContent: teaser.textContent, previewReasonMessage: { key: "preview.teaser" } });
  });

  it("remembers no address of a bot check the download was redirected to", async () => {
    const check = `<html><head><title>Just a moment...</title><link rel="canonical" href="${ARTICLE_URL}?verify=1"></head>
      <body><script>document.cookie = "answer=42"; location.reload();</script>Please wait...</body></html>`;
    vi.mocked(safeFetch).mockResolvedValue(download(`${ARTICLE_URL}/verify?seed=9`, check));
    const { id } = await save(ARTICLE_URL);
    await processJobs({ db });
    const article = await articleById(id);
    expect(article).toMatchObject({ previewReasonMessage: { key: "preview.browserCheck" }, textContent: "" });
    expect(article.normalizedUrl).toBe(ARTICLE_URL);
    const { articleUrls } = await import("@/db/schema");
    expect((await db.select().from(articleUrls)).map((row) => row.normalizedUrl)).toEqual([ARTICLE_URL]);
  });

  it("keeps a preview readable when downloading it again fails", async () => {
    vi.mocked(safeFetch).mockResolvedValue(download(ARTICLE_URL, fixture("login-wall.html")));
    const { id } = await save(ARTICLE_URL);
    await processJobs({ db });
    const before = await articleById(id);
    vi.mocked(safeFetch).mockResolvedValue({ ...download(ARTICLE_URL, "Gone"), status: 404 });
    await save(ARTICLE_URL);
    await processJobs({ db });
    expect(await articleById(id)).toMatchObject({ status: "ready", error: null, errorMessage: null, textContent: before.textContent, previewOnly: true });
  });

  it("remembers nothing from a download it throws away", async () => {
    vi.mocked(safeFetch).mockResolvedValue(download(ARTICLE_URL, fixture("teaser-paywall.html")));
    const { id } = await save(ARTICLE_URL);
    await processJobs({ db });
    // The site now sends our download to its sign-in page, which isn't kept.
    vi.mocked(safeFetch).mockResolvedValue(download("https://www.riversideledger.example/login", signInPage(250)));
    await save(ARTICLE_URL);
    await processJobs({ db });
    expect((await articleById(id)).normalizedUrl).toBe(ARTICLE_URL);
    expect(await save("https://www.riversideledger.example/login")).toMatchObject({ outcome: "created" });
  });

  it("queues no second download while the first is running, and makes a waiting one due now", async () => {
    vi.mocked(safeFetch).mockResolvedValue(download(ARTICLE_URL, fixture("news-article.html")));
    const { id } = await save(ARTICLE_URL);
    const [running] = await claimJobs(db, 1, "slow-worker");
    expect(await save(ARTICLE_URL)).toMatchObject({ id, outcome: "resaved", queued: false });
    expect(await db.select().from(jobs).where(and(eq(jobs.articleId, id), eq(jobs.status, "queued")))).toHaveLength(0);

    // The download failed and waits an hour to try again.
    await db.update(jobs).set({ status: "queued", runAt: new Date(Date.now() + 3_600_000) }).where(eq(jobs.id, running!.id));
    await db.update(articles).set({ status: "pending", error: "Unavailable" }).where(eq(articles.id, id));
    expect(await save(ARTICLE_URL)).toMatchObject({ id, outcome: "resaved", queued: true });
    const [waiting] = await db.select().from(jobs).where(eq(jobs.id, running!.id));
    expect(waiting!.runAt.getTime()).toBeLessThanOrEqual(Date.now());
    expect(await db.select().from(jobs).where(and(eq(jobs.articleId, id), eq(jobs.type, "process_article")))).toHaveLength(1);
  });

  it("still finds an article by its old key after its job moves the key", async () => {
    const { articleUrls } = await import("@/db/schema");
    const [old] = await db
      .insert(articles)
      .values({ userId: "user-1", url: "https://sho.rt/before", normalizedUrl: "https://sho.rt/before" })
      .returning();
    await db.delete(articleUrls);
    vi.mocked(safeFetch).mockResolvedValue(download(ARTICLE_URL, fixture("news-article.html")));
    await enqueueTestJob(old!.id);
    await processJobs({ db });
    expect((await articleById(old!.id)).normalizedUrl).toBe(ARTICLE_URL);
    expect(await save("https://sho.rt/before")).toMatchObject({ id: old!.id, outcome: "resaved" });
  });

  it("saves a link too long to remember, and finds it again by its own key", async () => {
    const long = `https://www.riversideledger.example/features/community-orchards?${"q=".concat("x".repeat(2400))}`;
    vi.mocked(safeFetch).mockResolvedValue(download(long, fixture("teaser-paywall.html")));
    const first = await save(long);
    expect(first).toMatchObject({ outcome: "created" });
    expect(await save(long)).toMatchObject({ id: first.id, outcome: "resaved" });
  });

  it("remembers the addresses of articles saved before article_urls existed", async () => {
    const { articleUrls } = await import("@/db/schema");
    const [old] = await db
      .insert(articles)
      .values({ userId: "user-1", url: "https://sho.rt/old#top", normalizedUrl: ARTICLE_URL, status: "ready" })
      .returning();
    await db.delete(articleUrls);
    const backfill = readFileSync(path.join(here, "../../drizzle/0007_backfill_article_urls.sql"), "utf-8");
    for (const statement of backfill.split("--> statement-breakpoint")) await db.execute(sql.raw(statement));
    const rows = await db.select().from(articleUrls);
    expect(rows.map((row) => [row.normalizedUrl, row.articleId]).sort()).toEqual([
      ["https://sho.rt/old", old!.id],
      [ARTICLE_URL, old!.id],
    ]);
    expect(await save("https://sho.rt/old")).toMatchObject({ id: old!.id, outcome: "resaved" });
  });
});

describe("races and recovery", () => {
  it("gives a re-save with HTML its own run while the download is still running", async () => {
    vi.mocked(safeFetch).mockResolvedValue({
      url: ARTICLE_URL,
      status: 200,
      headers: {},
      contentType: "text/html",
      body: Buffer.from(fixture("login-wall.html")),
      redirects: [],
    });
    const { id } = await (await POST(saveRequest({ url: ARTICLE_URL }))).json();
    const [running] = await claimJobs(db, 1, "slow-worker"); // the download is in progress
    expect(running?.type).toBe("process_article");

    const resaved = await (await POST(saveRequest({ url: ARTICLE_URL, html: fixture("news-article.html") }))).json();
    expect(resaved).toMatchObject({ id, outcome: "replaced" });
    const queued = await db.select().from(jobs).where(and(eq(jobs.articleId, id), eq(jobs.status, "queued")));
    expect(queued.map((job) => job.type)).toEqual(["process_article"]);

    // The slow download finishes first, then the queued run uses the full HTML.
    await processArticle(db, running!);
    await processJobs({ db });
    expect(await articleById(id)).toMatchObject({ previewOnly: false, contentSource: "client" });
    expect((await summariesFor(id))[0]?.status).toBe("ready");
  });

  it("keeps HTML that arrives while an earlier copy is being processed", async () => {
    const { id } = await (await POST(saveRequest({ url: ARTICLE_URL, html: fixture("teaser-paywall.html") }))).json();
    const [job] = await claimJobs(db, 1, "worker");
    const running = processArticle(db, job!); // has read the teaser HTML
    await db.update(articles).set({ submittedHtml: "<p>newer copy</p>" }).where(eq(articles.id, id));
    await running;
    expect((await articleById(id)).submittedHtml).toBe("<p>newer copy</p>");
  });

  it("queues a new summary run when one is requested while another is running", async () => {
    const { id } = await (await POST(saveRequest({ url: ARTICLE_URL, html: fixture("news-article.html") }))).json();
    await processJobs({ db, maxJobs: 1 }); // extraction only; the summary job is queued
    const [summarizing] = await claimJobs(db, 1, "worker");
    expect(summarizing?.type).toBe("summarize");
    await requestSummary(db, { userId: "user-1", articleId: id, model: "claude-opus-5-5" });
    const queued = await db.select().from(jobs).where(and(eq(jobs.articleId, id), eq(jobs.status, "queued")));
    expect(queued).toHaveLength(1);
  });

  it("lets Retry pick up a summary stuck as pending with no job", async () => {
    const { id } = await (await POST(saveRequest({ url: ARTICLE_URL, html: fixture("news-article.html") }))).json();
    await processJobs({ db });
    await db.update(summaries).set({ status: "pending" }).where(eq(summaries.articleId, id));
    await retryArticle(db, "user-1", id, { admin: false });
    await processJobs({ db });
    expect((await summariesFor(id))[0]?.status).toBe("ready");
  });
});

describe("failures", () => {
  it("reads the fallback model's answer, not the declined partial", async () => {
    reply = (params) => ({
      content: [
        { type: "text", text: '{"tldr": "partial answer that was decl', citations: null },
        { type: "fallback", from: { model: params.model }, to: { model: "claude-opus-4-8" } },
        { type: "text", text: summaryJson("claude-opus-4-8"), citations: null },
      ] as unknown as Anthropic.Beta.BetaContentBlock[],
      stop_reason: "end_turn",
      model: "claude-opus-4-8",
    });
    const { id } = await (await POST(saveRequest({ url: ARTICLE_URL, html: fixture("news-article.html") }))).json();
    await processJobs({ db });
    expect((await summariesFor(id))[0]).toMatchObject({
      status: "ready",
      servedModel: "claude-opus-4-8",
      tldr: "Community orchards are returning to public land (claude-opus-4-8).",
    });
  });

  it("gives up on a stalled answer and retries later", async () => {
    process.env.SUMMARY_TIMEOUT_MS = "200";
    try {
      reply = () => "hang";
      const { id } = await (await POST(saveRequest({ url: ARTICLE_URL, html: fixture("news-article.html") }))).json();
      const stats = await processJobs({ db });
      expect(stats.retrying).toBe(1);
      expect((await summariesFor(id))[0]).toMatchObject({
        status: "pending",
        error: "Claude took too long to answer.",
        errorMessage: { key: "summary.timeout", values: { claude: "Claude" } },
      });
    } finally {
      delete process.env.SUMMARY_TIMEOUT_MS;
    }
  });

  it("doesn't automatically repeat a summary that ran out of tokens", async () => {
    reply = () => ({ content: [], stop_reason: "max_tokens" });
    const { id } = await (await POST(saveRequest({ url: ARTICLE_URL, html: fixture("news-article.html") }))).json();
    const stats = await processJobs({ db });
    expect(stats).toMatchObject({ failed: 1, retrying: 0 });
    expect((await summariesFor(id))[0]).toMatchObject({ status: "failed", stopReason: "max_tokens" });
  });

  it("records a refusal without retrying", async () => {
    reply = () => ({ content: [], stop_reason: "refusal", stop_details: { type: "refusal", category: "cyber", explanation: null } as never });
    const { id } = await (await POST(saveRequest({ url: ARTICLE_URL, html: fixture("news-article.html") }))).json();
    const stats = await processJobs({ db });
    expect(stats).toMatchObject({ succeeded: 1, failed: 1, retrying: 0 });
    const [summary] = await summariesFor(id);
    expect(summary).toMatchObject({
      status: "failed",
      stopReason: "refusal",
      error: "Claude declined to summarize this article (cyber).",
      errorMessage: { key: "summary.declinedCategory", values: { claude: "Claude", category: "cyber" } },
    });
  });

  it("says what to do when the Claude API refuses the key, without retrying", async () => {
    reply = () =>
      Anthropic.APIError.generate(
        401,
        { type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } },
        undefined,
        new Headers(),
      );
    const { id } = await (await POST(saveRequest({ url: ARTICLE_URL, html: fixture("news-article.html") }))).json();
    const stats = await processJobs({ db });
    expect(stats).toMatchObject({ succeeded: 1, failed: 1, retrying: 0 });
    const [summary] = await summariesFor(id);
    expect(summary).toMatchObject({ status: "failed" });
    expect(summary!.error).toMatch(/didn’t accept the API key \(invalid x-api-key\)\. Check ANTHROPIC_API_KEY/);
    expect(summary!.error).not.toContain("{");
    expect(summary!.errorMessage).toMatchObject({ key: "summary.apiKeyRejectedWithDetail" });
    expect(await englishText(summary!.errorMessage!)).toBe(summary!.error);

    // Retry runs it again and clears the old error until the new run says otherwise.
    reply = defaultReply;
    await retryArticle(db, "user-1", id, { admin: false });
    expect((await summariesFor(id))[0]).toMatchObject({ status: "pending", error: null, errorMessage: null });
    await processJobs({ db });
    expect((await summariesFor(id))[0]).toMatchObject({ status: "ready", error: null, errorMessage: null });
  });

  it("retries a connection failure later, with backoff", async () => {
    reply = () => new Anthropic.APIConnectionError({ message: "socket hang up" });
    const { id } = await (await POST(saveRequest({ url: ARTICLE_URL, html: fixture("news-article.html") }))).json();
    const stats = await processJobs({ db });
    expect(stats).toMatchObject({ succeeded: 1, retrying: 1 });
    const [summary] = await summariesFor(id);
    expect(summary).toMatchObject({ status: "pending" });
    const [job] = await db.select().from(jobs).where(and(eq(jobs.articleId, id), eq(jobs.type, "summarize")));
    expect(job).toMatchObject({ status: "queued", attempts: 1 });
    expect(job!.runAt.getTime()).toBeGreaterThan(Date.now() + 20_000);

    // Once the job is due again and the API is back, it succeeds.
    reply = defaultReply;
    await db.update(jobs).set({ runAt: new Date(Date.now() - 1000) }).where(eq(jobs.id, job!.id));
    await processJobs({ db });
    expect((await summariesFor(id))[0]?.status).toBe("ready");
  });

  it("fails a page too large to parse, without retrying", async () => {
    vi.mocked(safeFetch).mockResolvedValue({
      url: ARTICLE_URL,
      status: 200,
      headers: {},
      contentType: "text/html",
      body: Buffer.from(`<html><body>${"<div><p>word word word</p></div>".repeat(150_000)}</body></html>`),
      redirects: [],
    });
    const { id } = await (await POST(saveRequest({ url: ARTICLE_URL }))).json();
    const stats = await processJobs({ db });
    expect(stats).toMatchObject({ failed: 1, retrying: 0 });
    expect(await articleById(id)).toMatchObject({
      status: "failed",
      error: "The page is too large to save.",
      errorMessage: { key: "pageTooLarge" },
    });
  });

  it("fails a page that cannot be downloaded, and lets a re-save retry it", async () => {
    vi.mocked(safeFetch).mockResolvedValue({
      url: ARTICLE_URL,
      status: 404,
      headers: {},
      contentType: "text/html",
      body: Buffer.from("missing"),
      redirects: [],
    });
    const { id } = await (await POST(saveRequest({ url: ARTICLE_URL }))).json();
    await processJobs({ db });
    // English text for the logs and older code, and the message to translate when shown.
    const failed = await articleById(id);
    expect(failed).toMatchObject({
      status: "failed",
      error: "The page was not found (HTTP 404).",
      errorMessage: { key: "download.notFound", values: { status: "404" } },
    });
    expect(await englishText(failed.errorMessage!)).toBe(failed.error);
    const [job] = await db.select().from(jobs).where(eq(jobs.articleId, id));
    expect(job!.lastError).toBe("The page was not found (HTTP 404).");

    const again = await POST(saveRequest({ url: ARTICLE_URL, html: fixture("news-article.html") }));
    expect(await again.json()).toMatchObject({ id, outcome: "replaced" });
    expect(await articleById(id)).toMatchObject({ status: "pending", error: null, errorMessage: null });
    await processJobs({ db });
    expect(await articleById(id)).toMatchObject({ status: "ready", error: null, errorMessage: null });
  });

  it("clears a failed download's error when it is retried or re-saved without HTML", async () => {
    vi.mocked(safeFetch).mockResolvedValue({
      url: ARTICLE_URL,
      status: 200,
      headers: {},
      contentType: "application/pdf",
      body: Buffer.from("%PDF"),
      redirects: [],
    });
    const { id } = await (await POST(saveRequest({ url: ARTICLE_URL }))).json();
    await processJobs({ db });
    expect(await articleById(id)).toMatchObject({
      status: "failed",
      error: "This link is not a web page (application/pdf). Only web pages can be saved for now.",
      errorMessage: { key: "download.notWebPage", values: { type: "application/pdf" } },
    });

    await retryArticle(db, "user-1", id, { admin: false });
    expect(await articleById(id)).toMatchObject({ status: "pending", error: null, errorMessage: null });
    await processJobs({ db });
    expect(await articleById(id)).toMatchObject({ status: "failed", errorMessage: { key: "download.notWebPage" } });

    await POST(saveRequest({ url: ARTICLE_URL }));
    expect(await articleById(id)).toMatchObject({ status: "pending", error: null, errorMessage: null });
  });

  it("keeps the text of an unexpected error, and retries it", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      vi.mocked(safeFetch).mockRejectedValue(new Error("Connection terminated unexpectedly"));
      const { id } = await (await POST(saveRequest({ url: ARTICLE_URL }))).json();
      const stats = await processJobs({ db });
      expect(stats).toMatchObject({ retrying: 1, failed: 0 });
      expect(await articleById(id)).toMatchObject({
        status: "pending",
        error: "Something unexpected went wrong: Connection terminated unexpectedly",
        errorMessage: { key: "job.unexpected", values: { detail: "Connection terminated unexpectedly" } },
      });
    } finally {
      consoleError.mockRestore();
    }
  });
});

describe("authentication and input", () => {
  it("rejects missing, unknown and revoked tokens", async () => {
    const missing = await POST(saveRequest({ url: ARTICLE_URL }, ""));
    expect(missing.status).toBe(401);
    expect(await missing.json()).toEqual({
      ok: false,
      code: "unauthorized",
      error: "Missing or invalid access token. Create one in Settings.",
    });
    expect((await POST(saveRequest({ url: ARTICLE_URL }, "Bearer rl_nope"))).status).toBe(401);
    const old = await createApiToken(db, "user-1", "Old");
    expect((await POST(saveRequest({ url: ARTICLE_URL }, `Bearer ${old.token}`))).status).toBe(201);
    await revokeApiToken(db, "user-1", old.record.id);
    expect((await POST(saveRequest({ url: `${ARTICLE_URL}/2` }, `Bearer ${old.token}`))).status).toBe(401);
    // The other token still works.
    expect((await POST(saveRequest({ url: `${ARTICLE_URL}/3` }))).status).toBe(201);
  });

  it("rejects a token whose owner is no longer allowed", async () => {
    process.env.ALLOWED_EMAILS = "someone-else@example.com";
    try {
      expect((await POST(saveRequest({ url: ARTICLE_URL }))).status).toBe(401);
    } finally {
      process.env.ALLOWED_EMAILS = "owner@example.com";
    }
  });

  it("lets anyone in when sign-up is open, but no one blocked, and stops a blocked owner's work", async () => {
    process.env.ALLOWED_EMAILS = "*";
    try {
      const { id } = await (await POST(saveRequest({ url: ARTICLE_URL, html: fixture("news-article.html"), source: "extension" }))).json();
      expect(id).toBeTruthy();
      process.env.BLOCKED_EMAILS = "Owner@Example.com";
      expect((await POST(saveRequest({ url: `${ARTICLE_URL}/2` }))).status).toBe(401);
      // The download and summaries queued before the block never run, so they cost nothing.
      await processJobs({ db });
      expect(requests).toHaveLength(0);
      expect(await articleById(id)).toMatchObject({ status: "failed", errorMessage: { key: "job.accountLockedOut" } });
    } finally {
      process.env.ALLOWED_EMAILS = "owner@example.com";
      delete process.env.BLOCKED_EMAILS;
    }
  });

  it("rejects bad bodies and non-http URLs", async () => {
    const notJson = await POST(saveRequest("not json"));
    expect(notJson.status).toBe(400);
    expect(await notJson.json()).toEqual({
      ok: false,
      code: "bad_request",
      error: 'Send JSON like {"url": "https://..."}, optionally with "html" and "title".',
    });
    expect(await (await POST(saveRequest({ html: "<p>no url</p>" }))).json()).toMatchObject({ code: "bad_request" });
    const ftp = await POST(saveRequest({ url: "ftp://example.com/file" }));
    expect(ftp.status).toBe(400);
    expect(await ftp.json()).toEqual({ ok: false, code: "invalid_url", error: "url must be an absolute http or https URL." });
  });

  it("answers in the token owner's language, else the request's", async () => {
    const french = { "accept-language": "fr-CA,fr;q=0.9" };
    // No saved language: the request's languages.
    const saved = await (await POST(saveRequest({ url: ARTICLE_URL }, undefined, french))).json();
    expect(saved).toMatchObject({ ok: true, status: "saved", outcome: "created", message: "Enregistré dans ReadSooner" });

    // A saved language wins over the request's.
    await updateSettings(db, "user-1", { locale: "fr" });
    const english = { "accept-language": "en-US,en;q=0.9" };
    const second = await (await POST(saveRequest({ url: `${ARTICLE_URL}/2` }, undefined, english))).json();
    expect(second).toMatchObject({ ok: true, outcome: "created", message: "Enregistré dans ReadSooner" });
    const ftp = await (await POST(saveRequest({ url: "ftp://example.com/file" }, undefined, english))).json();
    expect(ftp).toEqual({ ok: false, code: "invalid_url", error: "url doit être une URL http ou https absolue." });
    const notJson = await (await POST(saveRequest("not json", undefined, english))).json();
    expect(notJson).toEqual({ ok: false, code: "bad_request", error: 'Envoyez du JSON comme {"url": "https://..."}.' });
    const check = await GET(new Request("http://localhost/api/save", { headers: { authorization: `Bearer ${token}` } }));
    expect(await check.json()).toEqual({ ok: true, message: "Connecté à ReadSooner", app: "ReadSooner" });

    // Without a valid token, only the request's languages count.
    const refused = await POST(saveRequest({ url: ARTICLE_URL }, "Bearer rl_nope", french));
    expect(refused.status).toBe(401);
    expect(await refused.json()).toEqual({ ok: false, code: "unauthorized", error: "Jeton d’accès manquant ou non valide." });
    const refusedEnglish = await (await POST(saveRequest({ url: ARTICLE_URL }, "Bearer rl_nope", english))).json();
    expect(refusedEnglish.error).toBe("Missing or invalid access token. Create one in Settings.");
  });

  it("answers an unexpected failure with a code", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      // Postgres refuses NUL characters in text.
      const response = await POST(saveRequest({ url: ARTICLE_URL, html: "<p>\u0000</p>" }));
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({
        ok: false,
        code: "server_error",
        error: "Something went wrong while saving. Please try again.",
      });
    } finally {
      consoleError.mockRestore();
    }
  });

  it("lets the extension check its token", async () => {
    const check = (authorization: string) =>
      GET(new Request("http://localhost/api/save", { headers: { authorization } }));
    const ok = await check(`Bearer ${token}`);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ ok: true, message: "Connected to ReadSooner", app: "ReadSooner" });
    const refused = await check("Bearer rl_nope");
    expect(refused.status).toBe(401);
    expect(await refused.json()).toMatchObject({ ok: false, code: "unauthorized" });
  });

  it("refuses bodies over the limit, even without a Content-Length", async () => {
    process.env.SAVE_MAX_HTML_BYTES = "1000";
    try {
      const huge = JSON.stringify({ url: ARTICLE_URL, html: "x".repeat(200_000) });
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(huge));
          controller.close();
        },
      });
      const request = new Request("http://localhost/api/save", {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
        body: stream,
        duplex: "half",
      } as RequestInit);
      expect(request.headers.get("content-length")).toBeNull();
      const response = await POST(request);
      expect(response.status).toBe(413);
      expect(await response.json()).toEqual({ ok: false, code: "too_large", error: "The page is too large to save." });
    } finally {
      delete process.env.SAVE_MAX_HTML_BYTES;
    }
  });

  it("answers the CORS preflight", () => {
    const response = OPTIONS();
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-headers")).toContain("Authorization");
  });
});
