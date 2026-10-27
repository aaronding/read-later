import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ConnectExtensionForm } from "@/components/connect-extension-form";
import { APP_NAME } from "@/config/app";
import { requireUser } from "@/lib/auth";
import { connectRedirect, extensionTokenName, parseConnectRequest } from "@/lib/extension-connect";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Connect");
  return { title: t("title") };
}

/** Where the extension's Connect button leads, in the browser's sign-in window (see extension-connect.ts). */
export default async function ConnectExtensionPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const request = parseConnectRequest(params.redirect_uri, params.state);
  const user = await requireUser(
    request ? `/extension/connect?${new URLSearchParams({ redirect_uri: request.redirectUri, state: request.state })}` : "/inbox",
  );
  const [t, name] = await Promise.all([getTranslations("Connect"), extensionTokenName()]);
  return (
    <main className="centered">
      <div className="card sign-in">
        <h1>{t("title")}</h1>
        {request ? (
          <>
            <p>{t.rich("intro", { app: APP_NAME, email: user.email, strong: (chunks) => <strong>{chunks}</strong> })}</p>
            <p className="muted small">{t("token", { name })}</p>
            <p className="muted small">{t("onlyIfYouAsked")}</p>
            <ConnectExtensionForm
              redirectUri={request.redirectUri}
              state={request.state}
              cancelUrl={connectRedirect(request, { error: "access_denied" })}
              labels={{ connect: t("connect"), connecting: t("connecting"), cancel: t("cancel"), failed: t("invalid", { app: APP_NAME }) }}
            />
          </>
        ) : (
          <>
            <p className="muted">{t("invalid", { app: APP_NAME })}</p>
            <p>
              <Link href="/inbox">{t("goToInbox")}</Link>
            </p>
          </>
        )}
      </div>
    </main>
  );
}
