import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { browserAndSystem, connectRedirect, parseConnectRequest } from "./extension-connect";

const chrome = "https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/";
// Firefox's address for the add-on ID in apps/extension/manifest.mjs.
const firefox = `https://${createHash("sha1").update("read-later@aaronding").digest("hex")}.extensions.allizom.org/`;
const state = "0123456789abcdef0123456789abcdef";

describe("parseConnectRequest", () => {
  it("accepts the redirect addresses of Chrome and Firefox", () => {
    expect(parseConnectRequest(chrome, state)).toEqual({ redirectUri: chrome, state });
    expect(parseConnectRequest(firefox, state)).toEqual({ redirectUri: firefox, state });
  });

  it("refuses any other address, so a token can't be sent where a website reads it", () => {
    for (const address of [
      "https://evil.example/",
      "http://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/",
      "https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org.evil.example/",
      "https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org:8443/",
      "https://user@abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/",
      `${chrome}?next=https://evil.example/`,
      `${chrome}#token=rl_planted`,
      "https://evil.chromiumapp.org/",
      "https://extensions.allizom.org/",
      "http://127.0.0.1/mozoauth2/5400b595a747cf6066be07c28cf7586573695ae0",
      "javascript:alert(1)",
      "",
    ]) {
      expect(parseConnectRequest(address, state), address).toBeNull();
    }
  });

  it("needs a state of reasonable length and characters", () => {
    expect(parseConnectRequest(chrome, "short")).toBeNull();
    expect(parseConnectRequest(chrome, `${state}&token=x`)).toBeNull();
    expect(parseConnectRequest(chrome, ["a", "b"])).toBeNull();
    expect(parseConnectRequest(chrome, undefined)).toBeNull();
  });
});

describe("connectRedirect", () => {
  it("puts the answer and the state in the fragment, which no server sees", () => {
    const request = { redirectUri: chrome, state };
    expect(connectRedirect(request, { token: "rl_abc-DEF_1" })).toBe(`${chrome}#token=rl_abc-DEF_1&state=${state}`);
    expect(connectRedirect(request, { error: "access_denied" })).toBe(`${chrome}#error=access_denied&state=${state}`);
  });
});

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
