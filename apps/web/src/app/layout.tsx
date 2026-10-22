import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { APP_NAME } from "@/config/app";
import { appearanceCss, appearanceScript, themeColors } from "@/lib/appearance";
import { getSavedAppearance } from "@/lib/saved-appearance";
import { fontVariables } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: "Save articles to read later, with a clean copy and an AI summary.",
  appleWebApp: { title: APP_NAME, capable: true, statusBarStyle: "default" },
};

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
  const [appearance, requestHeaders] = await Promise.all([getSavedAppearance(), headers()]);
  return (
    // The script below sets the appearance's data-* attributes, before the
    // first paint; React leaves them to it (see appearanceScript).
    <html lang="en" className={fontVariables} suppressHydrationWarning>
      <head>
        <style dangerouslySetInnerHTML={{ __html: APPEARANCE_CSS }} />
        <script
          nonce={requestHeaders.get("x-nonce") ?? undefined}
          dangerouslySetInnerHTML={{ __html: appearanceScript(appearance) }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
