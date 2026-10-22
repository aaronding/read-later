import { createHash, timingSafeEqual } from "node:crypto";
import { processJobs } from "@/lib/jobs/process";

// Called every few minutes by the Cloudflare Worker cron as a safety net for
// jobs that after() did not finish. Protected by JOBS_SECRET.
export const maxDuration = 300;

function sameSecret(given: string, expected: string): boolean {
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.JOBS_SECRET;
  if (!secret) {
    return Response.json({ ok: false, error: "JOBS_SECRET is not set on the server." }, { status: 503 });
  }
  const match = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") ?? "");
  if (!match?.[1] || !sameSecret(match[1], secret)) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const stats = await processJobs();
  return Response.json({ ok: true, ...stats }, { headers: { "Cache-Control": "no-store" } });
}
