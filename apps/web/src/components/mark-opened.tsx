"use client";

import { useEffect } from "react";
import { markOpenedAction } from "@/app/actions";

/** Marks the article read once the reader is actually open in the browser. */
export function MarkOpened({ id, alreadyRead }: { id: string; alreadyRead: boolean }) {
  useEffect(() => {
    if (!alreadyRead) void markOpenedAction(id);
  }, [id, alreadyRead]);
  return null;
}
