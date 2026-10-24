import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { getDb } from "@/db";
import { DEFAULT_APPEARANCE, type Appearance } from "./appearance";
import { getCurrentUser } from "./auth";
import { getAppearance } from "./settings";
import { THEME_COOKIE, isThemeMode } from "./visitor-preferences";

/**
 * The signed-in user's appearance; signed out, the default with the theme
 * chosen on this browser, if any. Looked up once per request.
 */
export const getSavedAppearance = cache(async (): Promise<Appearance> => {
  const user = await getCurrentUser();
  if (user) return getAppearance(getDb(), user.id);
  const theme = (await cookies()).get(THEME_COOKIE)?.value;
  return isThemeMode(theme) ? { ...DEFAULT_APPEARANCE, theme } : DEFAULT_APPEARANCE;
});
