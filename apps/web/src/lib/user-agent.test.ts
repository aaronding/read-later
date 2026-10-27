import { describe, expect, it } from "vitest";
import { browserAndSystem } from "./user-agent";

describe("browserAndSystem", () => {
  it("names the browser and system the token is for", () => {
    const cases: [string, { browser?: string; system?: string }][] = [
      [
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:144.0) Gecko/20100101 Firefox/144.0",
        { browser: "Firefox", system: "macOS" },
      ],
      [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
        { browser: "Chrome", system: "Windows" },
      ],
      [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0",
        { browser: "Edge", system: "Windows" },
      ],
      [
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 OPR/122.0.0.0",
        { browser: "Opera", system: "Linux" },
      ],
      ["Mozilla/5.0 (Android 15; Mobile; rv:144.0) Gecko/144.0 Firefox/144.0", { browser: "Firefox", system: "Android" }],
      [
        "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
        { browser: "Chrome", system: "ChromeOS" },
      ],
    ];
    for (const [userAgent, expected] of cases) expect(browserAndSystem(userAgent), userAgent).toEqual(expected);
    expect(browserAndSystem(null)).toEqual({ browser: undefined, system: undefined });
  });
});
