import { envString } from "./env";

// The three models the owner wants to compare. Model IDs are exact; never
// add date suffixes.
export const SUMMARY_MODELS = ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"] as const;
export type SummaryModel = (typeof SUMMARY_MODELS)[number];

export interface ModelInfo {
  label: string;
  shortLabel: string;
  /**
   * Opus 5.5 and Sonnet 5.5 support server-side refusal fallback
   * (`fallbacks: "default"`); Haiku 5.5 does not, and a fallback list on it
   * is a 400.
   */
  serverFallback: boolean;
}

export const MODEL_INFO: Record<SummaryModel, ModelInfo> = {
  "claude-opus-5-5": { label: "Claude Opus 5.5", shortLabel: "Opus", serverFallback: true },
  "claude-sonnet-5-5": { label: "Claude Sonnet 5.5", shortLabel: "Sonnet", serverFallback: true },
  "claude-haiku-5-5": { label: "Claude Haiku 5.5", shortLabel: "Haiku", serverFallback: false },
};

export function isSummaryModel(value: unknown): value is SummaryModel {
  return typeof value === "string" && (SUMMARY_MODELS as readonly string[]).includes(value);
}

/** The default for new users, until they pick one in Settings. */
export function initialDefaultModel(): SummaryModel {
  const fromEnv = envString("DEFAULT_SUMMARY_MODEL", "claude-sonnet-5-5");
  return isSummaryModel(fromEnv) ? fromEnv : "claude-sonnet-5-5";
}

export function modelLabel(model: string): string {
  return isSummaryModel(model) ? MODEL_INFO[model].label : model;
}

// ---------------------------------------------------------------------------
// Prices in US dollars per million tokens, from Anthropic's published rates
// (October 2026). Used to estimate what each summary cost. Models other than
// the three above appear because a declined request can be answered by a
// fallback model.
// ---------------------------------------------------------------------------

interface Price {
  input: number;
  output: number;
  /** Haiku 5.5 charges more when the prompt is over 100K tokens. */
  longPrompt?: { overInputTokens: number; input: number; output: number };
}

const PRICES: Record<string, Price> = {
  "claude-opus-5-5": { input: 4, output: 20 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, longPrompt: { overInputTokens: 100_000, input: 0.5, output: 2.5 } },
  // Possible fallback models.
  "claude-opus-5": { input: 5, output: 25 },
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-sonnet-5": { input: 2, output: 10 },
};

/** Estimated cost in dollars, or null for a model without a known price. */
export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number | null {
  const price = PRICES[model];
  if (!price) return null;
  const rate = price.longPrompt && inputTokens > price.longPrompt.overInputTokens ? price.longPrompt : price;
  return (inputTokens * rate.input + outputTokens * rate.output) / 1_000_000;
}
