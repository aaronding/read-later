import { useTranslations } from "next-intl";
import Link from "next/link";
import { APP_NAME } from "@/config/app";
import { SHORTCUT_SCRIPT } from "@/lib/shortcut";
import { CopyButton } from "./copy-button";

// The markup inside the guides' messages, for t.rich.
const markup = {
  strong: (chunks: React.ReactNode) => <strong>{chunks}</strong>,
  code: (chunks: React.ReactNode) => <code>{chunks}</code>,
  kbd: (chunks: React.ReactNode) => <kbd>{chunks}</kbd>,
  tokens: (chunks: React.ReactNode) => <Link href="/settings#tokens-heading">{chunks}</Link>,
};

// Product names are the same in every language, so the messages take them as values.
const products = {
  app: APP_NAME,
  chrome: "Chrome",
  safari: "Safari",
  iphone: "iPhone",
  ipad: "iPad",
  mac: "Mac",
  icloud: "iCloud",
  ios: "iOS",
};

export function ChromeGuide({ serverUrl }: { serverUrl: string }) {
  const t = useTranslations("Guides.chrome");
  const values = { ...markup, ...products, url: serverUrl };
  return (
    <ol>
      <li>{t.rich("build", values)}</li>
      <li>{t.rich("load", values)}</li>
      <li>{t.rich("connect", values)}</li>
      <li>{t.rich("use", values)}</li>
    </ol>
  );
}

export function ShortcutGuide({ saveUrl }: { saveUrl: string }) {
  const t = useTranslations("Guides.shortcut");
  const tCommon = useTranslations("Common");
  const tApi = useTranslations("Api");
  // The Shortcuts' names, and the save API's reply that the first one shows, each come from one message.
  const pageName = t("page.name", products);
  const linkName = t("link.name", products);
  const values = { ...markup, ...products, url: saveUrl, name: pageName, saved: tApi("saved", products) };
  return (
    <>
      <p>{t("intro", products)}</p>
      <h3>{t("before.heading")}</h3>
      <ul>
        <li>{t.rich("before.scriptsOnIos", values)}</li>
        <li>{t.rich("before.scriptsOnMac", values)}</li>
        <li>{t.rich("before.token", values)}</li>
      </ul>

      <h3>{t("page.heading", { ...products, name: pageName })}</h3>
      <ol>
        <li>{t.rich("page.create", values)}</li>
        <li>{t.rich("page.shareSheet", values)}</li>
        <li>
          {t.rich("page.script", values)}
          <pre className="snippet">{SHORTCUT_SCRIPT}</pre>
          <CopyButton text={SHORTCUT_SCRIPT} label={t("page.copyScript")} />
        </li>
        <li>
          {t.rich("page.request", values)}
          <ul>
            <li>{t.rich("page.method", values)}</li>
            <li>{t.rich("page.headers", values)}</li>
            <li>{t.rich("page.body", values)}</li>
          </ul>
        </li>
        <li>{t.rich("page.message", values)}</li>
        <li>{t.rich("page.notification", values)}</li>
        <li>{t.rich("page.tryIt", values)}</li>
      </ol>

      <h3>{t("link.heading", { name: linkName })}</h3>
      <ol>
        <li>{t.rich("link.create", values)}</li>
        <li>{t.rich("link.input", values)}</li>
        <li>{t.rich("link.request", values)}</li>
        <li>{t.rich("link.notification", values)}</li>
      </ol>
      <p className="muted small">{t("link.note", { ...products, previewOnly: tCommon("previewOnly") })}</p>
    </>
  );
}

export function AndroidGuide() {
  const t = useTranslations("Guides.android");
  const values = { ...markup, ...products };
  return (
    <ol>
      <li>{t("open", products)}</li>
      <li>{t.rich("install", values)}</li>
      <li>{t.rich("share", values)}</li>
    </ol>
  );
}
