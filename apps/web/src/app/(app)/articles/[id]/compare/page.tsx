import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { getFormatter, getTranslations } from "next-intl/server";
import { resummarizeAction, showSummaryAction } from "@/app/actions";
import { isBusy } from "@/components/article-status";
import { AutoRefresh } from "@/components/auto-refresh";
import { SubmitButton } from "@/components/submit-button";
import { SummaryBody, formatCost, formatDuration } from "@/components/summary-card";
import { MODEL_INFO, SUMMARY_MODELS, type SummaryModel } from "@/config/models";
import { getDb } from "@/db";
import type { Summary } from "@/db/schema";
import { storedMessageText } from "@/i18n/stored-message";
import { getCurrentUser, isAdmin, requireAdmin } from "@/lib/auth";
import { getArticle } from "@/lib/library";

export async function generateMetadata(): Promise<Metadata> {
  // The title too would tell anyone else the page exists.
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) return {};
  const t = await getTranslations("Compare");
  return { title: t("title") };
}

function RunButton({ articleId, model, label }: { articleId: string; model: SummaryModel; label: string }) {
  const t = useTranslations("Common");
  return (
    <form action={resummarizeAction} className="inline-form">
      <input type="hidden" name="id" value={articleId} />
      <input type="hidden" name="model" value={model} />
      <input type="hidden" name="show" value="false" />
      <SubmitButton className="button small" pendingText={t("queued")}>
        {label}
      </SubmitButton>
    </form>
  );
}

function ModelColumn({ articleId, model, summary, shown }: { articleId: string; model: SummaryModel; summary?: Summary; shown: boolean }) {
  const info = MODEL_INFO[model];
  const t = useTranslations("Compare");
  const tCommon = useTranslations("Common");
  const tStatus = useTranslations("Status");
  const tSummary = useTranslations("Summary");
  const tErrors = useTranslations("Errors");
  const format = useFormatter();
  const tokenCount = (tokens: number | null) => (tokens === null ? "–" : format.number(tokens));
  return (
    <section className="card compare-card" aria-label={info.label}>
      <h2>
        {info.label}
        {shown && <span className="badge accent">{t("shown")}</span>}
      </h2>
      {!summary && (
        <>
          <p className="muted small">{t("notRunYet")}</p>
          <RunButton articleId={articleId} model={model} label={t("summarizeWith", { model: info.shortLabel })} />
        </>
      )}
      {summary && (summary.status === "pending" || summary.status === "running") && (
        <p className="status">
          <span className="spinner" aria-hidden="true" /> {tStatus("summarizing")}
        </p>
      )}
      {summary?.status === "failed" && (
        <>
          <p className="status error">
            {storedMessageText(tErrors, summary.errorMessage, summary.error) ?? tStatus("summaryFailed")}
          </p>
          <RunButton articleId={articleId} model={model} label={tCommon("tryAgain")} />
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
            <dt>{t("stats.cost")}</dt>
            <dd>{formatCost(summary.costUsd, tSummary, format)}</dd>
            <dt>{t("stats.time")}</dt>
            <dd>{formatDuration(summary.durationMs, tSummary, format)}</dd>
            <dt>{t("stats.tokens")}</dt>
            <dd>{t("tokenCounts", { input: tokenCount(summary.inputTokens), output: tokenCount(summary.outputTokens) })}</dd>
            <dt>{t("stats.effort")}</dt>
            <dd>{summary.effort === null ? "–" : t("effortLevel", { effort: summary.effort })}</dd>
            {summary.servedModel && summary.servedModel !== model && (
              <>
                <dt>{t("stats.answeredBy")}</dt>
                <dd>{t("fallbackModel", { model: summary.servedModel })}</dd>
              </>
            )}
            {summary.partial && (
              <>
                <dt>{t("stats.note")}</dt>
                <dd>{t("partial")}</dd>
              </>
            )}
          </dl>
          <div className="card-actions">
            {!shown && (
              <form action={showSummaryAction} className="inline-form">
                <input type="hidden" name="id" value={articleId} />
                <input type="hidden" name="model" value={model} />
                <SubmitButton className="button small">{t("showThisOne")}</SubmitButton>
              </form>
            )}
            <RunButton articleId={articleId} model={model} label={t("runAgain")} />
          </div>
        </>
      )}
    </section>
  );
}

export default async function ComparePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireAdmin(`/articles/${id}/compare`);
  const found = await getArticle(getDb(), user.id, id);
  if (!found) notFound();
  const { article, summaries } = found;
  const byModel = new Map(summaries.map((row) => [row.model, row]));
  const busy = summaries.some((row) => isBusy("ready", row.status));
  const ready = summaries.filter((row) => row.status === "ready");
  const totalCost = ready.reduce((sum, row) => sum + (row.costUsd ?? 0), 0);
  const [t, tSummary, format] = await Promise.all([getTranslations("Compare"), getTranslations("Summary"), getFormatter()]);

  return (
    <>
      <AutoRefresh active={busy} />
      <div className="page-title">
        <h1>{t("title")}</h1>
        <Link href={`/articles/${article.id}`}>{t("backToArticle")}</Link>
      </div>
      <p className="muted">
        {article.title} ·{" "}
        {article.wordCount === null ? t("wordCountUnknown") : t("wordCount", { count: article.wordCount })}
        {ready.length > 1 &&
          ` · ${t("totalCost", { count: ready.length, cost: formatCost(totalCost, tSummary, format) })}`}
      </p>
      {!article.textContent ? (
        <p className="notice">{t("noText")}</p>
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
      <p className="muted small" style={{ marginTop: 16 }}>{t("footnote", { count: SUMMARY_MODELS.length })}</p>
    </>
  );
}
