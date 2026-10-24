import type about from "../../messages/en/About.json";
import type actions from "../../messages/en/Actions.json";
import type admin from "../../messages/en/Admin.json";
import type api from "../../messages/en/Api.json";
import type appearance from "../../messages/en/Appearance.json";
import type auth from "../../messages/en/Auth.json";
import type common from "../../messages/en/Common.json";
import type compare from "../../messages/en/Compare.json";
import type errorPages from "../../messages/en/ErrorPages.json";
import type errors from "../../messages/en/Errors.json";
import type exportMessages from "../../messages/en/Export.json";
import type folders from "../../messages/en/Folders.json";
import type guides from "../../messages/en/Guides.json";
import type help from "../../messages/en/Help.json";
import type home from "../../messages/en/Home.json";
import type library from "../../messages/en/Library.json";
import type privacy from "../../messages/en/Privacy.json";
import type reader from "../../messages/en/Reader.json";
import type settings from "../../messages/en/Settings.json";
import type share from "../../messages/en/Share.json";
import type status from "../../messages/en/Status.json";
import type summary from "../../messages/en/Summary.json";
import type tags from "../../messages/en/Tags.json";
import type triage from "../../messages/en/Triage.json";
import { DEFAULT_LOCALE, type AppLocale } from "./locales";

// The interface text lives in messages/<locale>/<Namespace>.json, one file per
// part of the app, each holding a single top-level key named after the file.
// English is the source; the other languages are translations of it.

export const NAMESPACES = [
  "About",
  "Actions",
  "Admin",
  "Api",
  "Appearance",
  "Auth",
  "Common",
  "Compare",
  "ErrorPages",
  "Errors",
  "Export",
  "Folders",
  "Guides",
  "Help",
  "Home",
  "Library",
  "Privacy",
  "Reader",
  "Settings",
  "Share",
  "Status",
  "Summary",
  "Tags",
  "Triage",
] as const;
export type Namespace = (typeof NAMESPACES)[number];

export type Messages = typeof about &
  typeof actions &
  typeof admin &
  typeof api &
  typeof appearance &
  typeof auth &
  typeof common &
  typeof compare &
  typeof errorPages &
  typeof errors &
  typeof exportMessages &
  typeof folders &
  typeof guides &
  typeof help &
  typeof home &
  typeof library &
  typeof privacy &
  typeof reader &
  typeof settings &
  typeof share &
  typeof status &
  typeof summary &
  typeof tags &
  typeof triage;

/**
 * The namespaces client components use. Only these are sent to the browser;
 * server components translate everything else before it leaves the server.
 */
export const CLIENT_NAMESPACES = [
  "About",
  "Appearance",
  "Auth",
  "Common",
  "ErrorPages",
  "Library",
  "Settings",
] as const satisfies readonly Namespace[];

type Tree = { [key: string]: string | Tree };

/** Fills what a translation is missing from English, so a gap shows English text rather than a key. */
function withFallback(primary: Tree, fallback: Tree): Tree {
  const merged: Tree = { ...fallback };
  for (const [key, value] of Object.entries(primary)) {
    const base = fallback[key];
    merged[key] = typeof value === "object" && typeof base === "object" ? withFallback(value, base) : value;
  }
  return merged;
}

async function loadLocale(locale: AppLocale): Promise<Tree> {
  const parts = await Promise.all(
    NAMESPACES.map((namespace) =>
      import(`../../messages/${locale}/${namespace}.json`).then((module: { default: Tree }) => module.default),
    ),
  );
  return Object.assign({}, ...parts) as Tree;
}

const cache = new Map<AppLocale, Promise<Messages>>();

/** All of a language's messages, with English filling any gaps. */
export function loadMessages(locale: AppLocale): Promise<Messages> {
  let messages = cache.get(locale);
  if (!messages) {
    messages =
      locale === DEFAULT_LOCALE
        ? (loadLocale(locale) as Promise<Messages>)
        : Promise.all([loadLocale(locale), loadLocale(DEFAULT_LOCALE)]).then(
            ([primary, fallback]) => withFallback(primary, fallback) as Messages,
          );
    cache.set(locale, messages);
  }
  return messages;
}

/** Only the given namespaces, for the client. */
export function pickNamespaces(messages: Messages, namespaces: readonly Namespace[]): Partial<Messages> {
  return Object.fromEntries(namespaces.map((namespace) => [namespace, messages[namespace]])) as Partial<Messages>;
}
