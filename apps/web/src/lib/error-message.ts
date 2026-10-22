import type { MessageKeys, NestedKeyOf } from "next-intl";
import type { Messages } from "@/i18n/messages";
import { storedMessageText, type ErrorsTranslator, type MessageValues, type StoredMessage } from "@/i18n/stored-message";

/** A key in the Errors namespace. */
export type ErrorKey = MessageKeys<Messages["Errors"], NestedKeyOf<Messages["Errors"]>>;

/** A message to show or save, with its key checked against the English messages. */
export function errorMessage(key: ErrorKey, values?: MessageValues): StoredMessage {
  return values ? { key, values } : { key };
}

/** A message from errorMessage() in the translator's language. */
export function translateError(t: ErrorsTranslator, message: StoredMessage): string {
  return storedMessageText(t, message, null) ?? message.key;
}
