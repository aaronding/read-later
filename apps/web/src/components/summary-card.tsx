import Link from "next/link";
import { useFormatter, useTranslations, type createFormatter, type createTranslator } from "next-intl";
import { resummarizeAction } from "@/app/actions";
import { APP_NAME } from "@/config/app";
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

/** A TL;DR and key points, a summary's or a translation's, marked with their language. */
export function SummaryText({ lang, tldr, keyPoints }: { lang: string | null; tldr: string | null; keyPoints: string[] | null }) {
  return (
    <div className="summary-body" lang={lang ?? undefined}>
      <p className="tldr">{tldr}</p>
      {keyPoints && keyPoints.length > 0 && (
        <ul>
          {keyPoints.map((point, index) => (
            <li key={index}>{point}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function SummaryBody({ summary }: { summary: Summary }) {
  return <SummaryText lang={summary.language} tldr={summary.tldr} keyPoints={summary.keyPoints} />;
}

export function SummaryCard({
  articleId,
  summary,
  translations,
  children,
  admin = false,
}: {
  articleId: string;
  summary: Summary;
  /** The summary's translations, right under its text. */
  translations?: React.ReactNode;
  /** Extra content under the summary, such as suggested tags. */
  children?: React.ReactNode;
  /** Shows the cost, time, Compare and writing it again with another model. */
  admin?: boolean;
}) {
  const t = useTranslations("Summary");
  const tCommon = useTranslations("Common");
  const format = useFormatter();
  return (
    <section className="card summary" aria-labelledby="summary-heading">
      <h2 id="summary-heading">
        <span>{t("heading")}</span>
        <span>{summary.handWritten ? t("writtenBy", { app: APP_NAME }) : modelLabel(summary.model)}</span>
      </h2>
      <SummaryBody summary={summary} />
      {summary.partial && (
        <p className="notice warn small">
          {summary.totalChars && summary.inputChars && summary.inputChars < summary.totalChars
            ? t("partialShare", { share: summary.inputChars / summary.totalChars })
            : t("partialSaved")}
        </p>
      )}
      {translations}
      {children}
      {/* Costs, Compare and writing it again are for admins (ADMIN_EMAILS). */}
      {admin && (
        <div className="summary-footer">
          {/* No model wrote a summary written by hand, so it has no cost or time. */}
          {!summary.handWritten && (
            <span>
              {formatCost(summary.costUsd, t, format)} · {formatDuration(summary.durationMs, t, format)}
              {summary.servedModel && summary.servedModel !== summary.model
                ? ` · ${t("answeredBy", { model: summary.servedModel })}`
                : ""}
            </span>
          )}
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
      )}
    </section>
  );
}
