"use client";

import { useEffect, useState } from "react";

const sameYear = (date: Date) => date.getFullYear() === new Date().getFullYear();

/** A date in the reader's own time zone and locale (the server doesn't know them). */
export function LocalDate({ value }: { value: Date | string }) {
  const iso = typeof value === "string" ? value : value.toISOString();
  const [text, setText] = useState(iso.slice(0, 10));
  useEffect(() => {
    const date = new Date(iso);
    setText(
      date.toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        ...(sameYear(date) ? {} : { year: "numeric" }),
      }),
    );
  }, [iso]);
  return <time dateTime={iso}>{text}</time>;
}
