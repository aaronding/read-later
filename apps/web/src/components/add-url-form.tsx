"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect, useRef } from "react";
import { saveUrlAction, type SaveUrlState } from "@/app/actions";

export function AddUrlForm() {
  const [state, action, pending] = useActionState<SaveUrlState, FormData>(saveUrlAction, { ok: true, message: "" });
  const input = useRef<HTMLInputElement>(null);
  const t = useTranslations("Library");
  const tCommon = useTranslations("Common");
  useEffect(() => {
    if (state.ok && state.message && input.current) input.current.value = "";
  }, [state]);
  return (
    <form action={action}>
      <div className="add-url">
        <label htmlFor="add-url" className="visually-hidden">
          {t("pasteLinkToSave")}
        </label>
        <input ref={input} id="add-url" name="url" type="text" inputMode="url" autoCapitalize="off" spellCheck={false} placeholder={t("pasteLinkToSave")} required autoComplete="off" />
        <button type="submit" className="button primary" disabled={pending}>
          {pending ? tCommon("saving") : tCommon("save")}
        </button>
      </div>
      <p className={`form-message ${state.ok ? "muted" : "status error"}`} role="status" aria-live="polite">
        {state.message}
      </p>
    </form>
  );
}
