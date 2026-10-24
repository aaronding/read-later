import { z } from "zod";
import type { SummaryModel } from "@/config/models";
import { errorMessage } from "@/lib/error-message";
import type { TranslationLanguage } from "./languages";
import { SummaryError, askClaude, type ClaudeAnswer, type ClaudeRequest, type FailureMessages } from "./summarize";
import {
  TRANSLATION_JSON_SCHEMA,
  TRANSLATION_SYSTEM_PROMPT,
  buildTranslationMessage,
  type SummaryToTranslate,
} from "./translation-prompt";

const TranslationOutput = z.object({
  tldr: z.string().trim().min(1),
  key_points: z.array(z.string().trim().min(1)),
});

const TRANSLATION_FAILURES: FailureMessages = {
  declined: "translation.declined",
  declinedCategory: "translation.declinedCategory",
  cutOff: "translation.cutOff",
  tooLong: "translation.tooLong",
  empty: "translation.empty",
  badFormat: "translation.badFormat",
  apiKeyRejected: "translation.apiKeyRejected",
  apiKeyRejectedWithDetail: "translation.apiKeyRejectedWithDetail",
};

export interface TranslationResult extends Omit<ClaudeAnswer, "json"> {
  tldr: string;
  keyPoints: string[];
}

export interface TranslateInput {
  /** The model that wrote the summary, which translates it too. */
  model: SummaryModel;
  summary: SummaryToTranslate;
  target: TranslationLanguage;
  onAnswer: ClaudeRequest["onAnswer"];
}

export async function translateSummary({ model, summary, target, onAnswer }: TranslateInput): Promise<TranslationResult> {
  const { json, ...call } = await askClaude({
    model,
    system: TRANSLATION_SYSTEM_PROMPT,
    user: buildTranslationMessage(summary, target),
    schema: TRANSLATION_JSON_SCHEMA,
    failures: TRANSLATION_FAILURES,
    onAnswer,
  });
  const parsed = TranslationOutput.safeParse(json);
  // A point missing or added would no longer line up with the original's.
  if (!parsed.success || parsed.data.key_points.length !== summary.keyPoints.length) {
    throw new SummaryError(errorMessage("translation.badFormat"), true, call.stopReason);
  }
  return { ...call, tldr: parsed.data.tldr, keyPoints: parsed.data.key_points };
}
