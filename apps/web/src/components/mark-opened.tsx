"use client";

import { useEffect, useRef } from "react";
import { markOpenedAction } from "@/app/actions";

/**
 * Marks the article read once the reader is actually open in the browser,
 * once per visit: after "Mark unread" the page may still refresh, and that
 * mustn't mark it read again.
 */
export function MarkOpened({ id, alreadyRead }: { id: string; alreadyRead: boolean }) {
  const marked = useRef<string | null>(null);
  useEffect(() => {
    if (alreadyRead || marked.current === id) return;
    marked.current = id;
    void markOpenedAction(id);
  }, [id, alreadyRead]);
  return null;
}
