import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { withoutMedia } from "./render";

const parser = new new JSDOM().window.DOMParser();

describe("withoutMedia", () => {
  it("leaves out pictures and media, and figures left empty", () => {
    const html =
      '<p>Before <img src="https://example.com/a.jpg" alt="A"> after.</p>' +
      '<figure><picture><source srcset="b.webp"><img src="b.jpg"></picture></figure>' +
      '<figure><img src="c.jpg"><figcaption>The harbor at dawn.</figcaption></figure>' +
      '<video src="d.mp4"></video><iframe src="https://example.com/embed"></iframe>';
    expect(withoutMedia(html, parser)).toBe(
      "<p>Before  after.</p><figure><figcaption>The harbor at dawn.</figcaption></figure>",
    );
  });

  it("keeps the text, links and structure as they are", () => {
    const html = '<h2>Heading</h2><p>A <a href="https://example.com">link</a> and <em>emphasis</em>.</p><ul><li>One</li></ul>';
    expect(withoutMedia(html, parser)).toBe(html);
  });
});
