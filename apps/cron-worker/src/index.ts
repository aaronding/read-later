export interface Env {
  APP_URL: string;
  JOBS_SECRET: string;
}

/** Calls the web app's protected /api/jobs/run endpoint. */
export async function runJobs(env: Env, fetchImpl: typeof fetch = fetch): Promise<string> {
  if (!env.APP_URL || !env.JOBS_SECRET) throw new Error("Set APP_URL (a var) and JOBS_SECRET (a secret) first.");
  const response = await fetchImpl(`${env.APP_URL.replace(/\/+$/, "")}/api/jobs/run`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.JOBS_SECRET}` },
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`/api/jobs/run answered ${response.status}: ${body.slice(0, 300)}`);
  return body;
}

export default {
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(
      runJobs(env).then(
        (body) => console.log(`jobs/run: ${body}`),
        (error) => console.error(String(error)),
      ),
    );
  },
} satisfies ExportedHandler<Env>;
