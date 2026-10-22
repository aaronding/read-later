"use client";

import { useTranslations } from "next-intl";

// Shown when a page or an action fails unexpectedly.
export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("ErrorPages");
  const tCommon = useTranslations("Common");
  return (
    <div className="empty">
      <h1>{t("error.title")}</h1>
      <p>{t("error.text")}</p>
      <button type="button" className="button primary" onClick={() => reset()}>
        {tCommon("tryAgain")}
      </button>
    </div>
  );
}
