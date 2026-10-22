"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

export function CopyButton({ text, label }: { text: string; label?: string }) {
  const t = useTranslations("Settings");
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="button small"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          setCopied(false);
        }
      }}
    >
      {copied ? t("copied") : (label ?? t("copy"))}
    </button>
  );
}
