import Link from "next/link";
import { archiveAction, favoriteAction } from "@/app/actions";
import type { ArticleListItem } from "@/lib/library";
import { ArticleStatus } from "./article-status";
import { LocalDate } from "./local-date";
import { SubmitButton } from "./submit-button";

function hostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function ArticleCard({ item }: { item: ArticleListItem }) {
  const title = item.title || hostname(item.url);
  return (
    <li className={`card article-card${item.readAt ? "" : " unread"}`}>
      <h2>
        <Link href={`/articles/${item.id}`}>{title}</Link>
      </h2>
      <div className="meta">
        <span>{item.siteName || hostname(item.url)}</span>
        {item.readingMinutes ? <span>{item.readingMinutes} min read</span> : null}
        <span>
          Saved <LocalDate value={item.savedAt} />
        </span>
        {item.previewOnly && <span className="badge warn">Preview only</span>}
        {item.favorite && <span className="badge accent">★ Favorite</span>}
        {item.folderName && <span className="badge">{item.folderName}</span>}
      </div>
      {item.tldr && <p className="tldr">{item.tldr}</p>}
      <ArticleStatus
        id={item.id}
        status={item.status}
        error={item.error}
        summaryStatus={item.summaryStatus}
        summaryError={item.summaryError}
        hasSummary={Boolean(item.tldr)}
      />
      <div className="card-actions">
        <form action={archiveAction} className="inline-form">
          <input type="hidden" name="id" value={item.id} />
          <input type="hidden" name="archived" value={item.archivedAt ? "false" : "true"} />
          <SubmitButton className="button small ghost">{item.archivedAt ? "Move to Inbox" : "Archive"}</SubmitButton>
        </form>
        <form action={favoriteAction} className="inline-form">
          <input type="hidden" name="id" value={item.id} />
          <input type="hidden" name="favorite" value={item.favorite ? "false" : "true"} />
          <SubmitButton className="button small ghost">{item.favorite ? "Unfavorite" : "Favorite"}</SubmitButton>
        </form>
      </div>
    </li>
  );
}
