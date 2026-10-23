import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Logo } from "@/components/logo";
import { SignInButton } from "@/components/sign-in-button";
import { APP_NAME } from "@/config/app";
import { signUpIsOpen } from "@/config/env";
import { getCurrentUser } from "@/lib/auth";
import { safeRedirectPath } from "@/lib/redirects";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Auth");
  return { title: t("signInTitle") };
}

export default async function SignInPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  // Only paths on this site, so the sign-in page can't redirect elsewhere.
  const next = safeRedirectPath(params.next);
  if (await getCurrentUser()) redirect(next);
  const error = params.error;
  const [t, tCommon] = await Promise.all([getTranslations("Auth"), getTranslations("Common")]);
  return (
    <main className="centered">
      <div className="card sign-in">
        <Logo size={56} />
        <h1>{APP_NAME}</h1>
        <p className="muted">{tCommon("tagline")}</p>
        {error && (
          <p className="notice error small">
            {error !== "NOT_ALLOWED"
              ? t("signInFailed")
              : signUpIsOpen()
                ? t("blocked", { provider: "Google" })
                : t("notAllowed", { provider: "Google", variable: "ALLOWED_EMAILS" })}
          </p>
        )}
        <SignInButton next={next} />
      </div>
    </main>
  );
}
