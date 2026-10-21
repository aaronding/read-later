import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { userSettings } from "@/db/schema";
import { SUMMARY_MODELS, initialDefaultModel, isSummaryModel, type SummaryModel } from "@/config/models";

export interface Settings {
  defaultModel: SummaryModel;
  comparisonMode: boolean;
}

export async function getSettings(db: Db, userId: string): Promise<Settings> {
  const [row] = await db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
  return {
    defaultModel: row && isSummaryModel(row.defaultModel) ? row.defaultModel : initialDefaultModel(),
    comparisonMode: row?.comparisonMode ?? false,
  };
}

export async function updateSettings(db: Db, userId: string, settings: Settings): Promise<void> {
  await db
    .insert(userSettings)
    .values({ userId, ...settings })
    .onConflictDoUpdate({ target: userSettings.userId, set: settings });
}

/** The models to run on a new save: the default first, then the others in comparison mode. */
export function modelsForNewSave(settings: Settings): SummaryModel[] {
  if (!settings.comparisonMode) return [settings.defaultModel];
  return [settings.defaultModel, ...SUMMARY_MODELS.filter((model) => model !== settings.defaultModel)];
}
