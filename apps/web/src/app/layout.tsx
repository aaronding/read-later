import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { APP_NAME } from "@/config/app";
import { appUrl } from "@/config/env";
import { HTML_LANG } from "@/i18n/locales";
import { CLIENT_NAMESPACES, pickNamespaces } from "@/i18n/messages";
import { appearanceCss, appearanceScript, themeColors } from "@/lib/appearance";
import { getSavedAppearance } from "@/lib/saved-appearance";
import { fontVariables } from "./fonts";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Common");
  return {
    // Canonical addresses and the share image are on APP_URL.
    metadataBase: new URL(appUrl()),
    title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
    description: t("tagline"),
    // A link to the site shared in a chat or a post shows opengraph-image.png,
    // large, under the page's title and description (Next.js fills those in).
    openGraph: { type: "website", siteName: APP_NAME },
    twitter: { card: "summary_large_image" },
    appleWebApp: { title: APP_NAME, capable: true, statusBarStyle: "default" },
  };
}

export async function generateViewport(): Promise<Viewport> {
  const colors = themeColors(await getSavedAppearance());
  return {
    width: "device-width",
    initialScale: 1,
    themeColor: [
      { media: "(prefers-color-scheme: light)", color: colors.light },
      { media: "(prefers-color-scheme: dark)", color: colors.dark },
    ],
  };
}

const APPEARANCE_CSS = appearanceCss();

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [appearance, requestHeaders, locale, messages] = await Promise.all([
    getSavedAppearance(),
    headers(),
    getLocale(),
    getMessages(),
  ]);
  return (
    // The script below sets the appearance's data-* attributes, before the
    // first paint; React leaves them to it (see appearanceScript).
    <html lang={HTML_LANG[locale]} className={fontVariables} suppressHydrationWarning>
      <head>
        <style dangerouslySetInnerHTML={{ __html: APPEARANCE_CSS }} />
        <script
          nonce={requestHeaders.get("x-nonce") ?? undefined}
          dangerouslySetInnerHTML={{ __html: appearanceScript(appearance) }}
        />
      </head>
      <body>
        <NextIntlClientProvider messages={pickNamespaces(messages, CLIENT_NAMESPACES)}>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
