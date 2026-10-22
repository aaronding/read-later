import "server-only";
import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { cache } from "react";
import { getDb } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { LOCALE_COOKIE, isLocale, preferredLocale, type AppLocale } from "./locales";
import { loadMessages } from "./messages";

// next-intl reads this once per request. The language isn't in the URL: it is
// the signed-in user's choice in Settings, else the browser's own languages.
// Signed out, a cookie remembers the last choice made on this browser.

const savedLocale = cache(async (userId: string) => (await getSettings(getDb(), userId)).locale);

export async function requestLocale(): Promise<AppLocale> {
  const user = await getCurrentUser();
  const acceptLanguage = (await headers()).get("accept-language");
  if (user) return preferredLocale(await savedLocale(user.id), acceptLanguage);
  const remembered = (await cookies()).get(LOCALE_COOKIE)?.value;
  return preferredLocale(isLocale(remembered) ? remembered : null, acceptLanguage);
}

export default getRequestConfig(async ({ locale: requested }) => {
  const locale = isLocale(requested) ? requested : await requestLocale();
  return {
    locale,
    messages: await loadMessages(locale),
    // Dates are shown by LocalDate in the browser's own time zone; anything
    // formatted on the server uses UTC.
    timeZone: "UTC",
  };
});
