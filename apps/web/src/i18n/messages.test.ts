import { readFileSync } from "node:fs";
import { TYPE, parse, type MessageFormatElement } from "@formatjs/icu-messageformat-parser";
import { describe, expect, it } from "vitest";
import { LOCALES } from "./locales";
import { NAMESPACES } from "./messages";

// Every translation has every English message, with the same arguments,
// plural and select options and rich-text tags, so nothing falls back to
// English and no value or link goes missing in another language.

type Tree = { [key: string]: string | Tree };

function read(locale: string, namespace: string): Tree {
  const file = new URL(`../../messages/${locale}/${namespace}.json`, import.meta.url);
  return JSON.parse(readFileSync(file, "utf8")) as Tree;
}

function flatten(tree: Tree, prefix = ""): Record<string, string> {
  return Object.fromEntries(
    Object.entries(tree).flatMap(([key, value]) =>
      typeof value === "string" ? [[prefix + key, value]] : Object.entries(flatten(value, `${prefix}${key}.`)),
    ),
  );
}

/** What a message needs from the code: its arguments, their kinds, select options and tags. */
function shape(message: string): string[] {
  const found = new Set<string>();
  const walk = (elements: MessageFormatElement[]) => {
    for (const element of elements) {
      switch (element.type) {
        case TYPE.argument:
          found.add(`{${element.value}}`);
          break;
        case TYPE.number:
        case TYPE.date:
        case TYPE.time:
          found.add(`{${element.value}, ${TYPE[element.type]}}`);
          break;
        case TYPE.plural:
          found.add(`{${element.value}, plural}`);
          for (const option of Object.values(element.options)) walk(option.value);
          break;
        case TYPE.select:
          found.add(`{${element.value}, select: ${Object.keys(element.options).sort().join(" ")}}`);
          for (const option of Object.values(element.options)) walk(option.value);
          break;
        case TYPE.tag:
          found.add(`<${element.value}>`);
          walk(element.children);
          break;
      }
    }
  };
  walk(parse(message));
  return [...found].sort();
}

function pluralsHaveOther(message: string): boolean {
  const check = (elements: MessageFormatElement[]): boolean =>
    elements.every((element) => {
      if (element.type === TYPE.plural || element.type === TYPE.select) {
        return "other" in element.options && Object.values(element.options).every((option) => check(option.value));
      }
      return element.type === TYPE.tag ? check(element.children) : true;
    });
  return check(parse(message));
}

const english = Object.fromEntries(NAMESPACES.map((namespace) => [namespace, flatten(read("en", namespace))]));

describe("the English messages", () => {
  it("parse, and every plural and select has an other case", () => {
    for (const [namespace, messages] of Object.entries(english)) {
      for (const [key, message] of Object.entries(messages)) {
        expect(pluralsHaveOther(message), `${namespace}.${key}`).toBe(true);
      }
    }
  });
});

describe.each(LOCALES.filter((locale) => locale !== "en"))("%s", (locale) => {
  it.each(NAMESPACES)("%s has every English message, with the same arguments and tags", (namespace) => {
    const translated = flatten(read(locale, namespace));
    expect(Object.keys(translated).sort()).toEqual(Object.keys(english[namespace]!).sort());
    for (const [key, message] of Object.entries(translated)) {
      const where = `${locale} ${namespace}.${key}`;
      expect(message.trim(), where).not.toBe("");
      expect(shape(message), where).toEqual(shape(english[namespace]![key]!));
      expect(pluralsHaveOther(message), where).toBe(true);
      // An ASCII apostrophe starts an escape in ICU messages and can swallow a value.
      expect(message, where).not.toContain("'");
    }
  });
});
