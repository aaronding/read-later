// ReadSooner's service worker (decision 151), hand-written and served as is.
//
// It keeps one page of the app, /offline, with the scripts, styles and logo it
// needs, and the fonts the browser has used, so the app opens without a
// connection. Online, every page comes
// from the network as before. Offline, a page that can't load leads to
// /offline, which lists the articles kept on the device (in IndexedDB) and
// shows them in a reader. The cached page keeps its own Content Security
// Policy header, so its scripts' nonce still matches it (decision 152).

const OFFLINE_URL = "/offline";
/** Each copy of the offline page and its files is one cache, named with when it was made. */
const CACHE_PREFIX = "offline-";
/**
 * The fonts the browser has used, kept as it uses them: the stylesheet names
 * every reading font, 2.4 MB in all, and the reader needs only the chosen one.
 */
const FONT_CACHE = "fonts";
/** How old the copy may be before a page loaded online also refreshes it. */
const REFRESH_AFTER_MS = 60 * 60 * 1000;

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(refreshOfflinePage().catch(() => undefined));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// A page asks for a fresh copy, after an article is kept.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "refresh-offline-page") {
    event.waitUntil(refreshOfflinePage().catch(() => undefined));
  }
});

self.addEventListener("fetch", (event) => {
  const response = handleFetch(event);
  if (response) event.respondWith(response);
});

/** The response for a request this worker answers, or undefined to leave it to the browser. */
function handleFetch(event) {
  const request = event.request;
  if (request.method !== "GET") return undefined;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return undefined;
  // The app's files: those under /_next/static change their names with their
  // content, so a cached copy is the same file; the logo is all that's left.
  if (url.pathname.startsWith("/_next/static/media/")) return fontResponse(request);
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    return caches.match(request, { ignoreVary: true }).then((cached) => cached || fetch(request));
  }
  if (request.mode === "navigate" && !url.pathname.startsWith("/api/")) {
    return fetch(request).then(
      (response) => {
        event.waitUntil(refreshIfOld().catch(() => undefined));
        return response;
      },
      () => offlineResponse(url),
    );
  }
  return undefined;
}

/** A font from the cache, or from the network, then kept for next time. */
async function fontResponse(request) {
  const cache = await caches.open(FONT_CACHE);
  const cached = await cache.match(request, { ignoreVary: true });
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(new URL(request.url).pathname, response.clone());
  return response;
}

/** What a page that can't load shows: the offline page, or the way to it. */
async function offlineResponse(url) {
  if (url.pathname !== OFFLINE_URL) {
    // The reader of a kept article opens it there; any other page, the list.
    const article = /^\/articles\/([0-9a-f-]{36})$/i.exec(url.pathname);
    const target = new URL(OFFLINE_URL, self.location.origin);
    if (article) target.searchParams.set("article", article[1]);
    return Response.redirect(target.href, 302);
  }
  // Next.js marks pages Vary: rsc and the like; this copy answers any request for the page.
  const cached = await caches.match(OFFLINE_URL, { ignoreVary: true });
  if (cached) return cached;
  return new Response(
    '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Offline</title><p style="font-family:system-ui;margin:2em">You’re offline.</p>',
    { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

/** The cache names holding copies of the offline page, the newest first. */
async function offlineCaches() {
  const names = (await caches.keys()).filter((name) => name.startsWith(CACHE_PREFIX));
  return names.sort((a, b) => Number(b.slice(CACHE_PREFIX.length)) - Number(a.slice(CACHE_PREFIX.length)));
}

async function refreshIfOld() {
  const [newest] = await offlineCaches();
  const madeAt = newest ? Number(newest.slice(CACHE_PREFIX.length)) : 0;
  if (Date.now() - madeAt > REFRESH_AFTER_MS) await refreshOfflinePage();
}

let refreshing = null;

/**
 * Downloads the offline page and every file it needs into a new cache, then
 * deletes the older ones, and the fonts its stylesheets no longer name.
 * Nothing changes if any download fails, so the copy in the cache always
 * works as a whole.
 */
function refreshOfflinePage() {
  refreshing ??= (async () => {
    const page = await fetch(OFFLINE_URL, { cache: "no-store", credentials: "same-origin" });
    if (!page.ok || page.redirected) throw new Error(`The offline page answered ${page.status}`);
    const html = await page.clone().text();
    const files = staticFiles(html);
    const responses = new Map();
    const fonts = new Set();
    for (const file of files) {
      const response = await download(file);
      responses.set(file, response);
      if (file.endsWith(".css")) fontFiles(await response.clone().text(), file).forEach((font) => fonts.add(font));
    }
    const name = CACHE_PREFIX + Date.now();
    const cache = await caches.open(name);
    await cache.put(OFFLINE_URL, page);
    for (const [file, response] of responses) await cache.put(file, response);
    for (const old of await offlineCaches()) {
      if (old !== name) await caches.delete(old);
    }
    const fontCache = await caches.open(FONT_CACHE);
    for (const key of await fontCache.keys()) {
      if (!fonts.has(new URL(key.url).pathname)) await fontCache.delete(key);
    }
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

async function download(file) {
  const response = await fetch(file);
  if (!response.ok) throw new Error(`${file} answered ${response.status}`);
  return response;
}

/** The app's own scripts, stylesheets and images a page names, as paths. */
function staticFiles(html) {
  const found = new Set();
  // Paths appear in attributes and, escaped, in the page's data for React.
  for (const match of html.replaceAll("\\/", "/").matchAll(/\/(?:_next\/static|icons)\/[\w\-./~%]+/g)) {
    const path = match[0].replace(/\.+$/, "");
    if (/\.(js|css|svg|png)$/.test(path)) found.add(path);
  }
  return [...found];
}

/** The fonts a stylesheet names, as paths; its url()s are relative to it. */
function fontFiles(css, stylesheet) {
  const base = new URL(stylesheet, self.location.origin);
  const found = new Set();
  for (const match of css.matchAll(/url\(\s*["']?([^"')]+?\.(?:woff2?|ttf|otf))["']?\s*\)/g)) {
    const url = new URL(match[1], base);
    if (url.origin === self.location.origin) found.add(url.pathname);
  }
  return [...found];
}
