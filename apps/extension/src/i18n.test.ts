// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { DEFAULT_LOCALE, readCatalogues, withBrand } from "../locales.mjs";
import type { Outcome } from "./api";
import { localizePage, outcomeText, setRichText, type GetMessage } from "./i18n";

type Catalogue = Record<string, { message: string; placeholders?: Record<string, { content: string }> }>;

/** chrome.i18n.getMessage over a catalogue, as the browsers do it. */
function messagesFrom(catalogue: Catalogue): GetMessage {
  return (name, substitutions = []) => {
    const entry = catalogue[name];
    if (!entry) return "";
    const values = [substitutions].flat();
    const fill = (text: string) => text.replace(/\$(\d)/g, (_, n: string) => values[Number(n) - 1] ?? "");
    return entry.message.replace(/\$\$|\$(\w+)\$/g, (match, placeholder?: string) =>
      placeholder ? fill(entry.placeholders![placeholder.toLowerCase()]!.content) : "$",
    );
  };
}

const english = withBrand(readCatalogues()[DEFAULT_LOCALE], "ReadSooner") as Catalogue;
const getMessage = messagesFrom(english);
const text = (outcome: Outcome) => outcomeText(outcome, getMessage);

describe("outcomeText", () => {
  it("says what happened to a save", () => {
    expect(text({ ok: true, kind: "saved", linkOnly: false })).toBe("Saved to ReadSooner");
    expect(text({ ok: true, kind: "saved", linkOnly: true })).toBe(
      "Saved to ReadSooner (link only: the page was too large to send)",
    );
    expect(text({ ok: true, kind: "alreadySaved", linkOnly: false })).toBe("Already in ReadSooner, moved to the top");
    expect(text({ ok: true, kind: "refetching", linkOnly: false })).toBe("Already in ReadSooner, downloading it again");
    expect(text({ ok: true, kind: "alreadySaved", linkOnly: true })).toBe(
      "Already in ReadSooner, moved to the top (link only: the page was too large to send)",
    );
  });

  it("uses the server's own words for an outcome it doesn't know", () => {
    expect(text({ ok: true, kind: "saved", linkOnly: false, detail: "Queued" })).toBe("Queued");
    expect(text({ ok: true, kind: "saved", linkOnly: true, detail: "Queued" })).toBe(
      "Queued (link only: the page was too large to send)",
    );
  });

  it("explains the setup and the connection", () => {
    expect(text({ ok: true, kind: "connected" })).toBe("Connected to ReadSooner. You’re ready to save pages.");
    expect(text({ ok: false, kind: "notConfigured" })).toBe(
      "Open the extension’s options to connect it to your account.",
    );
    expect(text({ ok: false, kind: "unreachable", server: "https://read.example.com", detail: "Failed to fetch" })).toBe(
      "Couldn’t reach https://read.example.com: Failed to fetch",
    );
    expect(text({ ok: false, kind: "notTheApp", server: "https://example.com" })).toBe(
      "Something other than ReadSooner answered at https://example.com. Check the server URL.",
    );
  });

  it("puts the server's error codes in its own words, and falls back to the server's", () => {
    const failure = (code?: string, detail?: string): Outcome => ({ ok: false, kind: "server", code, detail, status: "401" });
    expect(text(failure("unauthorized", "Jeton manquant."))).toBe(
      "The access token doesn’t work any more; it may have been revoked. Open the extension’s options to connect again.",
    );
    expect(text(failure("too_large"))).toBe("The page is too large to save.");
    expect(text(failure("invalid_url"))).toBe("url must be an absolute http or https URL.");
    expect(text(failure("server_error"))).toBe("Something went wrong while saving. Please try again.");
    expect(text(failure("bad_request"))).toBe('Send JSON like {"url": "https://..."}, optionally with "html" and "title".');
    expect(text(failure("rate_limited", "Slow down."))).toBe("Slow down.");
    expect(text(failure(undefined, "Slow down."))).toBe("Slow down.");
    expect(text({ ok: false, kind: "server", status: "502 Bad Gateway" })).toBe("The server answered 502 Bad Gateway");
  });
});

describe("setRichText", () => {
  it("makes elements of <kbd> and <code> only", () => {
    const element = document.createElement("p");
    setRichText(element, "Press <kbd>Alt</kbd>+<kbd>S</kbd>, or see <code>about:addons</code>.");
    expect(element.innerHTML).toBe("Press <kbd>Alt</kbd>+<kbd>S</kbd>, or see <code>about:addons</code>.");

    setRichText(element, 'A <b>bold</b> <img src="x" onerror="alert(1)"> <kbd><i>key</i></kbd>');
    expect(element.children).toHaveLength(0);
    expect(element.textContent).toBe('A <b>bold</b> <img src="x" onerror="alert(1)"> <kbd><i>key</i></kbd>');
  });
});

describe("localizePage", () => {
  it("fills text, attributes and the page's language from the catalogue", () => {
    document.documentElement.lang = "";
    document.head.innerHTML = `<title data-i18n="optionsTitle"></title>`;
    document.body.innerHTML = `<label data-i18n="serverUrlLabel">Old</label>
      <input data-i18n-placeholder="tokenLabel" data-i18n-title="serverUrlHint" />`;
    localizePage(document, getMessage);
    expect(document.documentElement.lang).toBe("en");
    expect(document.title).toBe("ReadSooner options");
    expect(document.querySelector("label")!.textContent).toBe("Server URL");
    expect(document.querySelector("input")!.placeholder).toBe("Access token");
    expect(document.querySelector("input")!.title).toBe("The address of your ReadSooner web app.");
  });
});
