import { useTranslations } from "next-intl";
import Link from "next/link";

export default function NotFound() {
  const t = useTranslations("ErrorPages");
  return (
    <main className="centered">
      <div className="card sign-in">
        <h1>{t("notFound.title")}</h1>
        <p className="muted">{t("notFound.text")}</p>
        <Link className="button primary" href="/inbox">
          {t("notFound.goToInbox")}
        </Link>
      </div>
    </main>
  );
}
