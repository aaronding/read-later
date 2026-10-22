"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { createTokenAction, type CreateTokenState } from "@/app/actions";
import { CopyButton } from "./copy-button";

export function TokenForm() {
  const t = useTranslations("Settings");
  const [state, action, pending] = useActionState<CreateTokenState, FormData>(createTokenAction, {});
  return (
    <div>
      <form action={action} className="add-url">
        <label htmlFor="token-name" className="visually-hidden">
          {t("tokens.nameLabel")}
        </label>
        <input
          id="token-name"
          name="name"
          type="text"
          placeholder={t("tokens.namePlaceholder", { chrome: "Chrome" })}
          maxLength={100}
        />
        <button type="submit" className="button primary" disabled={pending}>
          {pending ? t("tokens.creating") : t("tokens.create")}
        </button>
      </form>
      {state.error && <p className="status error">{state.error}</p>}
      {state.token && (
        <div className="notice success">
          <p>{t.rich("tokens.newToken", { name: state.name ?? "", strong: (chunks) => <strong>{chunks}</strong> })}</p>
          <div className="secret">{state.token}</div>
          <p style={{ marginBottom: 0 }}>
            <CopyButton text={state.token} label={t("tokens.copyToken")} />
          </p>
        </div>
      )}
    </div>
  );
}
