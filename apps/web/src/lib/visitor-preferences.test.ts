import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_APPEARANCE } from "./appearance";

// A visitor who isn't signed in chooses the language and theme at the top of the site,
// and cookies keep them. The session and cookies are faked.

const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
    delete: (name: string) => void jar.delete(name),
  }),
}));
vi.mock("next/cache", () => ({ refresh: () => {} }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => null, requireUser: async () => null, requireAdmin: async () => null, isAdmin: () => false }));

beforeEach(() => {
  jar.clear();
  vi.resetModules();
});

describe("a visitor's theme", () => {
  it("is the default until one is chosen, then the chosen one with the default palettes", async () => {
    const { getSavedAppearance } = await import("./saved-appearance");
    expect(await getSavedAppearance()).toEqual(DEFAULT_APPEARANCE);

    const { setVisitorThemeAction } = await import("@/app/actions");
    await setVisitorThemeAction("dark");
    expect(jar.get("theme")).toBe("dark");
    vi.resetModules();
    const fresh = await import("./saved-appearance");
    expect(await fresh.getSavedAppearance()).toEqual({ ...DEFAULT_APPEARANCE, theme: "dark" });
  });

  it("ignores a cookie it doesn't know and refuses an unknown theme", async () => {
    jar.set("theme", "neon");
    const { getSavedAppearance } = await import("./saved-appearance");
    expect(await getSavedAppearance()).toEqual(DEFAULT_APPEARANCE);
    const { setVisitorThemeAction } = await import("@/app/actions");
    await expect(setVisitorThemeAction("neon")).rejects.toThrow();
  });
});

describe("a visitor's language", () => {
  it("is remembered once chosen, and only one of the four", async () => {
    const { setVisitorLocaleAction } = await import("@/app/actions");
    await setVisitorLocaleAction("zh-Hant");
    expect(jar.get("locale")).toBe("zh-Hant");
    await expect(setVisitorLocaleAction("auto")).rejects.toThrow();
    await expect(setVisitorLocaleAction("de")).rejects.toThrow();
    expect(jar.get("locale")).toBe("zh-Hant");
  });
});
