import { useTranslations } from "next-intl";
import type { Appearance } from "@/lib/appearance";
import { AppearancePicker } from "./appearance-picker";

/**
 * The header's "Aa" button. It opens the appearance choices over the page,
 * so they can be tried out on the article being read. It uses the browser's
 * popover, which needs no script to open and close.
 */
export function AppearanceMenu({ saved }: { saved: Appearance }) {
  const t = useTranslations("Appearance");
  return (
    <>
      <button
        type="button"
        className="button ghost appearance-button"
        popoverTarget="appearance-menu"
        aria-label={t("title")}
        title={t("title")}
      >
        Aa
      </button>
      <div id="appearance-menu" popover="auto" role="dialog" aria-labelledby="appearance-menu-title" className="appearance-menu">
        <div className="appearance-menu-header">
          <h2 id="appearance-menu-title">{t("title")}</h2>
          <button type="button" className="button small" popoverTarget="appearance-menu" popoverTargetAction="hide">
            {t("done")}
          </button>
        </div>
        <AppearancePicker saved={saved} />
      </div>
    </>
  );
}
