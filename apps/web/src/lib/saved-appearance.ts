import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { APPEARANCE_COOKIE, parseAppearance, type Appearance } from "./appearance";

/** The appearance saved in this browser's cookie, or the default. */
export const getSavedAppearance = cache(async (): Promise<Appearance> => {
  return parseAppearance((await cookies()).get(APPEARANCE_COOKIE)?.value);
});
