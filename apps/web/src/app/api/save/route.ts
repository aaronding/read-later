import { z } from "zod";
import { APP_NAME } from "@/config/app";
import { getDb } from "@/db";
import { scheduleJobProcessing } from "@/lib/jobs/schedule";
import { SaveError, maxHtmlBytes, saveArticle } from "@/lib/save";
import { authenticateBearer } from "@/lib/tokens";

// Lets after() keep processing for up to 300 seconds once "Saved" is sent.
export const maxDuration = 300;

// The extension and the Shortcut authenticate with a bearer token, not
// cookies, so any origin may call this endpoint.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
};

function reply(status: number, body: Record<string, unknown>): Response {
  return Response.json(body, { status, headers: { ...CORS_HEADERS, "Cache-Control": "no-store" } });
}

const SaveBody = z.object({
  url: z.string().min(1).max(8192),
  html: z.string().nullish(),
  title: z.string().max(5000).nullish(),
  source: z.enum(["extension", "shortcut", "android", "web", "api"]).optional(),
});

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

/** Lets the extension's options page check the server URL and token. */
export async function GET(request: Request): Promise<Response> {
  const userId = await authenticateBearer(getDb(), request.headers.get("authorization"));
  if (!userId) {
    return reply(401, { ok: false, error: "Missing or invalid access token. Create one in Settings." });
  }
  return reply(200, { ok: true, message: `Connected to ${APP_NAME}`, app: APP_NAME });
}

export async function POST(request: Request): Promise<Response> {
  const db = getDb();
  const userId = await authenticateBearer(db, request.headers.get("authorization"));
  if (!userId) {
    return reply(401, { ok: false, error: "Missing or invalid access token. Create one in Settings." });
  }

  const declared = Number(request.headers.get("content-length"));
  // JSON escaping can make the body somewhat larger than the HTML itself.
  if (Number.isFinite(declared) && declared > maxHtmlBytes() * 1.5 + 64 * 1024) {
    return reply(413, { ok: false, error: "The page is too large to save." });
  }

  let body: z.infer<typeof SaveBody>;
  try {
    // Parsed whatever the Content-Type says; Shortcuts sometimes send text/plain.
    body = SaveBody.parse(JSON.parse(await request.text()));
  } catch {
    return reply(400, { ok: false, error: 'Send JSON like {"url": "https://..."}, optionally with "html" and "title".' });
  }

  try {
    const result = await saveArticle(db, {
      userId,
      url: body.url,
      html: body.html,
      title: body.title,
      source: body.source ?? "api",
    });
    if (result.queued) scheduleJobProcessing();
    return reply(result.outcome === "created" ? 201 : 200, {
      ok: true,
      status: "saved",
      message: result.outcome === "resaved" ? `Already in ${APP_NAME}, moved to the top` : `Saved to ${APP_NAME}`,
      id: result.articleId,
      outcome: result.outcome,
    });
  } catch (error) {
    if (error instanceof SaveError) return reply(error.status, { ok: false, error: error.message });
    console.error("Save failed:", error);
    return reply(500, { ok: false, error: "Something went wrong while saving. Please try again." });
  }
}
