import { useTranslations } from "next-intl";
import { retryAction } from "@/app/actions";
import type { Article, Summary } from "@/db/schema";
import { storedMessageText, type StoredMessage } from "@/i18n/stored-message";
import { SubmitButton } from "./submit-button";

function RetryButton({ id }: { id: string }) {
  const t = useTranslations("Common");
  return (
    <form action={retryAction} className="inline-form">
      <input type="hidden" name="id" value={id} />
      <SubmitButton className="button small" pendingText={t("retrying")}>
        {t("retry")}
      </SubmitButton>
    </form>
  );
}

/**
 * What a list item or the reader shows while an article is being saved or
 * summarized, or when that failed. Returns null once there is nothing to say.
 */
export function ArticleStatus({
  id,
  status,
  error: errorText,
  errorMessage = null,
  summaryStatus,
  summaryError: summaryErrorText = null,
  summaryErrorMessage = null,
  hasSummary,
  stale = false,
}: {
  id: string;
  status: Article["status"];
  /** Why saving failed, in English, as saved by older versions. */
  error: string | null;
  /** The same, to be translated; preferred when present. */
  errorMessage?: StoredMessage | null;
  summaryStatus: Summary["status"] | null;
  /** Why the summary failed, when it did. */
  summaryError?: string | null;
  summaryErrorMessage?: StoredMessage | null;
  hasSummary: boolean;
  /** The summary has said "Summarizing…" for a long time: offer Retry. */
  stale?: boolean;
}) {
  const t = useTranslations("Status");
  const tCommon = useTranslations("Common");
  const tErrors = useTranslations("Errors");
  const error = storedMessageText(tErrors, errorMessage, errorText);
  const summaryError = storedMessageText(tErrors, summaryErrorMessage, summaryErrorText);
  if (status === "failed") {
    return (
      <div className="status error">
        {error ? t("saveFailedWithError", { error }) : t("saveFailed")} <RetryButton id={id} />
      </div>
    );
  }
  if (status === "pending" || status === "processing") {
    return (
      <div className="status">
        <span className="spinner" aria-hidden="true" />
        {error ? t("retryingSoon", { error }) : tCommon("saving")}
        {error && <RetryButton id={id} />}
      </div>
    );
  }
  if (hasSummary) return null;
  if (summaryStatus === "pending" || summaryStatus === "running") {
    return (
      <div className="status">
        <span className="spinner" aria-hidden="true" /> {t("summarizing")}
        {stale && <RetryButton id={id} />}
      </div>
    );
  }
  if (summaryStatus === "failed") {
    return (
      <div className="status error">
        {summaryError ? t("summaryFailedWithError", { error: summaryError }) : t("summaryFailed")}{" "}
        <RetryButton id={id} />
      </div>
    );
  }
  return null;
}

export function isBusy(status: Article["status"], summaryStatus: Summary["status"] | null): boolean {
  return status === "pending" || status === "processing" || summaryStatus === "pending" || summaryStatus === "running";
}
