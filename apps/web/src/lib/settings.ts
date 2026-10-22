import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { userAppearance, userSettings } from "@/db/schema";
import { SUMMARY_MODELS, initialDefaultModel, isSummaryModel, type SummaryModel } from "@/config/models";
import { toAppearance, type Appearance } from "./appearance";
import { isLocale, type AppLocale } from "@/i18n/locales";

export interface Settings {
  defaultModel: SummaryModel;
  comparisonMode: boolean;
  /** The interface language, or null to follow the browser. */
  locale: AppLocale | null;
}

export async function getSettings(db: Db, userId: string): Promise<Settings> {
  const [row] = await db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
  return {
    defaultModel: row && isSummaryModel(row.defaultModel) ? row.defaultModel : initialDefaultModel(),
    comparisonMode: row?.comparisonMode ?? false,
    locale: isLocale(row?.locale) ? row.locale : null,
  };
}

/**
 * Changes some settings and keeps the others. A setting never chosen stays
 * empty, so choosing a language doesn't fix the default model.
 */
export async function updateSettings(db: Db, userId: string, changes: Partial<Settings>): Promise<void> {
  await db.insert(userSettings).values({ userId, ...changes }).onConflictDoUpdate({ target: userSettings.userId, set: changes });
}

/** The user's appearance, or the default until they choose one. */
export async function getAppearance(db: Db, userId: string): Promise<Appearance> {
  const [row] = await db.select().from(userAppearance).where(eq(userAppearance.userId, userId)).limit(1);
  return toAppearance(row && { theme: row.theme, light: row.lightPalette, dark: row.darkPalette, font: row.font });
}

export async function saveAppearance(db: Db, userId: string, appearance: Appearance): Promise<void> {
  const values = { theme: appearance.theme, lightPalette: appearance.light, darkPalette: appearance.dark, font: appearance.font };
  await db
    .insert(userAppearance)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: userAppearance.userId, set: values });
}

/**
 * The models to run on a new save: the default first, then the others in
 * comparison mode, which only an admin can use.
 */
export function modelsForNewSave(settings: Settings, admin: boolean): SummaryModel[] {
  if (!admin || !settings.comparisonMode) return [settings.defaultModel];
  return [settings.defaultModel, ...SUMMARY_MODELS.filter((model) => model !== settings.defaultModel)];
}
