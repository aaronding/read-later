import { after } from "next/server";
import { envBool } from "@/config/env";
import { processJobs } from "./process";

/**
 * Starts processing right after the response is sent, using Next.js after().
 * If after() is unavailable, processing starts in the background instead. The
 * cron safety net (/api/jobs/run) or the worker process picks up anything left.
 * Set RUN_JOBS_AFTER_RESPONSE=false when a worker process handles all jobs.
 */
export function scheduleJobProcessing(): void {
  if (!envBool("RUN_JOBS_AFTER_RESPONSE", true)) return;
  const run = () =>
    processJobs().then(
      () => undefined,
      (error) => console.error("Background job processing failed:", error),
    );
  try {
    after(run);
  } catch {
    void run();
  }
}
