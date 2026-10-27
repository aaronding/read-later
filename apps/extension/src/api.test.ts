import { afterEach, describe, expect, it, vi } from "vitest";
import { checkConnection, sendSave, tokenRejected } from "./api";
import { DEFAULT_SERVER_URL, loadSettings, normalizeServerUrl } from "./settings";

const settings = { serverUrl: "https://read.example.com", token: "rl_test" };
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("sendSave", () => {
  it("posts the page with the token and reports the outcome", async () => {
    const fetchImpl = vi.fn(async () => json(201, { ok: true, message: "Saved to ReadSooner", outcome: "created" }));
    const outcome = await sendSave(settings, { url: "https://example.com/a", html: "<p>x</p>", title: "A" }, fetchImpl);
    expect(outcome).toEqual({ ok: true, kind: "saved", linkOnly: false });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://read.example.com/api/save");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer rl_test");
    expect(JSON.parse(String(init.body))).toEqual({ url: "https://example.com/a", html: "<p>x</p>", title: "A", source: "extension" });
  });

  it("tells a save again from a new one", async () => {
    const save = (outcome: string) =>
      sendSave(settings, { url: "https://example.com/a" }, async () => json(200, { ok: true, message: "…", outcome }));
    expect(await save("replaced")).toEqual({ ok: true, kind: "saved", linkOnly: false });
    expect(await save("resaved")).toEqual({ ok: true, kind: "alreadySaved", linkOnly: false });
    // A preview saved again by its link is downloaded again.
    const refetch = await sendSave(settings, { url: "https://example.com/a" }, async () =>
      json(200, { ok: true, message: "…", outcome: "resaved", queued: true }),
    );
    expect(refetch).toEqual({ ok: true, kind: "refetching", linkOnly: false });
    // An outcome from a newer server: its own message is all there is to show.
    expect(await save("queued")).toEqual({ ok: true, kind: "saved", linkOnly: false, detail: "…" });
  });

  it("falls back to saving the link when the page is too large", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json(413, { ok: false, error: "too large", code: "too_large" }))
      .mockResolvedValueOnce(json(201, { ok: true, message: "Saved to ReadSooner", outcome: "created" }));
    const outcome = await sendSave(settings, { url: "https://example.com/a", html: "x".repeat(10) }, fetchImpl);
    expect(outcome).toEqual({ ok: true, kind: "saved", linkOnly: true });
    expect(JSON.parse(String((fetchImpl.mock.calls[1] as [string, RequestInit])[1].body))).not.toHaveProperty("html");
  });

  it("reports the server's error code and text, or its status", async () => {
    const unauthorized = vi.fn(async () =>
      json(401, { ok: false, error: "Missing or invalid access token.", code: "unauthorized" }),
    );
    expect(await sendSave(settings, { url: "https://example.com" }, unauthorized)).toEqual({
      ok: false,
      kind: "server",
      code: "unauthorized",
      detail: "Missing or invalid access token.",
      status: "401",
    });
    const proxy = vi.fn(async () => new Response("<h1>Bad gateway</h1>", { status: 502, statusText: "Bad Gateway" }));
    expect(await sendSave(settings, { url: "https://example.com" }, proxy)).toEqual({
      ok: false,
      kind: "server",
      status: "502 Bad Gateway",
    });
  });

  it("tells a refused token from other failures, so the options page can open", async () => {
    const refused = await sendSave(settings, { url: "https://example.com" }, async () =>
      json(401, { ok: false, error: "Missing or invalid access token.", code: "unauthorized" }),
    );
    expect(tokenRejected(refused)).toBe(true);
    const failed = await sendSave(settings, { url: "https://example.com" }, async () =>
      json(500, { ok: false, error: "Oops", code: "server_error" }),
    );
    expect(tokenRejected(failed)).toBe(false);
    expect(tokenRejected({ ok: false, kind: "notConfigured" })).toBe(false);
  });

  it("reports a server it can't reach", async () => {
    const offline = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(await sendSave(settings, { url: "https://example.com" }, offline)).toEqual({
      ok: false,
      kind: "unreachable",
      server: "https://read.example.com",
      detail: "Failed to fetch",
    });
  });

  it("asks for setup when the URL or token is missing", async () => {
    const fetchImpl = vi.fn();
    const outcome = await sendSave({ serverUrl: "", token: "" }, { url: "https://example.com" }, fetchImpl);
    expect(outcome).toEqual({ ok: false, kind: "notConfigured" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("checkConnection", () => {
  it("checks the token with a GET", async () => {
    const fetchImpl = vi.fn(async () => json(200, { ok: true, message: "Connected to ReadSooner", app: "ReadSooner" }));
    expect(await checkConnection(settings, fetchImpl)).toEqual({ ok: true, kind: "connected" });
    expect((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].method).toBeUndefined();
  });

  it("doesn't take another site's page for the server", async () => {
    const fetchImpl = vi.fn(async () => new Response("<!doctype html><p>Welcome</p>", { status: 200 }));
    expect(await checkConnection(settings, fetchImpl)).toMatchObject({ ok: false, kind: "notTheApp" });
    expect(await sendSave(settings, { url: "https://example.com/a" }, fetchImpl)).toMatchObject({
      ok: false,
      kind: "notTheApp",
      server: settings.serverUrl,
    });
  });
});

describe("normalizeServerUrl", () => {
  it("adds https and removes trailing slashes", () => {
    expect(normalizeServerUrl(" read.example.com/ ")).toBe("https://read.example.com");
    expect(normalizeServerUrl("http://localhost:3000")).toBe("http://localhost:3000");
    expect(normalizeServerUrl("localhost:3000/")).toBe("http://localhost:3000");
    expect(normalizeServerUrl("https://example.com/read-later/")).toBe("https://example.com/read-later");
    expect(normalizeServerUrl("")).toBe("");
  });

  it("sends the app's own domain to its www address over https", () => {
    for (const typed of ["readsooner.com", "ReadSooner.com/", "http://readsooner.com", "www.readsooner.com/inbox"]) {
      expect(normalizeServerUrl(typed)).toBe(DEFAULT_SERVER_URL);
    }
    expect(DEFAULT_SERVER_URL).toBe("https://www.readsooner.com");
    expect(normalizeServerUrl("read.readsooner.example")).toBe("https://read.readsooner.example");
  });
});

describe("loadSettings", () => {
  afterEach(() => vi.unstubAllGlobals());
  const stored = (values: Record<string, unknown>) =>
    vi.stubGlobal("chrome", { storage: { local: { get: async () => values } } });

  it("fills in the app's address until another is saved", async () => {
    stored({});
    expect(await loadSettings()).toEqual({ serverUrl: DEFAULT_SERVER_URL, token: "" });
    stored({ serverUrl: "http://localhost:3000", token: "rl_test" });
    expect(await loadSettings()).toEqual({ serverUrl: "http://localhost:3000", token: "rl_test" });
  });

  it("corrects an address saved without www", async () => {
    stored({ serverUrl: "https://readsooner.com", token: "rl_test" });
    expect((await loadSettings()).serverUrl).toBe(DEFAULT_SERVER_URL);
  });
});
