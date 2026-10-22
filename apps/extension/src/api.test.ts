import { describe, expect, it, vi } from "vitest";
import { checkConnection, sendSave } from "./api";
import { normalizeServerUrl } from "./settings";

const settings = { serverUrl: "https://read.example.com", token: "rl_test" };
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("sendSave", () => {
  it("posts the page with the token and reports the server's message", async () => {
    const fetchImpl = vi.fn(async () => json(201, { ok: true, message: "Saved to Read Later" }));
    const outcome = await sendSave(settings, { url: "https://example.com/a", html: "<p>x</p>", title: "A" }, fetchImpl);
    expect(outcome).toEqual({ ok: true, message: "Saved to Read Later" });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://read.example.com/api/save");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer rl_test");
    expect(JSON.parse(String(init.body))).toEqual({ url: "https://example.com/a", html: "<p>x</p>", title: "A", source: "extension" });
  });

  it("falls back to saving the link when the page is too large", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json(413, { ok: false, error: "too large" }))
      .mockResolvedValueOnce(json(201, { ok: true, message: "Saved to Read Later" }));
    const outcome = await sendSave(settings, { url: "https://example.com/a", html: "x".repeat(10) }, fetchImpl);
    expect(outcome.ok).toBe(true);
    expect(outcome.message).toMatch(/link only/);
    expect(JSON.parse(String((fetchImpl.mock.calls[1] as [string, RequestInit])[1].body))).not.toHaveProperty("html");
  });

  it("explains failures", async () => {
    const unauthorized = vi.fn(async () => json(401, { ok: false, error: "Missing or invalid access token." }));
    expect(await sendSave(settings, { url: "https://example.com" }, unauthorized)).toEqual({
      ok: false,
      message: "Missing or invalid access token.",
    });
    const offline = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    expect((await sendSave(settings, { url: "https://example.com" }, offline)).message).toMatch(/Couldn’t reach/);
  });

  it("asks for setup when the URL or token is missing", async () => {
    const fetchImpl = vi.fn();
    const outcome = await sendSave({ serverUrl: "", token: "" }, { url: "https://example.com" }, fetchImpl);
    expect(outcome.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("checkConnection", () => {
  it("checks the token with a GET", async () => {
    const fetchImpl = vi.fn(async () => json(200, { ok: true, message: "Connected to Read Later" }));
    expect(await checkConnection(settings, fetchImpl)).toEqual({ ok: true, message: "Connected to Read Later" });
    expect((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].method).toBeUndefined();
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
});
