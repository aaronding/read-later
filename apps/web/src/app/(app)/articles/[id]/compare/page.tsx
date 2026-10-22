import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { resummarizeAction, showSummaryAction } from "@/app/actions";
import { isBusy } from "@/components/article-status";
import { AutoRefresh } from "@/components/auto-refresh";
import { SubmitButton } from "@/components/submit-button";
import { SummaryBody, formatCost, formatDuration } from "@/components/summary-card";
import { MODEL_INFO, SUMMARY_MODELS, type SummaryModel } from "@/config/models";
import { getDb } from "@/db";
import type { Summary } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getArticle } from "@/lib/library";

export const metadata: Metadata = { title: "Compare summaries" };

function RunButton({ articleId, model, label }: { articleId: string; model: SummaryModel; label: string }) {
  return (
    <form action={resummarizeAction} className="inline-form">
      <input type="hidden" name="id" value={articleId} />
      <input type="hidden" name="model" value={model} />
      <input type="hidden" name="show" value="false" />
      <SubmitButton className="button small" pendingText="Queued…">
        {label}
      </SubmitButton>
    </form>
  );
}

function ModelColumn({ articleId, model, summary, shown }: { articleId: string; model: SummaryModel; summary?: Summary; shown: boolean }) {
  const info = MODEL_INFO[model];
  return (
    <section className="card compare-card" aria-label={info.label}>
      <h2>
        {info.label}
        {shown && <span className="badge accent">Shown</span>}
      </h2>
      {!summary && (
        <>
          <p className="muted small">Not run yet.</p>
          <RunButton articleId={articleId} model={model} label={`Summarize with ${info.shortLabel}`} />
        </>
      )}
      {summary && (summary.status === "pending" || summary.status === "running") && (
        <p className="status">
          <span className="spinner" aria-hidden="true" /> Summarizing…
        </p>
      )}
      {summary?.status === "failed" && (
        <>
          <p className="status error">{summary.error ?? "The summary failed."}</p>
          <RunButton articleId={articleId} model={model} label="Try again" />
        </>
      )}
      {summary?.status === "ready" && (
        <>
          <SummaryBody summary={summary} />
          {summary.suggestedTags && summary.suggestedTags.length > 0 && (
            <div className="tag-list">
              {summary.suggestedTags.map((tag) => (
                <span key={tag} className="badge">
                  {tag}
                </span>
              ))}
            </div>
          )}
          <dl className="stats">
            <dt>Cost</dt>
            <dd>{formatCost(summary.costUsd)}</dd>
            <dt>Time</dt>
            <dd>{formatDuration(summary.durationMs)}</dd>
            <dt>Tokens</dt>
            <dd>
              {summary.inputTokens?.toLocaleString() ?? "–"} in · {summary.outputTokens?.toLocaleString() ?? "–"} out
            </dd>
            <dt>Effort</dt>
            <dd>{summary.effort ?? "–"}</dd>
            {summary.servedModel && summary.servedModel !== model && (
              <>
                <dt>Answered by</dt>
                <dd>{summary.servedModel} (fallback)</dd>
              </>
            )}
            {summary.partial && (
              <>
                <dt>Note</dt>
                <dd>Covers part of the article</dd>
              </>
            )}
          </dl>
          <div className="card-actions">
            {!shown && (
              <form action={showSummaryAction} className="inline-form">
                <input type="hidden" name="id" value={articleId} />
                <input type="hidden" name="model" value={model} />
                <SubmitButton className="button small">Show this one</SubmitButton>
              </form>
            )}
            <RunButton articleId={articleId} model={model} label="Run again" />
          </div>
        </>
      )}
    </section>
  );
}

export default async function ComparePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/articles/${id}/compare`);
  const found = await getArticle(getDb(), user.id, id);
  if (!found) notFound();
  const { article, summaries } = found;
  const byModel = new Map(summaries.map((row) => [row.model, row]));
  const busy = summaries.some((row) => isBusy("ready", row.status));
  const ready = summaries.filter((row) => row.status === "ready");
  const totalCost = ready.reduce((sum, row) => sum + (row.costUsd ?? 0), 0);

  return (
    <>
      <AutoRefresh active={busy} />
      <div className="page-title">
        <h1>Compare summaries</h1>
        <Link href={`/articles/${article.id}`}>← Back to the article</Link>
      </div>
      <p className="muted">
        {article.title} · {article.wordCount?.toLocaleString() ?? "?"} words
        {ready.length > 1 && ` · ${ready.length} summaries cost ${formatCost(totalCost)} together`}
      </p>
      {!article.textContent ? (
        <p className="notice">There is no article text to summarize yet.</p>
      ) : (
        <div className="compare-grid">
          {SUMMARY_MODELS.map((model) => (
            <ModelColumn
              key={model}
              articleId={article.id}
              model={model}
              summary={byModel.get(model)}
              shown={article.summaryModel === model && byModel.get(model)?.status === "ready"}
            />
          ))}
        </div>
      )}
      <p className="muted small" style={{ marginTop: 16 }}>
        Costs are estimates from token counts and published prices. Turn on comparison mode in Settings to run all three
        models on every save.
      </p>
    </>
  );
}
