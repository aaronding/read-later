import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { deleteFolderAction, revokeTokenAction, updateLocaleAction, updateSettingsAction } from "@/app/actions";
import { AppearancePicker } from "@/components/appearance-picker";
import { ConfirmButton } from "@/components/confirm-button";
import { LocalDate } from "@/components/local-date";
import { OfflineSettings } from "@/components/offline-settings";
import { SignOutButton } from "@/components/sign-in-button";
import { SubmitButton } from "@/components/submit-button";
import { TokenForm } from "@/components/token-form";
import { MODEL_INFO, SUMMARY_MODELS } from "@/config/models";
import { getDb } from "@/db";
import { HTML_LANG, LOCALES, LOCALE_NAMES } from "@/i18n/locales";
import { getAllowance, renewalDate, shareValue } from "@/lib/allowance";
import { isAdmin, requireUser } from "@/lib/auth";
import { listFolders } from "@/lib/folders";
import { getSavedAppearance } from "@/lib/saved-appearance";
import { getSettings } from "@/lib/settings";
import { listApiTokens } from "@/lib/tokens";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Common");
  return { title: t("settings") };
}

export default async function SettingsPage() {
  const user = await requireUser("/settings");
  const db = getDb();
  const [settings, tokens, folders, appearance, allowance] = await Promise.all([
    getSettings(db, user.id),
    listApiTokens(db, user.id),
    listFolders(db, user.id),
    getSavedAppearance(),
    getAllowance(db, user.id),
  ]);
  const [t, tCommon, tAppearance, format] = await Promise.all([
    getTranslations("Settings"),
    getTranslations("Common"),
    getTranslations("Appearance"),
    getFormatter(),
  ]);

  return (
    <div className="settings">
      <div className="page-title">
        <h1>{tCommon("settings")}</h1>
      </div>

      <section className="card" aria-labelledby="language-heading">
        <h2 id="language-heading">{t("languageHeading")}</h2>
        {/* Keyed by the saved choice so the form remounts showing it after a
            save; React resets it to the choice it first showed otherwise. */}
        <form key={settings.locale ?? "auto"} action={updateLocaleAction}>
          <div className="field">
            <label htmlFor="locale">{t("languageLabel")}</label>
            <select id="locale" name="locale" defaultValue={settings.locale ?? "auto"}>
              <option value="auto">{t("languageAutomatic")}</option>
              {LOCALES.map((locale) => (
                <option key={locale} value={locale} lang={HTML_LANG[locale]}>
                  {LOCALE_NAMES[locale]}
                </option>
              ))}
            </select>
            <p className="muted small">{t("languageHelp")}</p>
          </div>
          <SubmitButton className="button primary" pendingText={tCommon("saving")}>
            {tCommon("save")}
          </SubmitButton>
        </form>
      </section>

      <section className="card" aria-labelledby="appearance-heading">
        <h2 id="appearance-heading">{tAppearance("title")}</h2>
        <p className="muted">
          {t.rich("appearanceIntro", {
            system: tAppearance("themes.system"),
            strong: (chunks) => <strong>{chunks}</strong>,
          })}
        </p>
        <AppearancePicker saved={appearance} />
      </section>

      <section className="card" aria-labelledby="summaries-heading">
        <h2 id="summaries-heading">{t("summaries.heading")}</h2>
        {/* The share only: what the answers cost is the owner's to know. */}
        {allowance.limitUsd !== null && (
          <div className="allowance">
            <p>{t("summaries.allowance", { share: shareValue(allowance), date: renewalDate(format, allowance) })}</p>
            <progress max={100} value={Math.min(100, allowance.share * 100)} />
            <p className="muted small">{t("summaries.allowanceModels")}</p>
          </div>
        )}
        {/* Keyed by the saved settings, as the language form is. */}
        <form key={`${settings.defaultModel}:${settings.comparisonMode}`} action={updateSettingsAction}>
          <div className="field">
            <label htmlFor="defaultModel">{t("summaries.defaultModel")}</label>
            <select id="defaultModel" name="defaultModel" defaultValue={settings.defaultModel}>
              {SUMMARY_MODELS.map((model) => (
                <option key={model} value={model}>
                  {MODEL_INFO[model].label}
                </option>
              ))}
            </select>
          </div>
          {isAdmin(user) && (
            <div className="field">
              <label className="checkbox" style={{ fontWeight: 400 }}>
                <input type="checkbox" name="comparisonMode" defaultChecked={settings.comparisonMode} />
                <span>
                  {t.rich("summaries.comparisonMode", {
                    count: SUMMARY_MODELS.length,
                    strong: (chunks) => <strong>{chunks}</strong>,
                  })}
                </span>
              </label>
            </div>
          )}
          <SubmitButton className="button primary" pendingText={tCommon("saving")}>
            {tCommon("save")}
          </SubmitButton>
        </form>
      </section>

      <section className="card" aria-labelledby="tokens-heading">
        <h2 id="tokens-heading">{t("tokens.heading")}</h2>
        <p className="muted">{t("tokens.intro", { apple: "Apple", firefox: "Firefox", chrome: "Chrome" })}</p>
        <TokenForm />
        {tokens.map((token) => (
          <div key={token.id} className="token-row">
            <div>
              <strong>{token.name}</strong>
              <div className="muted small">
                {token.lastUsedAt
                  ? t.rich("tokens.details", {
                      prefix: token.tokenPrefix,
                      code: (chunks) => <code>{chunks}</code>,
                      created: () => <LocalDate value={token.createdAt} />,
                      lastUsed: () => <LocalDate value={token.lastUsedAt!} />,
                    })
                  : t.rich("tokens.detailsNeverUsed", {
                      prefix: token.tokenPrefix,
                      code: (chunks) => <code>{chunks}</code>,
                      created: () => <LocalDate value={token.createdAt} />,
                    })}
              </div>
            </div>
            <form action={revokeTokenAction}>
              <input type="hidden" name="tokenId" value={token.id} />
              <ConfirmButton className="button small danger" message={t("tokens.revokeConfirm", { name: token.name })}>
                {t("tokens.revoke")}
              </ConfirmButton>
            </form>
          </div>
        ))}
      </section>

      <section className="card" aria-labelledby="devices-heading">
        <h2 id="devices-heading">{t("devices.heading")}</h2>
        <p className="muted">{t("devices.intro")}</p>
        <ul>
          <li>
            <Link href="/help/firefox">{t("devices.firefox", { firefox: "Firefox" })}</Link>
          </li>
          <li>
            <Link href="/help/chrome">{t("devices.chrome", { chrome: "Chrome" })}</Link>
          </li>
          <li>
            <Link href="/help/safari">{t("devices.safari", { safari: "Safari", iphone: "iPhone", ipad: "iPad", mac: "Mac" })}</Link>
          </li>
          <li>
            <Link href="/help/android">{t("devices.android", { android: "Android" })}</Link>
          </li>
        </ul>
      </section>

      <section className="card" aria-labelledby="folders-heading">
        <h2 id="folders-heading">{t("folders.heading")}</h2>
        {folders.length === 0 ? (
          <p className="muted">{t("folders.empty")}</p>
        ) : (
          folders.map((folder) => (
            <div key={folder.id} className="token-row">
              <span>
                <strong>{folder.name}</strong>{" "}
                <span className="muted small">{t("folders.articleCount", { count: folder.count })}</span>
              </span>
              <form action={deleteFolderAction}>
                <input type="hidden" name="folderId" value={folder.id} />
                <ConfirmButton className="button small" message={t("folders.deleteConfirm", { name: folder.name })}>
                  {tCommon("delete")}
                </ConfirmButton>
              </form>
            </div>
          ))
        )}
      </section>

      <OfflineSettings />

      <section className="card" aria-labelledby="export-heading">
        <h2 id="export-heading">{t("export.heading")}</h2>
        <p className="muted">{t("export.intro")}</p>
        <div className="card-actions">
          <a className="button" href="/api/export?format=json" download>
            {t("export.download", { format: "JSON" })}
          </a>
          <a className="button" href="/api/export?format=markdown" download>
            {t("export.download", { format: "Markdown" })}
          </a>
        </div>
      </section>

      <section className="card" aria-labelledby="account-heading">
        <h2 id="account-heading">{t("account.heading")}</h2>
        <p>{t.rich("account.signedInAs", { email: user.email, strong: (chunks) => <strong>{chunks}</strong> })}</p>
        <SignOutButton />
      </section>
    </div>
  );
}
