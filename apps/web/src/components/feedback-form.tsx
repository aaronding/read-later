"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { sendFeedbackAction, type FeedbackState } from "@/app/actions";
import { MAX_FEEDBACK_LENGTH } from "@/lib/feedback-limits";

export function FeedbackForm() {
  const t = useTranslations("About.feedback");
  const [state, action, pending] = useActionState<FeedbackState, FormData>(sendFeedbackAction, {});
  return (
    <form action={action} className="feedback-form">
      <label htmlFor="feedback-message" className="visually-hidden">
        {t("label")}
      </label>
      <textarea
        id="feedback-message"
        name="message"
        rows={5}
        maxLength={MAX_FEEDBACK_LENGTH}
        required
        defaultValue={state.message}
        placeholder={t("placeholder")}
      />
      <div>
        <button type="submit" className="button primary" disabled={pending}>
          {pending ? t("sending") : t("send")}
        </button>
      </div>
      {state.error && <p className="status error" role="alert">{state.error}</p>}
      {state.sent && <p className="notice success" role="status">{t("sent")}</p>}
    </form>
  );
}
