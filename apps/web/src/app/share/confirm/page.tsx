import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { saveSharedLinkAction } from "@/app/actions";
import { SubmitButton } from "@/components/submit-button";
import { requireUser } from "@/lib/auth";
import { parseHttpUrl } from "@/lib/urls";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Share");
  return { title: t("title") };
}

/** Shown when another website, not your Share menu, opened a share link. */
export default async function ConfirmSharePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const url = parseHttpUrl(typeof params.url === "string" ? params.url : "");
  await requireUser(url ? `/share/confirm?url=${encodeURIComponent(url.href)}` : "/inbox");
  const title = typeof params.title === "string" ? params.title.slice(0, 300) : "";
  const [t, tCommon] = await Promise.all([getTranslations("Share"), getTranslations("Common")]);
  return (
    <main className="centered">
      <div className="card sign-in">
        <h1>{t("title")}</h1>
        {url ? (
          <>
            <p className="muted small">{t("fromAnotherSite")}</p>
            {title && <p>{title}</p>}
            <p className="secret">{url.href}</p>
            <form action={saveSharedLinkAction}>
              <input type="hidden" name="url" value={url.href} />
              <input type="hidden" name="title" value={title} />
              <SubmitButton className="button primary" pendingText={tCommon("saving")}>
                {t("saveIt")}
              </SubmitButton>
            </form>
          </>
        ) : (
          <p className="muted">{t("noLink")}</p>
        )}
        <p>
          <Link href="/inbox">{t("goToInbox")}</Link>
        </p>
      </div>
    </main>
  );
}
