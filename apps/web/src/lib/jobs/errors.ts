/** A job failure. `retryable` decides whether the queue tries again later. */
export class JobError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly stopReason: string | null = null,
  ) {
    super(message);
    this.name = "JobError";
  }
}
