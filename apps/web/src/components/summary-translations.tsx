import { useLocale, useTranslations } from "next-intl";
import { removeTranslationAction, translateSummaryAction } from "@/app/actions";
import { modelLabel } from "@/config/models";
import type { Summary, SummaryTranslation } from "@/db/schema";
import { HTML_LANG, isLocale } from "@/i18n/locales";
import { storedMessageText } from "@/i18n/stored-message";
import { MAX_TRANSLATION_RUNS_PER_SUMMARY, MAX_TRANSLATIONS_PER_SUMMARY, translationTargets } from "@/lib/summarize/languages";
import { SubmitButton } from "./submit-button";
import { SummaryText } from "./summary-card";

// Select keys in messages can't contain "-".
const selectKey = (language: string) => language.replace("-", "_");

/** Longer than any translation takes: something went wrong, so offer Retry. */
const STALE_MS = 10 * 60_000;

const LIMIT_VALUES = { claude: "Claude", max: MAX_TRANSLATION_RUNS_PER_SUMMARY };

function Translation({ translation, canRetry }: { translation: SummaryTranslation; canRetry: boolean }) {
  const t = useTranslations("Summary");
  const tCommon = useTranslations("Common");
  const tStatus = useTranslations("Status");
  const tErrors = useTranslations("Errors");
  const headingId = `translation-${translation.id}`;
  const busy = translation.status === "pending" || translation.status === "running";
  const stale = busy && Date.now() - translation.updatedAt.getTime() > STALE_MS;
  const error = storedMessageText(tErrors, translation.errorMessage, translation.error);
  // With no runs left, the reader says why there is no Retry, unless the error already does.
  const retry = canRetry ? (
    <form action={translateSummaryAction} className="inline-form">
      <input type="hidden" name="summaryId" value={translation.summaryId} />
      <input type="hidden" name="language" value={translation.language} />
      <SubmitButton className="button small" pendingText={tCommon("retrying")}>
        {tCommon("retry")}
      </SubmitButton>
    </form>
  ) : (
    translation.errorMessage?.key !== "translation.limitReached" && (
      <span className="muted small">{tErrors("translation.limitReached", LIMIT_VALUES)}</span>
    )
  );
  const remove = (
    <form action={removeTranslationAction} className="inline-form">
      <input type="hidden" name="translationId" value={translation.id} />
      <SubmitButton className="button small ghost">{t("removeTranslation")}</SubmitButton>
    </form>
  );
  return (
    <section className="translation" aria-labelledby={headingId}>
      <h3 id={headingId}>{t("translationHeading", { language: selectKey(translation.language) })}</h3>
      {translation.status === "ready" && (
        <div className="translation-meta">
          <span>{t("translatedBy", { model: modelLabel(translation.servedModel ?? translation.model) })}</span>
          {remove}
        </div>
      )}
      {busy && (
        <div className="status">
          <span className="spinner" aria-hidden="true" />{" "}
          {/* An error while pending means a failed attempt that will be tried again. */}
          {translation.status === "pending" && error ? tStatus("retryingSoon", { error }) : t("translating")}{" "}
          {stale && retry} {remove}
        </div>
      )}
      {translation.status === "failed" && (
        <div className="status error">
          {error ? t("translationFailedWithError", { error }) : t("translationFailed")} {retry} {remove}
        </div>
      )}
      {translation.status === "ready" && (
        <SummaryText
          lang={isLocale(translation.language) ? HTML_LANG[translation.language] : translation.language}
          tldr={translation.tldr}
          keyPoints={translation.keyPoints}
        />
      )}
    </section>
  );
}

/**
 * A summary's translations, and the choice of a language to translate it
 * into, while it can have more and has runs left. The reader's own language
 * comes first.
 */
export function SummaryTranslations({
  summary,
  translations,
  runsLeft,
}: {
  summary: Summary;
  translations: SummaryTranslation[];
  /** How many more times Claude may translate this summary. */
  runsLeft: number;
}) {
  const t = useTranslations("Summary");
  const tCommon = useTranslations("Common");
  const tErrors = useTranslations("Errors");
  const locale = useLocale();
  const taken = new Set(translations.map((translation) => translation.language));
  const targets = translationTargets(summary.language).filter((language) => !taken.has(language));
  const hasRoom = targets.length > 0 && translations.length < MAX_TRANSLATIONS_PER_SUMMARY;
  const canAdd = hasRoom && runsLeft > 0;
  if (!translations.length && !hasRoom) return null;
  const selectId = `translate-${summary.id}`;
  return (
    <div className="summary-translations">
      {translations.map((translation) => (
        <Translation key={translation.id} translation={translation} canRetry={runsLeft > 0} />
      ))}
      {hasRoom && !canAdd && (
        <p className="muted small">{tErrors("translation.limitReached", LIMIT_VALUES)}</p>
      )}
      {canAdd && (
        <form action={translateSummaryAction} className="inline-form translate-form">
          <input type="hidden" name="summaryId" value={summary.id} />
          <label htmlFor={selectId}>{t("translateInto")}</label>{" "}
          <select id={selectId} name="language" defaultValue={targets.find((language) => language === locale) ?? targets[0]}>
            {targets.map((language) => (
              <option key={language} value={language}>
                {t("languageName", { language: selectKey(language) })}
              </option>
            ))}
          </select>{" "}
          <SubmitButton className="button small" pendingText={tCommon("queued")}>
            {t("translate")}
          </SubmitButton>
        </form>
      )}
    </div>
  );
}
