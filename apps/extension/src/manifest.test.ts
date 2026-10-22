import { describe, expect, it } from "vitest";
import { FIREFOX_ID, manifest } from "../manifest.mjs";

const info = { name: "Read Later", shortName: "Read Later", version: "0.1.0" };

describe("manifest", () => {
  it("runs the background script as a service worker in Chrome", () => {
    const chrome = manifest("chrome", info);
    expect(chrome.background).toEqual({ service_worker: "background.js", type: "module" });
    expect(chrome).not.toHaveProperty("browser_specific_settings");
  });

  it("gives Firefox an event page, a fixed ID and the data it sends", () => {
    const firefox = manifest("firefox", info);
    expect(firefox.background).toEqual({ scripts: ["background.js"], type: "module" });
    expect(firefox.browser_specific_settings.gecko).toEqual({
      id: FIREFOX_ID,
      strict_min_version: "140.0",
      data_collection_permissions: { required: ["browsingActivity", "websiteContent"] },
    });
    expect(firefox.browser_specific_settings.gecko_android).toEqual({ strict_min_version: "142.0" });
    // Everything else is the same in both browsers.
    const { background: _b, browser_specific_settings: _s, ...rest } = firefox;
    const { background: _c, ...chromeRest } = manifest("chrome", info);
    expect(rest).toEqual(chromeRest);
  });
});
