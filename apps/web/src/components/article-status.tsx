import { retryAction } from "@/app/actions";
import type { Article, Summary } from "@/db/schema";
import { SubmitButton } from "./submit-button";

function RetryButton({ id }: { id: string }) {
  return (
    <form action={retryAction} className="inline-form">
      <input type="hidden" name="id" value={id} />
      <SubmitButton className="button small" pendingText="Retrying…">
        Retry
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
  error,
  summaryStatus,
  hasSummary,
}: {
  id: string;
  status: Article["status"];
  error: string | null;
  summaryStatus: Summary["status"] | null;
  hasSummary: boolean;
}) {
  if (status === "failed") {
    return (
      <div className="status error">
        Couldn’t save this page{error ? `: ${error}` : "."} <RetryButton id={id} />
      </div>
    );
  }
  if (status === "pending" || status === "processing") {
    return (
      <div className="status">
        <span className="spinner" aria-hidden="true" />
        {error ? `Trying again soon (${error})` : "Saving…"}
        {error && <RetryButton id={id} />}
      </div>
    );
  }
  if (hasSummary) return null;
  if (summaryStatus === "pending" || summaryStatus === "running") {
    return (
      <div className="status">
        <span className="spinner" aria-hidden="true" /> Summarizing…
      </div>
    );
  }
  if (summaryStatus === "failed") {
    return (
      <div className="status error">
        The summary failed. <RetryButton id={id} />
      </div>
    );
  }
  return null;
}

export function isBusy(status: Article["status"], summaryStatus: Summary["status"] | null): boolean {
  return status === "pending" || status === "processing" || summaryStatus === "pending" || summaryStatus === "running";
}
