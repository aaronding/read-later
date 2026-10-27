import { readdirSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { DISALLOWED_PATHS, PUBLIC_PAGES } from "./search-engines";

const disallowed = (path: string) => DISALLOWED_PATHS.some((prefix) => path.startsWith(prefix));

/** The first part of every route's path, looking inside route groups such as (app). */
function topSegments(dir = new URL("../app/", import.meta.url)): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => (entry.name.startsWith("(") ? topSegments(new URL(`${entry.name}/`, dir)) : [entry.name]));
}

describe("search engines", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("may read every public page", () => {
    for (const page of PUBLIC_PAGES) expect(disallowed(page), page).toBe(false);
  });

  it("are told about every part of the site", () => {
    // A new part of the site goes in the sitemap or is kept from crawlers.
    // The sign-in page says noindex itself.
    for (const segment of topSegments()) {
      const path = `/${segment}`;
      const listed = PUBLIC_PAGES.some((page) => page === path || page.startsWith(`${path}/`));
      expect(listed || disallowed(`${path}/`) || segment === "sign-in", path).toBe(true);
    }
  });

  it("find the sitemap and the pages on APP_URL", () => {
    vi.stubEnv("APP_URL", "https://www.example.com/");
    expect(robots().sitemap).toBe("https://www.example.com/sitemap.xml");
    expect(sitemap().map((entry) => entry.url)).toContain("https://www.example.com/help/safari");
  });
});
