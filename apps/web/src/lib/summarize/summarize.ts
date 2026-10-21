import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { envInt, envString } from "@/config/env";
import { MODEL_INFO, estimateCostUsd, type SummaryModel } from "@/config/models";
import {
  SUMMARY_JSON_SCHEMA,
  SUMMARY_SYSTEM_PROMPT,
  buildUserMessage,
  prepareArticleText,
  type PromptArticle,
} from "./prompt";

type Effort = "low" | "medium" | "high" | "xhigh" | "max";
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
    message: string,
    readonly retryable: boolean,
    readonly stopReason: string | null = null,
  ) {
    super(message);
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
  if (error instanceof Anthropic.APIError) return false; // 400, 401, 403, 404, 422
  return false;
}

export interface SummarizeInput {
  model: SummaryModel;
  article: PromptArticle;
  existingTags: string[];
}

export async function summarizeArticle({ model, article, existingTags }: SummarizeInput): Promise<SummaryResult> {
  const prepared = prepareArticleText(article.text, maxInputChars());
  const effort = summaryEffort();
  const started = Date.now();

  let message: Anthropic.Beta.BetaMessage;
  const signal = AbortSignal.timeout(callTimeoutMs());
  try {
    const stream = getClient().beta.messages.stream({
      model,
      max_tokens: MAX_TOKENS,
      system: SUMMARY_SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserMessage(article, prepared, existingTags) }],
      thinking: { type: "adaptive" },
      output_config: { effort, format: { type: "json_schema", schema: SUMMARY_JSON_SCHEMA } },
      // Opus 5.5 and Sonnet 5.5: if a safety classifier declines the request,
      // the API retries it on Anthropic's recommended fallback model. Haiku 5.5
      // has no server-side fallback, so the parameter is left off.
      ...(MODEL_INFO[model].serverFallback
        ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
        : {}),
    }, { signal });
    message = await stream.finalMessage();
  } catch (error) {
    if (signal.aborted) {
      throw new SummaryError("Claude took too long to answer.", true);
    }
    if (error instanceof Anthropic.APIError) {
      throw new SummaryError(`Claude API error${error.status ? ` ${error.status}` : ""}: ${error.message}`, isRetryableApiError(error));
    }
    throw error;
  }

  const durationMs = Date.now() - started;
  const usage = usageTotals(message, model);

  // Check why the model stopped before reading any content.
  if (message.stop_reason === "refusal") {
    const category = message.stop_details?.category;
    throw new SummaryError(
      `Claude declined to summarize this article${category ? ` (${category.replace(/_/g, " ")})` : ""}.`,
      false,
      "refusal",
    );
  }
  if (message.stop_reason === "max_tokens") {
    // The same request would most likely stop the same way, so this isn't
    // retried automatically; Retry in the app tries again on purpose.
    throw new SummaryError("The summary was cut off before it was finished.", false, "max_tokens");
  }
  if (message.stop_reason === "model_context_window_exceeded") {
    throw new SummaryError("The article is too long for this model.", false, message.stop_reason);
  }

  // After a refusal fallback, content holds the declined model's partial
  // answer, a "fallback" marker, then the fallback model's answer: read only
  // what follows the last marker.
  const lastFallback = message.content.findLastIndex((block) => block.type === "fallback");
  const text = message.content.slice(lastFallback + 1).find((block) => block.type === "text");
  if (!text || text.type !== "text") {
    throw new SummaryError("Claude returned no summary.", true, message.stop_reason);
  }
  let parsed: z.infer<typeof SummaryOutput>;
  try {
    parsed = SummaryOutput.parse(JSON.parse(text.text));
  } catch {
    throw new SummaryError("Claude's summary was not in the expected format.", true, message.stop_reason);
  }

  return {
    model,
    servedModel: message.model ?? model,
    effort,
    language: parsed.language?.trim() || null,
    tldr: parsed.tldr.trim(),
    // The schema can't enforce the counts, so they are enforced here.
    keyPoints: dedupe(parsed.key_points).slice(0, 5),
    suggestedTags: dedupe(parsed.suggested_tags.map((tag) => tag.replace(/^#/, ""))).slice(0, 3),
    ...usage,
    durationMs,
    stopReason: message.stop_reason,
    // Covers only part of the article: cut for length, or only a preview was saved.
    partial: prepared.partial || Boolean(article.previewOnly),
    inputChars: prepared.inputChars,
    totalChars: prepared.totalChars,
  };
}
