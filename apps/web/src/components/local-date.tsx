"use client";

import { useLocale } from "next-intl";
import { useEffect, useState } from "react";

const sameYear = (date: Date) => date.getFullYear() === new Date().getFullYear();

/** A date in the app's language and the reader's own time zone (the server doesn't know it). */
export function LocalDate({ value }: { value: Date | string }) {
  const locale = useLocale();
  const iso = typeof value === "string" ? value : value.toISOString();
  const [text, setText] = useState(iso.slice(0, 10));
  useEffect(() => {
    const date = new Date(iso);
    setText(
      date.toLocaleDateString(locale, {
        day: "numeric",
        month: "short",
        ...(sameYear(date) ? {} : { year: "numeric" }),
      }),
    );
  }, [iso, locale]);
  return <time dateTime={iso}>{text}</time>;
}
