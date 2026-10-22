import Link from "next/link";
import { useFormatter, useTranslations, type createFormatter, type createTranslator } from "next-intl";
import { resummarizeAction } from "@/app/actions";
import { MODEL_INFO, SUMMARY_MODELS, modelLabel } from "@/config/models";
import type { Summary } from "@/db/schema";
import type { Messages } from "@/i18n/messages";
import { SubmitButton } from "./submit-button";

/** A translator for the Summary namespace, from getTranslations("Summary") or useTranslations("Summary"). */
export type SummaryTranslator = ReturnType<typeof createTranslator<Messages, "Summary">>;
/** A formatter in the app's language, from getFormatter() or useFormatter(). */
export type Formatter = ReturnType<typeof createFormatter>;

/** An estimated cost in US dollars, in the app's language. */
export function formatCost(cost: number | null, t: SummaryTranslator, format: Formatter): string {
  if (cost === null) return t("costUnknown");
  const digits = cost < 0.01 ? 4 : 3;
  return format.number(cost, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatDuration(ms: number | null, t: SummaryTranslator, format: Formatter): string {
  if (ms === null) return "–";
  // One decimal under ten seconds, kept even when it is zero ("2.0 s").
  const digits = ms < 10_000 ? 1 : 0;
  return t("duration", {
    seconds: format.number(ms / 1000, { minimumFractionDigits: digits, maximumFractionDigits: digits }),
  });
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
  const t = useTranslations("Summary");
  const tCommon = useTranslations("Common");
  const format = useFormatter();
  return (
    <section className="card summary" aria-labelledby="summary-heading">
      <h2 id="summary-heading">
        <span>{t("heading")}</span>
        <span>{modelLabel(summary.model)}</span>
      </h2>
      <SummaryBody summary={summary} />
      {summary.partial && (
        <p className="notice warn small">
          {summary.totalChars && summary.inputChars && summary.inputChars < summary.totalChars
            ? t("partialShare", { share: summary.inputChars / summary.totalChars })
            : t("partialSaved")}
        </p>
      )}
      {children}
      <div className="summary-footer">
        <span>
          {formatCost(summary.costUsd, t, format)} · {formatDuration(summary.durationMs, t, format)}
          {summary.servedModel && summary.servedModel !== summary.model
            ? ` · ${t("answeredBy", { model: summary.servedModel })}`
            : ""}
        </span>
        <Link href={`/articles/${articleId}/compare`}>{tCommon("compareModels")}</Link>
        {/* Keyed by the model so the picker shows the new summary's, once it is written. */}
        <form key={summary.model} action={resummarizeAction} className="inline-form">
          <input type="hidden" name="id" value={articleId} />
          <label htmlFor="resummarize-model" className="visually-hidden">
            {t("modelLabel")}
          </label>
          <select id="resummarize-model" name="model" defaultValue={summary.model} style={{ width: "auto", minHeight: 32, padding: "0.2em 0.5em" }}>
            {SUMMARY_MODELS.map((model) => (
              <option key={model} value={model}>
                {MODEL_INFO[model].shortLabel}
              </option>
            ))}
          </select>{" "}
          <SubmitButton className="button small" pendingText={tCommon("queued")}>
            {t("resummarize")}
          </SubmitButton>
        </form>
      </div>
    </section>
  );
}
