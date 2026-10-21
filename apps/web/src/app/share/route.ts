import { getDb } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { scheduleJobProcessing } from "@/lib/jobs/schedule";
import { saveArticle } from "@/lib/save";
import { extractFirstUrl, parseHttpUrl } from "@/lib/urls";

// The Android share target (see manifest.ts). Saves the shared link, then
// shows the Inbox.
export const maxDuration = 300;

function seeOther(location: string): Response {
  return new Response(null, { status: 303, headers: { Location: location, "Cache-Control": "no-store" } });
}

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const user = await getCurrentUser();
  if (!user) {
    return seeOther(`/sign-in?next=${encodeURIComponent(`/share?${params.toString()}`)}`);
  }
  const url =
    parseHttpUrl(params.get("url") ?? "")?.href ?? extractFirstUrl(params.get("text")) ?? extractFirstUrl(params.get("title"));
  if (!url) return seeOther("/inbox?shared=nolink");

  const result = await saveArticle(getDb(), {
    userId: user.id,
    url,
    title: params.get("title"),
    source: "android",
  });
  if (result.queued) scheduleJobProcessing();
  return seeOther(`/inbox?saved=${result.outcome}`);
}
