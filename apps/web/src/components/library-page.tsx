import Link from "next/link";
import { getDb } from "@/db";
import { requireUser } from "@/lib/auth";
import { listFolders } from "@/lib/folders";
import { listArticles, type LibraryView } from "@/lib/library";
import { allTags } from "@/lib/tags";
import { AddUrlForm } from "./add-url-form";
import { ArticleCard } from "./article-card";
import { isBusy } from "./article-status";
import { AutoRefresh } from "./auto-refresh";
import { SearchForm } from "./search-form";

const TITLES: Record<LibraryView, string> = { inbox: "Inbox", favorites: "Favorites", archive: "Archive" };
const EMPTY: Record<LibraryView, string> = {
  inbox: "Nothing saved yet. Paste a link above, or save from the Chrome extension or the Safari Shortcut.",
  favorites: "No favorites yet. Tap Favorite on an article to keep it here.",
  archive: "Nothing archived yet.",
};

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
  const busy = items.some((item) => isBusy(item.status, item.summaryStatus)) || Boolean(params.saved);

  return (
    <>
      <div className="mobile-search">
        <SearchForm query={query} id="search-mobile" />
      </div>
      {params.saved && (
        <p className="notice success" role="status">
          {params.saved === "resaved" ? "Already saved; moved to the top." : "Saved. The summary will appear in a moment."}
        </p>
      )}
      {params.shared === "nolink" && <p className="notice error">No link was found in what you shared.</p>}
      {view === "inbox" && !filtered && <AddUrlForm />}
      <div className="page-title">
        <h1>{query ? `Search ${TITLES[view]}` : TITLES[view]}</h1>
        {filtered && (
          <span className="muted small">
            {[query && `“${query}”`, folder && `in ${folder.name}`, tag && `tagged #${tag}`].filter(Boolean).join(", ")} ·{" "}
            <Link href={`/${view}`}>Clear</Link>
          </span>
        )}
      </div>
      {(folders.length > 0 || tags.length > 0) && (
        <nav className="filters" aria-label="Folders and tags">
          {folders.map((entry) => (
            <Link key={entry.id} className={`chip${entry.id === folder?.id ? " active" : ""}`} href={{ pathname: `/${view}`, query: { folder: entry.id } }}>
              {entry.name} <span className="muted">{entry.count}</span>
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
        <p className="empty">{filtered ? "No articles match." : EMPTY[view]}</p>
      ) : (
        <ul className="article-list">
          {items.map((item) => (
            <ArticleCard key={item.id} item={item} />
          ))}
        </ul>
      )}
      {(hasMore || page > 0) && (
        <nav className="pager" aria-label="Pages">
          {page > 0 && (
            <Link className="button" href={{ pathname: `/${view}`, query: { ...keep, page: page - 1 } }}>
              Newer
            </Link>
          )}
          {hasMore && (
            <Link className="button" href={{ pathname: `/${view}`, query: { ...keep, page: page + 1 } }}>
              Older
            </Link>
          )}
        </nav>
      )}
      <AutoRefresh active={busy} />
    </>
  );
}
