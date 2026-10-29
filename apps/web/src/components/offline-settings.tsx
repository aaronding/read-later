"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { APP_NAME } from "@/config/app";
import type { KeptArticle } from "@/lib/offline/copy";
import { canKeep, keptBytes, listKept, removeKept, subscribe } from "@/lib/offline/store";

const strong = (chunks: React.ReactNode) => <strong>{chunks}</strong>;

/** Settings' Offline reading card: how many articles this device keeps, and about how much space they take (decision 155). */
export function OfflineSettings() {
  const t = useTranslations("Offline");
  const format = useFormatter();
  const [articles, setArticles] = useState<KeptArticle[] | null>(null);

  useEffect(() => {
    if (!canKeep()) return;
    const load = () => {
      listKept()
        .then(setArticles)
        .catch(() => undefined);
    };
    load();
    return subscribe(load);
  }, []);

  const bytes = articles ? keptBytes(articles) : 0;
  const size =
    bytes < 1_000_000
      ? format.number(Math.max(1, Math.round(bytes / 1000)), { style: "unit", unit: "kilobyte" })
      : format.number(bytes / 1_000_000, { style: "unit", unit: "megabyte", maximumFractionDigits: 1 });

  return (
    <section className="card" aria-labelledby="offline-heading">
      <h2 id="offline-heading">{t("settings.heading")}</h2>
      <p className="muted">{t.rich("settings.intro", { strong })}</p>
      {articles && <p>{t("settings.count", { count: articles.length, size })}</p>}
      <p className="muted small">{t("settings.safari", { app: APP_NAME, iphone: "iPhone", ipad: "iPad", safari: "Safari" })}</p>
      <div className="card-actions">
        <a className="button" href="/offline">
          {t("settings.open")}
        </a>
        {articles && articles.length > 0 && (
          <button
            type="button"
            className="button"
            onClick={() => {
              if (window.confirm(t("settings.removeAllConfirm"))) {
                removeKept(articles.map((article) => article.id)).catch(() => undefined);
              }
            }}
          >
            {t("settings.removeAll")}
          </button>
        )}
      </div>
    </section>
  );
}
