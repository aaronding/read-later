import { createFormatter, createTranslator } from "next-intl";
import { z } from "zod";
import { APP_NAME } from "@/config/app";
import { getDb, type Db } from "@/db";
import { preferredLocale, type AppLocale } from "@/i18n/locales";
import { loadMessages } from "@/i18n/messages";
import { getAllowance, renewalDate, sharePercent, shareValue } from "@/lib/allowance";
import { translateError } from "@/lib/error-message";
import { scheduleJobProcessing } from "@/lib/jobs/schedule";
import { SaveError, maxHtmlBytes, saveArticle, saveNotice, type SaveErrorCode } from "@/lib/save";
import { getSettings } from "@/lib/settings";
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

/** Every error reply has a `code` for programs; `error` is for people. */
type ErrorCode = "unauthorized" | "bad_request" | SaveErrorCode;

function replyError(status: number, code: ErrorCode, error: string): Response {
  return reply(status, { ok: false, error, code });
}

// The extension and the Shortcut show the replies' texts as they are. They
// are in the token owner's language, else the one the request asks for.
async function replyLocale(db: Db, request: Request, userId: string | null): Promise<AppLocale> {
  const saved = userId ? (await getSettings(db, userId)).locale : null;
  return preferredLocale(saved, request.headers.get("accept-language"));
}

async function translators(locale: AppLocale) {
  const messages = await loadMessages(locale);
  return {
    t: createTranslator({ locale, messages, namespace: "Api" }),
    format: createFormatter({ locale }),
    tErrors: createTranslator({ locale, messages, namespace: "Errors" }),
  };
}

const SaveBody = z.object({
  url: z.string().min(1).max(8192),
  html: z.string().nullish(),
  title: z.string().max(5000).nullish(),
  source: z.enum(["extension", "shortcut", "android", "web", "api"]).optional(),
});

/** Reads the body, refusing to buffer more than `maxBytes` whatever the headers say. */
async function readLimitedText(request: Request, maxBytes: number): Promise<string | null> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

/** Lets the extension's options page check the server URL and token. */
export async function GET(request: Request): Promise<Response> {
  const db = getDb();
  const userId = await authenticateBearer(db, request.headers.get("authorization"));
  const { t } = await translators(await replyLocale(db, request, userId));
  if (!userId) return replyError(401, "unauthorized", t("unauthorized"));
  return reply(200, { ok: true, message: t("connected", { app: APP_NAME }), app: APP_NAME });
}

// The reply's message for each way a save went.
const SAVED_MESSAGE = { created: "saved", replaced: "saved", resaved: "alreadySaved", refetching: "alreadySavedRefetching" } as const;

export async function POST(request: Request): Promise<Response> {
  const db = getDb();
  const userId = await authenticateBearer(db, request.headers.get("authorization"));
  const { t, tErrors, format } = await translators(await replyLocale(db, request, userId));
  if (!userId) return replyError(401, "unauthorized", t("unauthorized"));

  // JSON escaping can make the body somewhat larger than the HTML itself.
  const maxBodyBytes = Math.ceil(maxHtmlBytes() * 1.5) + 64 * 1024;
  const declared = Number(request.headers.get("content-length"));
  const text = Number.isFinite(declared) && declared > maxBodyBytes ? null : await readLimitedText(request, maxBodyBytes);
  if (text === null) return replyError(413, "too_large", tErrors("pageTooLarge"));

  let body: z.infer<typeof SaveBody>;
  try {
    // Parsed whatever the Content-Type says; Shortcuts sometimes send text/plain.
    body = SaveBody.parse(JSON.parse(text));
  } catch {
    const example = '{"url": "https://..."}';
    return replyError(400, "bad_request", t("badRequest", { example, html: '"html"', title: '"title"' }));
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
    // Close to or at the month's AI allowance: the extension and Shortcuts say so after "Saved".
    const allowance = await getAllowance(db, userId);
    const date = renewalDate(format, allowance);
    const note = allowance.reached
      ? result.queued && t("allowanceReached", { date })
      : allowance.nearing && t("allowanceNearing", { share: shareValue(allowance) });
    const saved = t(SAVED_MESSAGE[saveNotice(result)], { app: APP_NAME });
    return reply(result.outcome === "created" ? 201 : 200, {
      ok: true,
      status: "saved",
      message: note ? t("savedWithAllowance", { saved, note }) : saved,
      id: result.articleId,
      outcome: result.outcome,
      // True when the article will be downloaded again.
      queued: result.queued,
      // The share of the month's AI allowance used, never what it cost; absent with no limit.
      ...(allowance.limitUsd === null
        ? {}
        : { aiAllowance: { usedPercent: sharePercent(allowance), renewsOn: allowance.renewsAt.toISOString().slice(0, 10) } }),
    });
  } catch (error) {
    if (error instanceof SaveError) {
      return replyError(error.status, error.code, translateError(tErrors, error.storedMessage));
    }
    console.error("Save failed:", error);
    return replyError(500, "server_error", t("serverError"));
  }
}
