// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { capturePage } from "./capture";

describe("capturePage", () => {
  it("returns the page without script, style and noscript, and leaves the page alone", () => {
    document.head.innerHTML = `<style>p{color:red}</style><script>var tracking = 1;</script><link rel="canonical" href="https://example.com/story">`;
    document.title = "A story";
    document.body.innerHTML = `<article><p>Hello there.</p><noscript><img src="pixel.gif"></noscript><script>alert(1)</script></article>`;
    const result = capturePage();
    expect(result.title).toBe("A story");
    expect(result.url).toBe(document.URL);
    expect(result.html.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(result.html).toContain("<p>Hello there.</p>");
    expect(result.html).toContain('rel="canonical"');
    for (const removed of ["<script", "<style", "<noscript", "tracking", "pixel.gif"]) {
      expect(result.html).not.toContain(removed);
    }
    // The live page still has its scripts.
    expect(document.querySelectorAll("script")).toHaveLength(2);
  });
});
