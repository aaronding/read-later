import { createTranslator } from "next-intl";
import { loadMessages, type Messages } from "./messages";

// Background jobs save errors and "Preview only" reasons long before anyone
// reads them, without knowing the reader's language. So they save a message
// key from the Errors namespace and its values, and the page translates it
// when it is shown. The English text is saved too, for logs and for rows
// written before keys were stored.

export type MessageValues = Record<string, string | number>;

export interface StoredMessage {
  /** A key in the Errors namespace. */
  key: string;
  values?: MessageValues;
}

/** A translator for the Errors namespace, from getTranslations("Errors") or useTranslations("Errors"). */
export type ErrorsTranslator = ReturnType<typeof createTranslator<Messages, "Errors">>;

// Stored keys aren't known to the compiler, so they are checked at runtime with has().
interface UntypedTranslator {
  (key: string, values?: MessageValues): string;
  has(key: string): boolean;
}

/** The stored message in the reader's language, or the saved English text for older rows. */
export function storedMessageText(
  t: ErrorsTranslator,
  message: StoredMessage | null | undefined,
  fallback: string | null,
): string | null {
  const translate = t as unknown as UntypedTranslator;
  if (message && translate.has(message.key)) return translate(message.key, message.values ?? {});
  return fallback;
}

/** The English text of a stored message, for the text columns and the logs. */
export async function englishText(message: StoredMessage): Promise<string> {
  const t = createTranslator({ locale: "en", messages: await loadMessages("en"), namespace: "Errors" });
  return storedMessageText(t, message, null) ?? message.key;
}
