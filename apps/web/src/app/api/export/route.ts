import { getTranslations } from "next-intl/server";
import { getDb } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { exportToMarkdown, loadExport } from "@/lib/export";

export const maxDuration = 60;

/** GET /api/export?format=json or ?format=markdown, for the signed-in user. */
export async function GET(request: Request): Promise<Response> {
  const user = await getCurrentUser();
  const [t, tErrors] = await Promise.all([getTranslations("Export"), getTranslations("Errors")]);
  if (!user) return Response.json({ ok: false, error: t("signInFirst") }, { status: 401 });
  const format = new URL(request.url).searchParams.get("format") === "markdown" ? "markdown" : "json";
  const data = await loadExport(getDb(), user.id);
  const date = data.exportedAt.slice(0, 10);
  const [body, type, extension] =
    format === "markdown"
      ? [exportToMarkdown(data, t, tErrors), "text/markdown; charset=utf-8", "md"]
      : [JSON.stringify(data, null, 2), "application/json; charset=utf-8", "json"];
  return new Response(body, {
    headers: {
      "Content-Type": type,
      "Content-Disposition": `attachment; filename="read-later-export-${date}.${extension}"`,
      "Cache-Control": "no-store",
    },
  });
}
