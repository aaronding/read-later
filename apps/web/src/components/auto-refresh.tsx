"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Refreshes the page every few seconds while something is still being saved
 * or summarized. Gives up after a while so a stuck job doesn't poll forever.
 */
export function AutoRefresh({ active, intervalMs = 3000, maxMs = 5 * 60_000 }: { active: boolean; intervalMs?: number; maxMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const started = Date.now();
    const timer = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - started > maxMs) return clearInterval(timer);
      router.refresh();
    }, intervalMs);
    return () => clearInterval(timer);
  }, [active, intervalMs, maxMs, router]);
  return null;
}
