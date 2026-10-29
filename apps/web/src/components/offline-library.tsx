"use client";

import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { KeptArticle } from "@/lib/offline/copy";
import { withoutMedia } from "@/lib/offline/render";
import { canKeep, getOwner, listKept, removeKept, subscribe, type KeptOwner } from "@/lib/offline/store";
import { BackIcon } from "./icons";
import { LocalDate } from "./local-date";

type Kept = { status: "loading" } | { status: "unsupported" } | { status: "ready"; articles: KeptArticle[]; owner?: KeptOwner };

function watchConnection(listener: () => void) {
  window.addEventListener("online", listener);
  window.addEventListener("offline", listener);
  return () => {
    window.removeEventListener("online", listener);
    window.removeEventListener("offline", listener);
  };
}

/** The article the address names (/offline?article=<id>), opened without asking the server. */
function openArticle(event: React.MouseEvent<HTMLAnchorElement>, href: string) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  window.history.pushState(null, "", href);
  window.scrollTo(0, 0);
}

const strong = (chunks: React.ReactNode) => <strong>{chunks}</strong>;

/**
 * The offline page's content (decision 152): the articles kept on this
 * device, read from IndexedDB, and one of them in a reader when the address
 * names it. It works the same online, but the service worker leads here only
 * when a page can't load.
 */
export function OfflineLibrary() {
  const t = useTranslations("Offline");
  const tCommon = useTranslations("Common");
  const id = useSearchParams().get("article");
  const online = useSyncExternalStore(
    watchConnection,
    () => navigator.onLine,
    () => false,
  );
  const [kept, setKept] = useState<Kept>({ status: "loading" });

  useEffect(() => {
    if (!canKeep()) {
      setKept({ status: "unsupported" });
      return;
    }
    const load = () => {
      Promise.all([listKept(), getOwner()])
        .then(([articles, owner]) => setKept({ status: "ready", articles, owner }))
        .catch(() => setKept({ status: "unsupported" }));
    };
    load();
    return subscribe(load);
  }, []);

  const notice = (
    <p className={`notice small${online ? " success" : ""}`} role="status">
      {online ? t.rich("online", { link: (chunks) => <a href="/inbox">{chunks}</a> }) : t("offline")}
    </p>
  );

  if (kept.status !== "ready") {
    return (
      <div className="offline-library">
        {notice}
        <p className="muted">{kept.status === "loading" ? t("loading") : t("unsupported")}</p>
      </div>
    );
  }

  if (id) {
    const article = kept.articles.find((item) => item.id === id);
    return (
      <div className="offline-library">
        {notice}
        <div className="reader">
          <a href="/offline" className="offline-back" onClick={(event) => openArticle(event, "/offline")}>
            <BackIcon />
            {t("back")}
          </a>
          {article ? <OfflineReader article={article} /> : <p className="empty">{t("notKept")}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="offline-library">
      {notice}
      <div className="page-title">
        <h1>{t("pageTitle")}</h1>
      </div>
      {kept.owner && kept.articles.length > 0 && <p className="muted small">{t("keptFor", { email: kept.owner.email })}</p>}
      {kept.articles.length === 0 ? (
        <p className="empty">{t.rich("empty", { strong })}</p>
      ) : (
        <ul className="article-list">
          {kept.articles.map((article) => {
            const href = `/offline?article=${article.id}`;
            return (
              <li key={article.id} className="card article-card">
                <h2>
                  <a href={href} onClick={(event) => openArticle(event, href)} lang={article.lang ?? undefined}>
                    {article.title || article.url}
                  </a>
                </h2>
                <div className="meta">
                  <span>{article.siteName || new URL(article.url).hostname}</span>
                  {article.readingMinutes ? <span>{tCommon("minRead", { minutes: article.readingMinutes })}</span> : null}
                  <span>{t.rich("keptOn", { date: () => <LocalDate value={article.keptAt} /> })}</span>
                  {article.previewOnly && <span className="badge warn">{tCommon("previewOnly")}</span>}
                </div>
                {article.summary?.tldr && (
                  <p className="tldr" lang={article.summary.language ?? undefined}>
                    {article.summary.tldr}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** A kept article, as the reader shows it, without pictures or anything that needs a connection. */
function OfflineReader({ article }: { article: KeptArticle }) {
  const t = useTranslations("Offline");
  const tCommon = useTranslations("Common");
  const html = useMemo(() => (article.contentHtml ? withoutMedia(article.contentHtml) : null), [article.contentHtml]);
  const hadMedia = Boolean(article.contentHtml && /<(img|picture|video|audio|iframe)\b/i.test(article.contentHtml));
  const summary = article.summary;
  return (
    <article>
      <header className="reader-header">
        <div className="meta">
          <span>{article.siteName || new URL(article.url).hostname}</span>
          {article.author && <span>{article.author}</span>}
          {article.publishedAt && (
            <span>
              <LocalDate value={article.publishedAt} />
            </span>
          )}
          {article.readingMinutes ? <span>{tCommon("minRead", { minutes: article.readingMinutes })}</span> : null}
          {article.previewOnly && <span className="badge warn">{tCommon("previewOnly")}</span>}
          <a href={article.url} target="_blank" rel="noopener noreferrer">
            {t("openOriginal")}
          </a>
          {/* Where the reader online has Keep offline. */}
          <button
            type="button"
            className="keep-offline"
            onClick={async () => {
              await removeKept([article.id]);
              window.history.pushState(null, "", "/offline");
            }}
          >
            {t("remove")}
          </button>
        </div>
        <h1 lang={article.lang ?? undefined}>{article.title || article.url}</h1>
      </header>

      {summary?.tldr && (
        <section className="card summary" aria-labelledby="summary-heading">
          <h2 id="summary-heading">
            <span>{t("summary")}</span>
          </h2>
          <div className="summary-body" lang={summary.language ?? undefined}>
            <p className="tldr">{summary.tldr}</p>
            {summary.keyPoints && summary.keyPoints.length > 0 && (
              <ul>
                {summary.keyPoints.map((point, index) => (
                  <li key={index}>{point}</li>
                ))}
              </ul>
            )}
          </div>
          {summary.partial && <p className="notice warn small">{t("partial")}</p>}
        </section>
      )}

      {html ? (
        <>
          {hadMedia && <p className="muted small">{t("noImages")}</p>}
          <div
            className="prose"
            lang={article.lang ?? undefined}
            // Sanitized with DOMPurify before the server stored it.
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </>
      ) : (
        article.excerpt && <p className="muted">{article.excerpt}</p>
      )}

      <footer className="reader-footer">
        <div className="meta">
          <span>{tCommon.rich("savedOn", { date: () => <LocalDate value={article.savedAt} /> })}</span>
          <a href={article.url} target="_blank" rel="noopener noreferrer">
            {t("openOriginal")}
          </a>
        </div>
      </footer>
    </article>
  );
}
