import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { beforeEach, describe, expect, it, vi } from "vitest";

// public/sw.js runs here in a sandbox standing in for the service worker's
// global scope: its own events, an in-memory Cache Storage and a fake network.

const ORIGIN = "https://www.readsooner.com";
const SOURCE = readFileSync(path.join(import.meta.dirname, "../../../public/sw.js"), "utf8");
const ARTICLE = "0f8fad5b-d9cb-469f-a165-70867728950e";

class FakeCache {
  entries = new Map<string, Response>();
  async put(request: string | Request, response: Response) {
    this.entries.set(new URL(typeof request === "string" ? request : request.url, ORIGIN).pathname, response);
  }
  async match(request: string | Request) {
    return this.entries.get(new URL(typeof request === "string" ? request : request.url, ORIGIN).pathname)?.clone();
  }
  async keys() {
    return [...this.entries.keys()].map((pathname) => ({ url: new URL(pathname, ORIGIN).href }));
  }
  async delete(request: string | { url: string }) {
    return this.entries.delete(new URL(typeof request === "string" ? request : request.url, ORIGIN).pathname);
  }
}

class FakeCacheStorage {
  caches = new Map<string, FakeCache>();
  async open(name: string) {
    if (!this.caches.has(name)) this.caches.set(name, new FakeCache());
    return this.caches.get(name)!;
  }
  async keys() {
    return [...this.caches.keys()];
  }
  async delete(name: string) {
    return this.caches.delete(name);
  }
  async match(request: string | Request) {
    for (const cache of this.caches.values()) {
      const found = await cache.match(request);
      if (found) return found;
    }
    return undefined;
  }
}

type Handler = (event: unknown) => void;

function startWorker(network: (url: string, init?: RequestInit) => Promise<Response>) {
  const handlers = new Map<string, Handler>();
  const caches = new FakeCacheStorage();
  const fetchMock = vi.fn(async (input: string | Request, init?: RequestInit) =>
    network(new URL(typeof input === "string" ? input : input.url, ORIGIN).href, init),
  );
  const self = {
    location: new URL(ORIGIN),
    addEventListener: (type: string, handler: Handler) => handlers.set(type, handler),
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn(async () => undefined) },
  };
  const context = vm.createContext({ self, caches, fetch: fetchMock, Response, Request, URL, Date, Number, Map, Set, Error, Promise });
  vm.runInContext(SOURCE, context);

  /** Dispatches an event and waits for everything it asked to wait for. */
  async function dispatch(type: string, fields: Record<string, unknown>) {
    const waits: Promise<unknown>[] = [];
    let response: Promise<Response> | undefined;
    const event = {
      ...fields,
      waitUntil: (promise: Promise<unknown>) => waits.push(promise),
      respondWith: (promise: Promise<Response>) => (response = Promise.resolve(promise)),
    };
    handlers.get(type)!(event);
    const answered = response ? await response : undefined;
    // Waits added while the response was being made count too.
    for (let i = 0; i < waits.length; i++) await waits[i];
    return answered;
  }

  return {
    caches,
    fetchMock,
    self,
    install: () => dispatch("install", {}),
    message: (data: unknown) => dispatch("message", { data }),
    fetch: (url: string, init: { method?: string; mode?: RequestMode } = {}) =>
      dispatch("fetch", { request: { url: new URL(url, ORIGIN).href, method: init.method ?? "GET", mode: init.mode ?? "cors" } }),
    navigate: (url: string) => dispatch("fetch", { request: { url: new URL(url, ORIGIN).href, method: "GET", mode: "navigate" } }),
  };
}

const OFFLINE_HTML = `<!doctype html><html><head>
<link rel="stylesheet" href="/_next/static/css/app-1a2b.css">
<script src="/_next/static/chunks/main-3c4d.js" async nonce="abc"></script>
</head><body><img class="logo-light" src="/icons/logo.svg" alt=""><script nonce="abc">self.__next_f.push([1,"I:[\\"/_next/static/chunks/page-5e6f.js\\"]"])</script></body></html>`;
// Turbopack's stylesheets name their fonts relative to themselves.
const CSS = "@font-face{src:url(../media/serif-7a8b.woff2) format('woff2')}@font-face{src:url(\"../media/sans-9c0d.woff2\")}body{color:red}";
const CSP = "script-src 'self' 'nonce-abc' 'strict-dynamic'";

/** A server that has the offline page and its files, and fails when `offline` is set. */
function server(state: { offline?: boolean; missing?: string[] } = {}) {
  return async (url: string) => {
    if (state.offline) throw new TypeError("Failed to fetch");
    const { pathname } = new URL(url);
    if (state.missing?.includes(pathname)) return new Response("Not found", { status: 404 });
    if (pathname === "/offline") {
      return new Response(OFFLINE_HTML, { headers: { "Content-Type": "text/html", "Content-Security-Policy": CSP } });
    }
    if (pathname.endsWith(".css")) return new Response(CSS, { headers: { "Content-Type": "text/css" } });
    if (pathname.startsWith("/_next/static/") || pathname.startsWith("/icons/")) return new Response(`file ${pathname}`);
    return new Response(`page ${pathname}`, { headers: { "Content-Type": "text/html" } });
  };
}

describe("the service worker", () => {
  let state: { offline?: boolean; missing?: string[] };
  let worker: ReturnType<typeof startWorker>;

  beforeEach(() => {
    state = {};
    worker = startWorker(server(state));
  });

  it("keeps the offline page and every file it names when it installs", async () => {
    await worker.install();
    expect(worker.self.skipWaiting).toHaveBeenCalled();
    const name = (await worker.caches.keys()).find((key) => key.startsWith("offline-"));
    expect(name).toMatch(/^offline-\d+$/);
    expect([...worker.caches.caches.get(name!)!.entries.keys()].sort()).toEqual([
      "/_next/static/chunks/main-3c4d.js",
      "/_next/static/chunks/page-5e6f.js",
      "/_next/static/css/app-1a2b.css",
      "/icons/logo.svg",
      "/offline",
    ]);
    // Not every reading font: only those the browser uses.
    expect(worker.fetchMock.mock.calls.map(([url]) => String(url))).not.toContain("/_next/static/media/serif-7a8b.woff2");
  });

  it("asks for the offline page with the user's cookies and without the browser's cache", async () => {
    await worker.install();
    expect(worker.fetchMock).toHaveBeenCalledWith("/offline", { cache: "no-store", credentials: "same-origin" });
  });

  it("keeps the older copy when a file of the new one fails", async () => {
    await worker.install();
    const before = await worker.caches.keys();
    state.missing = ["/_next/static/chunks/main-3c4d.js"];
    await worker.message({ type: "refresh-offline-page" });
    expect(await worker.caches.keys()).toEqual(before);
  });

  it("replaces the copy when a page asks", async () => {
    await worker.install();
    const [first] = await worker.caches.keys();
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 1000);
    await worker.message({ type: "refresh-offline-page" });
    const names = (await worker.caches.keys()).filter((key) => key.startsWith("offline-"));
    expect(names).toHaveLength(1);
    expect(names[0]).not.toBe(first);
    vi.restoreAllMocks();
  });

  it("leaves pages to the network while online", async () => {
    await worker.install();
    const response = await worker.navigate("/inbox");
    expect(await response?.text()).toBe("page /inbox");
  });

  it("refreshes an old copy after a page loads online, and not a new one", async () => {
    await worker.install();
    worker.fetchMock.mockClear();
    await worker.navigate("/inbox");
    expect(worker.fetchMock).toHaveBeenCalledTimes(1);

    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 2 * 60 * 60 * 1000);
    await worker.navigate("/inbox");
    expect(worker.fetchMock.mock.calls.map(([url]) => url)).toContain("/offline");
    vi.restoreAllMocks();
  });

  it("serves the kept offline page offline, with its own policy header", async () => {
    await worker.install();
    state.offline = true;
    const response = await worker.navigate("/offline?article=" + ARTICLE);
    expect(await response?.text()).toBe(OFFLINE_HTML);
    // The nonce in the header is the one the page's scripts carry.
    expect(response?.headers.get("Content-Security-Policy")).toBe(CSP);
  });

  it("sends a kept article's reader to the offline page, and other pages to its list", async () => {
    await worker.install();
    state.offline = true;
    const reader = await worker.navigate(`/articles/${ARTICLE}?from=/inbox`);
    expect(reader?.status).toBe(302);
    expect(reader?.headers.get("Location")).toBe(`${ORIGIN}/offline?article=${ARTICLE}`);
    const inbox = await worker.navigate("/inbox");
    expect(inbox?.headers.get("Location")).toBe(`${ORIGIN}/offline`);
  });

  it("says it is offline when the offline page isn't kept yet", async () => {
    state.offline = true;
    await worker.install();
    const response = await worker.navigate("/offline");
    expect(response?.status).toBe(503);
    expect(await response?.text()).toContain("offline");
  });

  it("serves the app's files from the cache, and others from the network", async () => {
    await worker.install();
    state.offline = true;
    expect(await (await worker.fetch("/_next/static/chunks/main-3c4d.js"))?.text()).toBe("file /_next/static/chunks/main-3c4d.js");
    state.offline = false;
    expect(await (await worker.fetch("/_next/static/chunks/other-9z.js"))?.text()).toBe("file /_next/static/chunks/other-9z.js");
  });

  it("keeps the fonts the browser uses, and serves them offline", async () => {
    await worker.install();
    await worker.fetch("/_next/static/media/serif-7a8b.woff2");
    expect([...worker.caches.caches.get("fonts")!.entries.keys()]).toEqual(["/_next/static/media/serif-7a8b.woff2"]);
    state.offline = true;
    expect(await (await worker.fetch("/_next/static/media/serif-7a8b.woff2"))?.text()).toBe("file /_next/static/media/serif-7a8b.woff2");
  });

  it("forgets the fonts the stylesheets no longer name when it refreshes", async () => {
    await worker.install();
    await worker.fetch("/_next/static/media/serif-7a8b.woff2");
    await worker.fetch("/_next/static/media/old-1111.woff2");
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 1000);
    await worker.message({ type: "refresh-offline-page" });
    expect([...worker.caches.caches.get("fonts")!.entries.keys()]).toEqual(["/_next/static/media/serif-7a8b.woff2"]);
    vi.restoreAllMocks();
  });

  it("leaves everything else to the browser", async () => {
    await worker.install();
    expect(await worker.fetch("/api/offline", { method: "POST" })).toBeUndefined();
    expect(await worker.fetch("/inbox?_rsc=1")).toBeUndefined();
    expect(await worker.fetch("https://images.example.com/photo.jpg")).toBeUndefined();
    // A download from the API, such as the export, isn't sent to the offline page.
    expect(await worker.fetch("/api/export?format=json", { mode: "navigate" })).toBeUndefined();
  });
});
