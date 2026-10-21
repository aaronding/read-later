import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "./redirects";

describe("safeRedirectPath", () => {
  it("keeps same-site paths", () => {
    expect(safeRedirectPath("/articles/123?x=1#top")).toBe("/articles/123?x=1#top");
    expect(safeRedirectPath("/share?url=https%3A%2F%2Fexample.com")).toBe("/share?url=https%3A%2F%2Fexample.com");
  });

  it("refuses anything a browser would send to another site", () => {
    for (const value of ["//evil.com", "/\\evil.com", "/\t/evil.com", "/\n/evil.com", "https://evil.com", "evil.com", "", null]) {
      expect(safeRedirectPath(value), String(value)).toBe("/inbox");
    }
  });
});
