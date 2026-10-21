import { describe, expect, it } from "vitest";
import { shareNeedsConfirmation, sharedUrl } from "./share";

describe("Android shares", () => {
  it("finds the link in url, text or title", () => {
    expect(sharedUrl(new URLSearchParams({ url: "https://example.com/a" }))).toBe("https://example.com/a");
    expect(sharedUrl(new URLSearchParams({ text: "Look: https://example.com/b" }))).toBe("https://example.com/b");
    expect(sharedUrl(new URLSearchParams({ title: "https://example.com/c" }))).toBe("https://example.com/c");
    expect(sharedUrl(new URLSearchParams({ text: "no link" }))).toBeNull();
  });

  it("asks before saving when another site sent the browser", () => {
    expect(shareNeedsConfirmation(new Headers({ "sec-fetch-site": "none" }))).toBe(false);
    expect(shareNeedsConfirmation(new Headers({ "sec-fetch-site": "same-origin" }))).toBe(false);
    expect(shareNeedsConfirmation(new Headers())).toBe(false);
    expect(shareNeedsConfirmation(new Headers({ "sec-fetch-site": "cross-site" }))).toBe(true);
    expect(shareNeedsConfirmation(new Headers({ "sec-fetch-site": "same-site" }))).toBe(true);
  });
});
