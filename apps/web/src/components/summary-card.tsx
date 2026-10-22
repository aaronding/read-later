import Link from "next/link";
import { resummarizeAction } from "@/app/actions";
import { MODEL_INFO, SUMMARY_MODELS, modelLabel } from "@/config/models";
import type { Summary } from "@/db/schema";
import { SubmitButton } from "./submit-button";

export function formatCost(cost: number | null): string {
  if (cost === null) return "cost unknown";
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(3)}`;
}

export function formatDuration(ms: number | null): string {
  if (ms === null) return "–";
  return ms < 10_000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms / 1000)} s`;
}

export function SummaryBody({ summary }: { summary: Summary }) {
  return (
    <div className="summary-body" lang={summary.language ?? undefined}>
      <p className="tldr">{summary.tldr}</p>
      {summary.keyPoints && summary.keyPoints.length > 0 && (
        <ul>
          {summary.keyPoints.map((point, index) => (
            <li key={index}>{point}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function SummaryCard({
  articleId,
  summary,
  children,
}: {
  articleId: string;
  summary: Summary;
  /** Extra content under the summary, such as suggested tags. */
  children?: React.ReactNode;
}) {
  return (
    <section className="card summary" aria-labelledby="summary-heading">
      <h2 id="summary-heading">
        <span>Summary</span>
        <span>{modelLabel(summary.model)}</span>
      </h2>
      <SummaryBody summary={summary} />
      {summary.partial && (
        <p className="notice warn small">
          {summary.totalChars && summary.inputChars && summary.inputChars < summary.totalChars
            ? `This summary covers only the first ${Math.round((summary.inputChars / summary.totalChars) * 100)}% of a very long article.`
            : "This summary covers only the part of the article that was saved."}
        </p>
      )}
      {children}
      <div className="summary-footer">
        <span>
          {formatCost(summary.costUsd)} · {formatDuration(summary.durationMs)}
          {summary.servedModel && summary.servedModel !== summary.model ? ` · answered by ${summary.servedModel}` : ""}
        </span>
        <Link href={`/articles/${articleId}/compare`}>Compare models</Link>
        <form action={resummarizeAction} className="inline-form">
          <input type="hidden" name="id" value={articleId} />
          <label htmlFor="resummarize-model" className="visually-hidden">
            Model
          </label>
          <select id="resummarize-model" name="model" defaultValue={summary.model} style={{ width: "auto", minHeight: 32, padding: "0.2em 0.5em" }}>
            {SUMMARY_MODELS.map((model) => (
              <option key={model} value={model}>
                {MODEL_INFO[model].shortLabel}
              </option>
            ))}
          </select>{" "}
          <SubmitButton className="button small" pendingText="Queued…">
            Re-summarize
          </SubmitButton>
        </form>
      </div>
    </section>
  );
}
