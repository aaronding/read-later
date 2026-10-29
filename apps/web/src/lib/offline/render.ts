// Kept articles are read offline without their pictures and other media,
// which come from the articles' own sites (decision 155). A figure left with
// nothing to show goes too; one with a caption keeps it.

const MEDIA = "img, picture, video, audio, source, track, iframe, object, embed";

/** The article's HTML without media. Parsed in an inert document, so nothing loads. */
export function withoutMedia(html: string, parser: DOMParser = new DOMParser()): string {
  const doc = parser.parseFromString(`<!doctype html><body>${html}</body>`, "text/html");
  doc.body.querySelectorAll(MEDIA).forEach((element) => element.remove());
  doc.body.querySelectorAll("figure").forEach((figure) => {
    if (!figure.textContent?.trim()) figure.remove();
  });
  return doc.body.innerHTML;
}
