import "server-only";
import { cache } from "react";
import { getDb } from "@/db";
import { DEFAULT_APPEARANCE, type Appearance } from "./appearance";
import { getCurrentUser } from "./auth";
import { getAppearance } from "./settings";

/** The signed-in user's appearance; signed out, the default. Looked up once per request. */
export const getSavedAppearance = cache(async (): Promise<Appearance> => {
  const user = await getCurrentUser();
  return user ? getAppearance(getDb(), user.id) : DEFAULT_APPEARANCE;
});
