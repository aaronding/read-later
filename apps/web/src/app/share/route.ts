import { getDb } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { scheduleJobProcessing } from "@/lib/jobs/schedule";
import { saveArticle, saveNotice } from "@/lib/save";
import { shareNeedsConfirmation, sharedUrl } from "@/lib/share";

// The Android share target (see manifest.ts). Saves the shared link, then
// shows the Inbox. Visits sent by other websites get a confirmation page.
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
  const url = sharedUrl(params);
  if (!url) return seeOther("/inbox?shared=nolink");
  if (shareNeedsConfirmation(request.headers)) {
    const query = new URLSearchParams({ url, ...(params.get("title") ? { title: params.get("title")! } : {}) });
    return seeOther(`/share/confirm?${query.toString()}`);
  }

  const result = await saveArticle(getDb(), {
    userId: user.id,
    url,
    title: params.get("title"),
    source: "android",
  });
  if (result.queued) scheduleJobProcessing();
  return seeOther(`/inbox?saved=${saveNotice(result)}`);
}
