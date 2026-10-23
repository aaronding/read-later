import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { saveWelcomeAction } from "@/app/actions";
import { SubmitButton } from "@/components/submit-button";
import { getDb } from "@/db";
import { isLocale } from "@/i18n/locales";
import { requireUser } from "@/lib/auth";
import { WELCOME_PATH, findWelcomeArticle, welcomeGuide } from "@/lib/welcome/welcome";

// The welcome article's own address. While the user has the article, it
// opens it; once it is deleted, it shows the guide with a Save button, and
// saving this address in any other way adds it back too.

async function guide() {
  const locale = await getLocale();
  return welcomeGuide(isLocale(locale) ? locale : "en");
}

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await guide()).title };
}

export default async function WelcomePage() {
  const user = await requireUser(WELCOME_PATH);
  const saved = await findWelcomeArticle(getDb(), user.id);
  if (saved) redirect(`/articles/${saved}`);
  const [content, locale, tCommon] = await Promise.all([guide(), getLocale(), getTranslations("Common")]);
  return (
    <article className="reader">
      <header className="reader-header">
        <h1>{content.title}</h1>
        <form action={saveWelcomeAction} style={{ marginBottom: "1.5rem" }}>
          <SubmitButton className="button" pendingText={tCommon("saving")}>
            {tCommon("save")}
          </SubmitButton>
        </form>
      </header>
      <div
        className="prose"
        lang={locale}
        // Sanitized like any saved article.
        dangerouslySetInnerHTML={{ __html: content.html }}
      />
    </article>
  );
}
