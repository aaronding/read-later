import { useTranslations } from "next-intl";
import Link from "next/link";
import { archiveAction, favoriteAction } from "@/app/actions";
import type { ArticleListItem } from "@/lib/library";
import { articleHref } from "@/lib/reader-origin";
import { ArticleStatus } from "./article-status";
import { KeptBadge } from "./keep-offline";
import { LocalDate } from "./local-date";
import { SubmitButton } from "./submit-button";

function hostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** An article in a list. `from` is the list's address, which the reader goes back to. */
export function ArticleCard({ item, from }: { item: ArticleListItem; from: string }) {
  const t = useTranslations("Common");
  const title = item.title || hostname(item.url);
  return (
    <li className={`card article-card${item.readAt ? "" : " unread"}`}>
      <h2>
        <Link href={articleHref(item.id, from)}>{title}</Link>
      </h2>
      <div className="meta">
        <span>{item.siteName || hostname(item.url)}</span>
        {item.readingMinutes ? <span>{t("minRead", { minutes: item.readingMinutes })}</span> : null}
        <span>{t.rich("savedOn", { date: () => <LocalDate value={item.savedAt} /> })}</span>
        {item.previewOnly && <span className="badge warn">{t("previewOnly")}</span>}
        {item.favorite && <span className="badge accent">{t("favoriteBadge")}</span>}
        {item.folderName && <span className="badge">{item.folderName}</span>}
        <KeptBadge articleId={item.id} />
      </div>
      {item.tldr && <p className="tldr">{item.tldr}</p>}
      <ArticleStatus
        id={item.id}
        status={item.status}
        error={item.error}
        errorMessage={item.errorMessage}
        summaryStatus={item.summaryStatus}
        summaryError={item.summaryError}
        summaryErrorMessage={item.summaryErrorMessage}
        hasSummary={Boolean(item.tldr)}
      />
      <div className="card-actions">
        <form action={archiveAction} className="inline-form">
          <input type="hidden" name="id" value={item.id} />
          <input type="hidden" name="archived" value={item.archivedAt ? "false" : "true"} />
          <SubmitButton className="button small ghost">{item.archivedAt ? t("moveToInbox") : t("archiveAction")}</SubmitButton>
        </form>
        <form action={favoriteAction} className="inline-form">
          <input type="hidden" name="id" value={item.id} />
          <input type="hidden" name="favorite" value={item.favorite ? "false" : "true"} />
          <SubmitButton className="button small ghost">{item.favorite ? t("unfavorite") : t("favorite")}</SubmitButton>
        </form>
      </div>
    </li>
  );
}
