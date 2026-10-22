import type { StoredMessage } from "@/i18n/stored-message";

/** A job failure. `retryable` decides whether the queue tries again later. */
export class JobError extends Error {
  constructor(
    /** What went wrong, as a message in the Errors namespace. */
    readonly storedMessage: StoredMessage,
    readonly retryable: boolean,
    readonly stopReason: string | null = null,
  ) {
    super(storedMessage.key);
    this.name = "JobError";
  }
}

/** What a handler records when its job fails. */
export interface JobFailure {
  message: StoredMessage;
  /** The same message in English, for the text columns. */
  text: string;
  willRetry: boolean;
  stopReason: string | null;
}
