import { getFormatter, getTranslations } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { requireUser } from "@/lib/auth";
import { listFolders } from "@/lib/folders";
import { lastPage, listArticles, type LibraryView } from "@/lib/library";
import { allTags } from "@/lib/tags";
import { AddUrlForm } from "./add-url-form";
import { ArticleCard } from "./article-card";
import { isBusy } from "./article-status";
import { AutoRefresh } from "./auto-refresh";
import { ListHistory } from "./reader-navigation";
import { SearchForm } from "./search-form";

export async function LibraryPage({
  view,
  searchParams,
}: {
  view: LibraryView;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser(`/${view}`);
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.slice(0, 200) : "";
  const page = Math.max(0, Number.parseInt(typeof params.page === "string" ? params.page : "0", 10) || 0);
  const folderId = typeof params.folder === "string" ? params.folder : undefined;
  const tag = typeof params.tag === "string" ? params.tag.slice(0, 60) : undefined;
  const db = getDb();
  const [{ items, hasMore }, folders, tags] = await Promise.all([
    listArticles(db, user.id, { view, query, page, folderId, tag }),
    listFolders(db, user.id),
    allTags(db, user.id),
  ]);
  const folder = folders.find((entry) => entry.id === folderId);
  const keep = { ...(query ? { q: query } : {}), ...(folder ? { folder: folder.id } : {}), ...(tag ? { tag } : {}) };
  const filtered = Boolean(query || folder || tag);
  const address = (at: number) => {
    const search = new URLSearchParams({ ...keep, ...(at > 0 ? { page: String(at) } : {}) }).toString();
    return `/${view}${search ? `?${search}` : ""}`;
  };
  // A later page with nothing left on it, as once its last article is archived
  // or the address is old, opens the last page that still has articles. It
  // counts what the page was asked for, so a folder since deleted counts none.
  if (items.length === 0 && page > 0) {
    const last = await lastPage(db, user.id, { view, query, folderId, tag });
    if (last < page) redirect(address(last));
  }
  // This list's own address, which its articles go back to.
  const from = address(page);
  const busy = items.some((item) => isBusy(item.status, item.summaryStatus));
  const [t, tCommon, format] = await Promise.all([getTranslations("Library"), getTranslations("Common"), getFormatter()]);
  const help = (href: string) => (chunks: React.ReactNode) => <Link href={href}>{chunks}</Link>;
  const empty: Record<LibraryView, React.ReactNode> = {
    // A new account starts here, so it points to the setup guides in Help.
    inbox: t.rich("empty.inbox", {
      firefox: "Firefox",
      safari: "Safari",
      android: "Android",
      firefoxGuide: help("/help/firefox"),
      safariGuide: help("/help/safari"),
      androidGuide: help("/help/android"),
      start: help("/help"),
    }),
    favorites: t("empty.favorites", { favorite: tCommon("favorite") }),
    archive: t("empty.archive"),
  };

  return (
    <>
      <div className="mobile-search">
        <SearchForm query={query} id="search-mobile" />
      </div>
      {params.saved && (
        <p className="notice success" role="status">
          {params.saved === "resaved"
            ? t("notices.resaved")
            : params.saved === "refetching"
              ? t("notices.refetching")
              : t("notices.saved")}
        </p>
      )}
      {params.shared === "nolink" && <p className="notice error">{t("notices.sharedNoLink")}</p>}
      {view === "inbox" && !filtered && <AddUrlForm />}
      <div className="page-title">
        <h1>{query ? t("searchView", { view }) : tCommon(view)}</h1>
        {filtered && (
          <span className="muted small">
            {t.rich("filterSummary", {
              // Which filters are on, as the message's select expects: q, f, t or a combination.
              filters: `${query ? "q" : ""}${folder ? "f" : ""}${tag ? "t" : ""}`,
              query,
              folder: folder?.name ?? "",
              tag: tag ?? "",
              clear: (chunks) => <Link href={`/${view}`}>{chunks}</Link>,
            })}
          </span>
        )}
      </div>
      {(folders.length > 0 || tags.length > 0) && (
        <nav className="filters" aria-label={t("filtersLabel")}>
          {folders.map((entry) => (
            <Link key={entry.id} className={`chip${entry.id === folder?.id ? " active" : ""}`} href={{ pathname: `/${view}`, query: { folder: entry.id } }}>
              {entry.name} <span className="muted">{format.number(entry.count)}</span>
            </Link>
          ))}
          {tags
            .filter((entry) => entry.count > 0)
            .map((entry) => (
              <Link key={entry.id} className={`chip${entry.name.toLowerCase() === tag?.toLowerCase() ? " active" : ""}`} href={{ pathname: `/${view}`, query: { tag: entry.name } }}>
                #{entry.name}
              </Link>
            ))}
        </nav>
      )}
      {items.length === 0 ? (
        <p className="empty">{filtered ? t("empty.noMatch") : empty[view]}</p>
      ) : (
        <ul className="article-list">
          {items.map((item) => (
            <ArticleCard key={item.id} item={item} from={from} />
          ))}
        </ul>
      )}
      {(hasMore || page > 0) && (
        <nav className="pager" aria-label={t("pager.label")}>
          {page > 0 && (
            <Link className="button" href={{ pathname: `/${view}`, query: { ...keep, page: page - 1 } }}>
              {t("pager.newer")}
            </Link>
          )}
          {hasMore && (
            <Link className="button" href={{ pathname: `/${view}`, query: { ...keep, page: page + 1 } }}>
              {t("pager.older")}
            </Link>
          )}
        </nav>
      )}
      <AutoRefresh active={busy} />
      <ListHistory />
    </>
  );
}
