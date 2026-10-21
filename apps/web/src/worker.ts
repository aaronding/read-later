// The background worker for a server deployment (Docker Compose). It runs
// processJobs() in a loop. On Vercel this process is not used: jobs run in
// after() and the Cloudflare cron calls /api/jobs/run instead.
//
//   pnpm worker
import "@/config/load-env";
import { envInt } from "@/config/env";
import { processJobs } from "@/lib/jobs/process";

const pollMs = envInt("WORKER_POLL_MS", 5_000);
let stopping = false;

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    console.log(`Received ${signal}; finishing the current batch, then stopping.`);
    stopping = true;
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log(`Worker started; checking for jobs every ${pollMs / 1000}s.`);
  while (!stopping) {
    try {
      const stats = await processJobs({ timeBudgetMs: 60_000 });
      if (stats.claimed > 0) console.log("Processed jobs:", stats);
      if (stats.claimed === 0) await sleep(pollMs);
    } catch (error) {
      console.error("Worker loop error (retrying shortly):", error);
      await sleep(pollMs * 2);
    }
  }
  process.exit(0);
}

void main();
