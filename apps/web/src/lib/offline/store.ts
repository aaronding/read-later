import type { KeptArticle, OfflineCopy } from "./copy";

// The articles kept on this device, in the browser's IndexedDB (decision 153).
// One database for the site: the kept articles, and the account they belong
// to (decision 154). Every change is announced to this tab's listeners and,
// through a BroadcastChannel, to the site's other tabs.

const DB_NAME = "readsooner-offline";
const DB_VERSION = 1;
const ARTICLES = "articles";
const META = "meta";
const OWNER_KEY = "owner";
const CHANNEL = "readsooner-offline";

/** The account the kept articles belong to. */
export interface KeptOwner {
  id: string;
  email: string;
}

let opening: Promise<IDBDatabase> | null = null;

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function done(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
  });
}

/** True where this browser can keep articles. */
export function canKeep(): boolean {
  return typeof indexedDB !== "undefined";
}

function open(): Promise<IDBDatabase> {
  opening ??= new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(ARTICLES)) db.createObjectStore(ARTICLES, { keyPath: "id" });
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META);
    };
    req.onsuccess = () => {
      const db = req.result;
      // A newer version of the app in another tab wants to upgrade it.
      db.onversionchange = () => {
        db.close();
        opening = null;
      };
      resolve(db);
    };
    req.onerror = () => {
      opening = null;
      reject(req.error);
    };
  });
  return opening;
}

/** Closes the connection, so the next call opens it again (for tests). */
export async function closeStore(): Promise<void> {
  const current = opening;
  opening = null;
  if (current) (await current.catch(() => null))?.close();
}

const listeners = new Set<() => void>();
let channel: BroadcastChannel | null | undefined;

function getChannel(): BroadcastChannel | null {
  if (channel === undefined) {
    channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(CHANNEL);
    if (channel) channel.onmessage = () => listeners.forEach((listener) => listener());
  }
  return channel;
}

function changed() {
  listeners.forEach((listener) => listener());
  getChannel()?.postMessage("changed");
}

/** Calls `listener` whenever the kept articles change, in this tab or another. Returns a function that stops it. */
export function subscribe(listener: () => void): () => void {
  getChannel();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Every kept article, the most recently kept first. */
export async function listKept(): Promise<KeptArticle[]> {
  const db = await open();
  const rows = await request(db.transaction(ARTICLES).objectStore(ARTICLES).getAll() as IDBRequest<KeptArticle[]>);
  return rows.sort((a, b) => b.keptAt.localeCompare(a.keptAt));
}

/** The ids of the kept articles, without reading their text. */
export async function keptIdList(): Promise<string[]> {
  const db = await open();
  return request(db.transaction(ARTICLES).objectStore(ARTICLES).getAllKeys() as IDBRequest<string[]>);
}

export async function getKept(id: string): Promise<KeptArticle | undefined> {
  const db = await open();
  return request(db.transaction(ARTICLES).objectStore(ARTICLES).get(id) as IDBRequest<KeptArticle | undefined>);
}

/** Each kept article's id and the version of its copy. */
export async function keptVersions(): Promise<Record<string, string>> {
  return Object.fromEntries((await listKept()).map((article) => [article.id, article.version]));
}

/**
 * Keeps these copies, replacing older ones of the same articles. An article
 * kept before keeps the time it was first kept, so it stays in its place.
 */
export async function putCopies(copies: OfflineCopy[], now = new Date()): Promise<void> {
  if (copies.length === 0) return;
  const db = await open();
  const transaction = db.transaction(ARTICLES, "readwrite");
  const store = transaction.objectStore(ARTICLES);
  for (const copy of copies) {
    const existing = store.get(copy.id) as IDBRequest<KeptArticle | undefined>;
    existing.onsuccess = () => {
      store.put({ ...copy, keptAt: existing.result?.keptAt ?? now.toISOString() } satisfies KeptArticle);
    };
  }
  await done(transaction);
  changed();
}

/** Updates copies only of articles still kept, so one removed while a sync ran stays removed. */
export async function updateCopies(copies: OfflineCopy[]): Promise<void> {
  if (copies.length === 0) return;
  const db = await open();
  const transaction = db.transaction(ARTICLES, "readwrite");
  const store = transaction.objectStore(ARTICLES);
  for (const copy of copies) {
    const existing = store.get(copy.id) as IDBRequest<KeptArticle | undefined>;
    existing.onsuccess = () => {
      if (existing.result) store.put({ ...copy, keptAt: existing.result.keptAt } satisfies KeptArticle);
    };
  }
  await done(transaction);
  changed();
}

export async function removeKept(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await open();
  const transaction = db.transaction(ARTICLES, "readwrite");
  for (const id of ids) transaction.objectStore(ARTICLES).delete(id);
  await done(transaction);
  changed();
}

/** Removes every kept article and the account they belonged to, as signing out does. */
export async function clearKept(): Promise<void> {
  const db = await open();
  const transaction = db.transaction([ARTICLES, META], "readwrite");
  transaction.objectStore(ARTICLES).clear();
  transaction.objectStore(META).delete(OWNER_KEY);
  await done(transaction);
  changed();
}

/** The account the kept articles belong to, if any. */
export async function getOwner(): Promise<KeptOwner | undefined> {
  const db = await open();
  return request(db.transaction(META).objectStore(META).get(OWNER_KEY) as IDBRequest<KeptOwner | undefined>);
}

/**
 * Records the signed-in account as the one the kept articles belong to.
 * Articles another account kept here are removed first, so no account sees
 * another's. Returns true when it removed some.
 */
export async function claimOwner(owner: KeptOwner): Promise<boolean> {
  const db = await open();
  const transaction = db.transaction([ARTICLES, META], "readwrite");
  const meta = transaction.objectStore(META);
  let cleared = false;
  const current = meta.get(OWNER_KEY) as IDBRequest<KeptOwner | undefined>;
  current.onsuccess = () => {
    if (current.result && current.result.id !== owner.id) {
      transaction.objectStore(ARTICLES).clear();
      cleared = true;
    }
    if (current.result?.id !== owner.id || current.result.email !== owner.email) {
      meta.put({ id: owner.id, email: owner.email } satisfies KeptOwner, OWNER_KEY);
    }
  };
  await done(transaction);
  if (cleared) changed();
  return cleared;
}

/** About how many bytes the kept articles take, counting their text as UTF-16, as browsers store it. */
export function keptBytes(articles: KeptArticle[]): number {
  return articles.reduce((total, article) => total + JSON.stringify(article).length * 2, 0);
}
