import type { AppLocale } from "./locales";
import type { Messages } from "./messages";

// Types next-intl's functions: message keys and their arguments are checked
// against the English messages.
declare module "next-intl" {
  interface AppConfig {
    Locale: AppLocale;
    Messages: Messages;
  }
}
