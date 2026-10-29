"use client";

import { useTranslations } from "next-intl";
import { useState, useSyncExternalStore } from "react";
import { canKeep, keptIdList, removeKept, subscribe } from "@/lib/offline/store";
import { keepArticle } from "@/lib/offline/sync";
import { KeepIcon } from "./icons";

// Which articles are kept on this device, read once for the whole page and
// again whenever they change, so every button and badge agrees.

let keptIds: ReadonlySet<string> | null = null;
const listeners = new Set<() => void>();
let watching = false;

function reload() {
  keptIdList()
    .then((ids) => {
      keptIds = new Set(ids);
      listeners.forEach((listener) => listener());
    })
    .catch(() => undefined);
}

function watch(listener: () => void) {
  listeners.add(listener);
  if (!watching && canKeep()) {
    watching = true;
    subscribe(reload);
    reload();
  }
  return () => {
    listeners.delete(listener);
  };
}

/** The ids of the articles kept on this device, or null until they are known. */
function useKeptIds(): ReadonlySet<string> | null {
  return useSyncExternalStore(
    watch,
    () => keptIds,
    () => null,
  );
}

/** Asks the service worker to refresh its copy of the offline page, so a kept article can be opened offline. */
function refreshOfflinePage() {
  navigator.serviceWorker?.controller?.postMessage({ type: "refresh-offline-page" });
}

/**
 * Keep offline, in the reader's line of details: keeps the article on this
 * device, or removes it again (decision 155). A toggle, like Favorite.
 */
export function KeepOfflineButton({ articleId }: { articleId: string }) {
  const t = useTranslations("Offline");
  const kept = useKeptIds()?.has(articleId) ?? false;
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <>
      <button
        type="button"
        className="keep-offline"
        aria-pressed={kept}
        aria-busy={busy || undefined}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setFailed(false);
          try {
            if (kept) await removeKept([articleId]);
            else if (await keepArticle(articleId)) refreshOfflinePage();
          } catch {
            setFailed(true);
          } finally {
            setBusy(false);
          }
        }}
      >
        <KeepIcon kept={kept} />
        {t("keep")}
      </button>
      {failed && (
        <span className="keep-failed small" role="alert">
          {t("keepFailed")}
        </span>
      )}
    </>
  );
}

/** "On this device", on a list's card for an article kept here. */
export function KeptBadge({ articleId }: { articleId: string }) {
  const t = useTranslations("Offline");
  if (!useKeptIds()?.has(articleId)) return null;
  return <span className="badge">{t("keptBadge")}</span>;
}
