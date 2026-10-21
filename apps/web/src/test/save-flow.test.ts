// Integration test: POST /api/save -> job queue -> extraction -> summary,
// with the Claude API mocked and PGlite standing in for Postgres.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { and, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, OPTIONS, POST } from "@/app/api/save/route";
import type { Db } from "@/db";
import { articles, jobs, summaries } from "@/db/schema";
import { processJobs } from "@/lib/jobs/process";
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

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => readFileSync(path.join(here, "../lib/extract/fixtures", name), "utf-8");
const ARTICLE_URL = "https://www.riversideledger.example/features/community-orchards";

// ---------------------------------------------------------------------------
// A fake Anthropic client that records each request.
// ---------------------------------------------------------------------------

type StreamParams = Parameters<Anthropic["beta"]["messages"]["stream"]>[0];
type Reply = (params: StreamParams) => Partial<Anthropic.Beta.BetaMessage> | Error;

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
      stream(params: StreamParams) {
        requests.push(params);
        const result = reply(params);
        return {
          async finalMessage() {
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

function saveRequest(body: unknown, authorization = `Bearer ${token}`): Request {
  return new Request("http://localhost/api/save", {
    method: "POST",
    headers: { authorization, "content-type": "application/json" },
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
    expect(body).toMatchObject({ ok: true, status: "saved", message: "Saved to Read Later", outcome: "created" });
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(elapsed).toBeLessThan(1000);

    const pending = await articleById(body.id);
    expect(pending.status).toBe("pending");
    expect(pending.url).toBe(`${ARTICLE_URL}?utm_source=x`); // exactly as saved
    expect(pending.saveSource).toBe("extension");
    expect(pending.summaryModel).toBe("claude-opus-5-5");
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
      model: "claude-opus-5-5",
      servedModel: "claude-opus-5-5",
      status: "ready",
      language: "en",
      tldr: "Community orchards are returning to public land (claude-opus-5-5).",
      inputTokens: 2_000,
      outputTokens: 400,
      partial: false,
      effort: "low",
    });
    expect(summary!.keyPoints).toHaveLength(5);
    expect(summary!.suggestedTags).toEqual(["Gardening", "community", "local government"]);
    expect(summary!.costUsd).toBeCloseTo((2_000 * 4 + 400 * 20) / 1e6, 6);
    expect(summary!.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("sends the request shape from the claude-api guidance", async () => {
    const response = await POST(saveRequest({ url: ARTICLE_URL, html: fixture("news-article.html") }));
    await processJobs({ db });
    expect(response.status).toBe(201);
    const [params] = requests;
    expect(params).toMatchObject({
      model: "claude-opus-5-5",
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
  });

  it("runs all three models in comparison mode, without fallbacks on Haiku", async () => {
    await updateSettings(db, "user-1", { defaultModel: "claude-sonnet-5-5", comparisonMode: true });
    const response = await POST(saveRequest({ url: ARTICLE_URL, html: fixture("news-article.html") }));
    const { id } = await response.json();
    const stats = await processJobs({ db });
    expect(stats.succeeded).toBe(4);

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
    expect(body.message).toBe("Saved to Read Later");
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
    expect(preview).toMatchObject({ status: "ready", previewOnly: true, contentSource: "server" });
    expect(preview.previewReason).toMatch(/login/);
    expect(requests).toHaveLength(0); // too little text to summarize

    // The owner saves the full page from their signed-in browser.
    const replaced = await (await POST(saveRequest({ url: ARTICLE_URL, html: fixture("news-article.html") }))).json();
    expect(replaced).toMatchObject({ id, outcome: "replaced" });
    await processJobs({ db });
    const full = await articleById(id);
    expect(full).toMatchObject({ previewOnly: false, previewReason: null, contentSource: "client" });
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

describe("failures", () => {
  it("records a refusal without retrying", async () => {
    reply = () => ({ content: [], stop_reason: "refusal", stop_details: { type: "refusal", category: "cyber", explanation: null } as never });
    const { id } = await (await POST(saveRequest({ url: ARTICLE_URL, html: fixture("news-article.html") }))).json();
    const stats = await processJobs({ db });
    expect(stats).toMatchObject({ succeeded: 1, failed: 1, retrying: 0 });
    const [summary] = await summariesFor(id);
    expect(summary).toMatchObject({ status: "failed", stopReason: "refusal" });
    expect(summary!.error).toMatch(/declined.*cyber/);
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
    expect(await articleById(id)).toMatchObject({ status: "failed", error: "The page was not found (HTTP 404)." });

    const again = await (await POST(saveRequest({ url: ARTICLE_URL, html: fixture("news-article.html") }))).json();
    expect(again).toMatchObject({ id, outcome: "replaced" });
    await processJobs({ db });
    expect(await articleById(id)).toMatchObject({ status: "ready", error: null });
  });
});

describe("authentication and input", () => {
  it("rejects missing, unknown and revoked tokens", async () => {
    expect((await POST(saveRequest({ url: ARTICLE_URL }, ""))).status).toBe(401);
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

  it("rejects bad bodies and non-http URLs", async () => {
    expect((await POST(saveRequest("not json"))).status).toBe(400);
    expect((await POST(saveRequest({ html: "<p>no url</p>" }))).status).toBe(400);
    const ftp = await POST(saveRequest({ url: "ftp://example.com/file" }));
    expect(ftp.status).toBe(400);
    expect((await ftp.json()).error).toMatch(/http or https/);
  });

  it("lets the extension check its token", async () => {
    const check = (authorization: string) =>
      GET(new Request("http://localhost/api/save", { headers: { authorization } }));
    expect((await check(`Bearer ${token}`)).status).toBe(200);
    expect((await check("Bearer rl_nope")).status).toBe(401);
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
      expect((await POST(request)).status).toBe(413);
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
