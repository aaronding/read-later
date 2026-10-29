import { getDb } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { parseHaveVersions } from "@/lib/offline/copy";
import { loadOfflineCopies } from "@/lib/offline/server";

/**
 * POST /api/offline with `{ have: { <article id>: <version or null> } }`, for
 * the signed-in user: the copies of those articles to keep on the device that
 * are new or changed, and the ids that are gone (decision 153).
 */
export async function POST(request: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return Response.json({ ok: false }, { status: 401 });
  const have = parseHaveVersions(await request.json().catch(() => null));
  if (!have) return Response.json({ ok: false }, { status: 400 });
  const sync = await loadOfflineCopies(getDb(), user.id, have);
  return Response.json(sync, { headers: { "Cache-Control": "no-store" } });
}
