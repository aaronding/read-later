import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { envInt, envString } from "@/config/env";
import { MODEL_INFO, estimateCostUsd, type SummaryModel } from "@/config/models";
import type { StoredMessage } from "@/i18n/stored-message";
import { errorMessage, type ErrorKey } from "@/lib/error-message";
import {
  SUMMARY_JSON_SCHEMA,
  SUMMARY_SYSTEM_PROMPT,
  buildUserMessage,
  prepareArticleText,
  type PromptArticle,
} from "./prompt";

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";
const EFFORTS: readonly Effort[] = ["low", "medium", "high", "xhigh", "max"];

/** Summaries are short, simple output; low effort keeps them fast and cheap. */
export function summaryEffort(): Effort {
  const value = envString("SUMMARY_EFFORT", "low") as Effort;
  return EFFORTS.includes(value) ? value : "low";
}

/** Generous: about 50K tokens of English. Longer articles are marked partial. */
export function maxInputChars(): number {
  return envInt("SUMMARY_MAX_INPUT_CHARS", 200_000);
}

// Room for adaptive thinking as well as the JSON reply.
const MAX_TOKENS = 16_000;

// The SDK's own timeout stops counting once a streamed response starts, so
// each call also gets an overall limit. It keeps one attempt inside a
// 300-second serverless function, after the page download.
function callTimeoutMs(): number {
  return envInt("SUMMARY_TIMEOUT_MS", 150_000);
}

let client: Anthropic | undefined;

function getClient(): Anthropic {
  // Reads ANTHROPIC_API_KEY from the environment.
  // One SDK retry; the job queue retries again later with backoff.
  client ??= new Anthropic({ maxRetries: 1, timeout: 90_000 });
  return client;
}

/** Tests swap in a fake client. */
export function setAnthropicClient(fake: Anthropic | undefined): void {
  client = fake;
}

/** A summary attempt that failed. `retryable` says whether a later try may work. */
export class SummaryError extends Error {
  constructor(
    /** What went wrong, as a message in the Errors namespace. */
    readonly storedMessage: StoredMessage,
    readonly retryable: boolean,
    readonly stopReason: string | null = null,
  ) {
    super(storedMessage.key);
    this.name = "SummaryError";
  }
}

const SummaryOutput = z.object({
  language: z.string().optional(),
  tldr: z.string().trim().min(1),
  key_points: z.array(z.string()).min(1),
  suggested_tags: z.array(z.string()).default([]),
});

export interface SummaryResult {
  model: SummaryModel;
  servedModel: string;
  effort: Effort;
  language: string | null;
  tldr: string;
  keyPoints: string[];
  suggestedTags: string[];
  inputTokens: number;
  outputTokens: number;
  costUsd: number | null;
  durationMs: number;
  stopReason: string | null;
  partial: boolean;
  inputChars: number;
  totalChars: number;
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    const key = trimmed.toLowerCase();
    if (trimmed && !seen.has(key)) {
      seen.add(key);
      out.push(trimmed);
    }
  }
  return out;
}

/**
 * Token use and cost across every attempt in the response. With refusal
 * fallbacks, usage.iterations lists the declined attempt and the fallback
 * model's answer separately, each with its own model and price. Counting all
 * of them gives an upper estimate.
 */
function usageTotals(message: Anthropic.Beta.BetaMessage, requested: SummaryModel) {
  const iterations = message.usage.iterations?.filter(
    (entry): entry is Anthropic.Beta.BetaMessageIterationUsage | Anthropic.Beta.BetaFallbackMessageIterationUsage =>
      entry.type === "message" || entry.type === "fallback_message",
  );
  const attempts = iterations?.length
    ? iterations.map((entry) => ({
        model: entry.model ?? requested,
        input: entry.input_tokens + entry.cache_read_input_tokens + entry.cache_creation_input_tokens,
        output: entry.output_tokens,
      }))
    : [
        {
          model: message.model ?? requested,
          input:
            message.usage.input_tokens +
            (message.usage.cache_read_input_tokens ?? 0) +
            (message.usage.cache_creation_input_tokens ?? 0),
          output: message.usage.output_tokens,
        },
      ];
  let cost: number | null = 0;
  for (const attempt of attempts) {
    const part = estimateCostUsd(attempt.model, attempt.input, attempt.output);
    cost = cost === null || part === null ? null : cost + part;
  }
  return {
    inputTokens: attempts.reduce((sum, a) => sum + a.input, 0),
    outputTokens: attempts.reduce((sum, a) => sum + a.output, 0),
    costUsd: cost,
  };
}

/** True for API failures that may work on a later attempt. */
export function isRetryableApiError(error: unknown): boolean {
  // Most specific first.
  if (error instanceof Anthropic.APIUserAbortError) return false;
  if (error instanceof Anthropic.APIConnectionError) return true; // includes timeouts
  if (error instanceof Anthropic.RateLimitError) return true;
  if (error instanceof Anthropic.InternalServerError) return true; // 5xx, including 529 overloaded
  if (error instanceof Anthropic.ConflictError) return true;
  // An error event in the middle of a stream comes without an HTTP status,
  // and the SDK doesn't retry it.
  if (error instanceof Anthropic.APIError && error.status === undefined && error.type && TRANSIENT_STREAM_ERRORS.has(error.type)) {
    return true;
  }
  if (error instanceof Anthropic.APIError) return false; // 400, 401, 403, 404, 422
  return false;
}

const TRANSIENT_STREAM_ERRORS = new Set(["overloaded_error", "api_error", "rate_limit_error", "timeout_error"]);

// The reader, the lists and Compare show the error, so it stays short.
const MAX_ERROR_DETAIL = 300;

// Product names go into the messages as values, so they are never translated.
const CLAUDE = { claude: "Claude" };

/** The messages for each way a request can fail, so they can name what was being done. */
export interface FailureMessages {
  declined: ErrorKey;
  declinedCategory: ErrorKey;
  cutOff: ErrorKey;
  tooLong: ErrorKey;
  empty: ErrorKey;
  badFormat: ErrorKey;
  apiKeyRejected: ErrorKey;
  apiKeyRejectedWithDetail: ErrorKey;
}

const SUMMARY_FAILURES: FailureMessages = {
  declined: "summary.declined",
  declinedCategory: "summary.declinedCategory",
  cutOff: "summary.cutOff",
  tooLong: "summary.tooLong",
  empty: "summary.empty",
  badFormat: "summary.badFormat",
  apiKeyRejected: "summary.apiKeyRejected",
  apiKeyRejectedWithDetail: "summary.apiKeyRejectedWithDetail",
};

/**
 * The error as the reader, the lists and Compare show it. The SDK's own
 * message is the status followed by the raw body (JSON, or a proxy's HTML
 * page), so only the API's own message is kept, and a refused key says what
 * to do about it.
 */
export function describeApiError(
  error: InstanceType<typeof Anthropic.APIError>,
  failures: FailureMessages = SUMMARY_FAILURES,
): StoredMessage {
  const body = error.error as { error?: { message?: unknown } } | undefined;
  const apiMessage = typeof body?.error?.message === "string" ? body.error.message.slice(0, MAX_ERROR_DETAIL) : null;
  if (error instanceof Anthropic.AuthenticationError) {
    const values = { ...CLAUDE, variable: "ANTHROPIC_API_KEY", vercel: "Vercel" };
    return apiMessage
      ? errorMessage(failures.apiKeyRejectedWithDetail, { ...values, detail: apiMessage })
      : errorMessage(failures.apiKeyRejected, values);
  }
  if (error.status === undefined) {
    const detail = apiMessage ?? error.message.slice(0, MAX_ERROR_DETAIL);
    return errorMessage("summary.apiError", { ...CLAUDE, detail });
  }
  const status = String(error.status);
  return apiMessage
    ? errorMessage("summary.apiErrorStatusWithDetail", { ...CLAUDE, status, detail: apiMessage })
    : errorMessage("summary.apiErrorStatus", { ...CLAUDE, status });
}

export interface ClaudeRequest {
  model: SummaryModel;
  system: string;
  user: string;
  /** The JSON schema the answer must follow. */
  schema: Record<string, unknown>;
  failures: FailureMessages;
  /**
   * Called with what each answer used, before it is checked, so a refused or
   * unusable answer counts too, and with what a stream used before it broke
   * off (a time-out, an error mid-answer). Not called when the request got no
   * answer at all.
   */
  onAnswer: (usage: ClaudeUsage) => Promise<void>;
}

/** What one answer from Claude used. */
export interface ClaudeUsage {
  servedModel: string;
  effort: Effort;
  inputTokens: number;
  outputTokens: number;
  costUsd: number | null;
  durationMs: number;
  stopReason: string | null;
}

export interface ClaudeAnswer extends ClaudeUsage {
  /** The answer's JSON, not yet checked beyond the schema. */
  json: unknown;
}

/**
 * One request for structured JSON, as summaries and their translations make:
 * streamed, with adaptive thinking, an overall time limit and, where the model
 * has one, the server-side refusal fallback. Failures become SummaryErrors
 * with the request's own messages.
 */
export async function askClaude({ model, system, user, schema, failures, onAnswer }: ClaudeRequest): Promise<ClaudeAnswer> {
  const effort = summaryEffort();
  const started = Date.now();

  const usageOf = (answer: Anthropic.Beta.BetaMessage): ClaudeUsage => ({
    servedModel: answer.model ?? model,
    effort,
    ...usageTotals(answer, model),
    durationMs: Date.now() - started,
    stopReason: answer.stop_reason ?? null,
  });

  let message: Anthropic.Beta.BetaMessage;
  const signal = AbortSignal.timeout(callTimeoutMs());
  let stream: { currentMessage?: Anthropic.Beta.BetaMessage } | undefined;
  try {
    const opened = getClient().beta.messages.stream({
      model,
      max_tokens: MAX_TOKENS,
      system,
      messages: [{ role: "user", content: user }],
      thinking: { type: "adaptive" },
      output_config: { effort, format: { type: "json_schema", schema } },
      // Opus 5.5 and Sonnet 5.5: if a safety classifier declines the request,
      // the API retries it on Anthropic's recommended fallback model. Haiku 5.5
      // has no server-side fallback, so the parameter is left off.
      ...(MODEL_INFO[model].serverFallback
        ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
        : {}),
    }, { signal });
    stream = opened;
    message = await opened.finalMessage();
  } catch (error) {
    // A stream that had begun reached Claude, and what it used so far counts.
    const partial = stream?.currentMessage;
    if (partial) await onAnswer(usageOf(partial));
    if (signal.aborted) {
      throw new SummaryError(errorMessage("summary.timeout", CLAUDE), true);
    }
    if (error instanceof Anthropic.APIError) {
      throw new SummaryError(describeApiError(error, failures), isRetryableApiError(error));
    }
    throw error;
  }

  const usage = usageOf(message);
  await onAnswer(usage);

  // Check why the model stopped before reading any content.
  if (message.stop_reason === "refusal") {
    const category = message.stop_details?.category;
    throw new SummaryError(
      category ? errorMessage(failures.declinedCategory, { ...CLAUDE, category }) : errorMessage(failures.declined, CLAUDE),
      false,
      "refusal",
    );
  }
  if (message.stop_reason === "max_tokens") {
    // The same request would most likely stop the same way, so this isn't
    // retried automatically; Retry in the app tries again on purpose.
    throw new SummaryError(errorMessage(failures.cutOff), false, "max_tokens");
  }
  if (message.stop_reason === "model_context_window_exceeded") {
    throw new SummaryError(errorMessage(failures.tooLong), false, message.stop_reason);
  }

  // After a refusal fallback, content holds the declined model's partial
  // answer, a "fallback" marker, then the fallback model's answer: read only
  // what follows the last marker.
  const lastFallback = message.content.findLastIndex((block) => block.type === "fallback");
  const text = message.content.slice(lastFallback + 1).find((block) => block.type === "text");
  if (!text || text.type !== "text") {
    throw new SummaryError(errorMessage(failures.empty, CLAUDE), true, message.stop_reason);
  }
  let json: unknown;
  try {
    json = JSON.parse(text.text);
  } catch {
    throw new SummaryError(errorMessage(failures.badFormat, CLAUDE), true, message.stop_reason);
  }
  return { json, ...usage };
}

export interface SummarizeInput {
  model: SummaryModel;
  article: PromptArticle;
  existingTags: string[];
  onAnswer: ClaudeRequest["onAnswer"];
}

export async function summarizeArticle({ model, article, existingTags, onAnswer }: SummarizeInput): Promise<SummaryResult> {
  const prepared = prepareArticleText(article.text, maxInputChars());
  const answer = await askClaude({
    model,
    system: SUMMARY_SYSTEM_PROMPT,
    user: buildUserMessage(article, prepared, existingTags),
    schema: SUMMARY_JSON_SCHEMA,
    failures: SUMMARY_FAILURES,
    onAnswer,
  });
  const parsed = SummaryOutput.safeParse(answer.json);
  if (!parsed.success) {
    throw new SummaryError(errorMessage("summary.badFormat", CLAUDE), true, answer.stopReason);
  }
  const { json: _json, ...call } = answer;

  return {
    model,
    ...call,
    language: parsed.data.language?.trim() || null,
    tldr: parsed.data.tldr.trim(),
    // The schema can't enforce the counts, so they are enforced here.
    keyPoints: dedupe(parsed.data.key_points).slice(0, 5),
    suggestedTags: dedupe(parsed.data.suggested_tags.map((tag) => tag.replace(/^#/, ""))).slice(0, 3),
    // Covers only part of the article: cut for length, or only a preview was saved.
    partial: prepared.partial || Boolean(article.previewOnly),
    inputChars: prepared.inputChars,
    totalChars: prepared.totalChars,
  };
}
