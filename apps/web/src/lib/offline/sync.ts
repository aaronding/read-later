import type { HaveVersions, OfflineSync } from "./copy";
import { getKept, keptVersions, putCopies, removeKept, updateCopies } from "./store";

// Keeping an article on the device, and bringing the kept copies up to date
// while online (decision 153). Both ask POST /api/offline.

const ENDPOINT = "/api/offline";

async function ask(have: HaveVersions): Promise<OfflineSync> {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ have }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`The server answered ${response.status}`);
  return (await response.json()) as OfflineSync;
}

/** Downloads an article's copy and keeps it. Returns false when the server no longer has it. */
export async function keepArticle(id: string): Promise<boolean> {
  const { copies, removed } = await ask({ [id]: (await getKept(id))?.version ?? null });
  if (removed.includes(id)) {
    await removeKept([id]);
    return false;
  }
  await putCopies(copies);
  await askToPersist();
  return true;
}

/**
 * Brings every kept copy up to date: a summary written since, an article
 * changed or deleted on another device. Does nothing when nothing is kept.
 */
export async function syncKept(): Promise<void> {
  const have = await keptVersions();
  if (Object.keys(have).length === 0) return;
  const { copies, removed } = await ask(have);
  await updateCopies(copies);
  await removeKept(removed);
}

/**
 * Asks the browser not to delete the kept articles when space runs low
 * (decision 156). Chrome decides by itself, Firefox asks the user, and
 * Safari keeps the storage of an app on the Home Screen.
 */
async function askToPersist(): Promise<void> {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch {
    // Keeping still worked; the browser only may delete it when space runs low.
  }
}
