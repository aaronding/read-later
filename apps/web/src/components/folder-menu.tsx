import { useFormatter, useTranslations } from "next-intl";
import { moveToFolderAction } from "@/app/actions";
import { CheckIcon, CloseIcon } from "./icons";
import { SubmitButton } from "./submit-button";

/** The id the reader's Folder buttons open. */
export const FOLDER_MENU_ID = "folder-menu";

/**
 * The folders to move an article to, opened by the Folder button in either
 * of the reader's action bars: a panel in the middle of the screen, or a
 * sheet at the bottom on phones. Choosing a folder moves the article at once.
 * It uses the browser's popover, as the "Aa" menu does; browsers without
 * popovers show it as a plain section at the end of the article instead.
 */
export function FolderMenu({
  articleId,
  current,
  folders,
}: {
  articleId: string;
  current: string | null;
  folders: { id: string; name: string; count: number }[];
}) {
  const t = useTranslations("Folders");
  const format = useFormatter();
  const options = [{ id: "", name: t("noFolder"), count: null }, ...folders];
  return (
    // Keyed by the folder, so a move replaces the menu, closed and with the text box cleared.
    <div key={current ?? "none"} id={FOLDER_MENU_ID} popover="auto" role="dialog" aria-labelledby="folder-menu-title" className="folder-menu">
      <div className="folder-menu-header">
        <h2 id="folder-menu-title">{t("label")}</h2>
        <button
          type="button"
          className="button ghost folder-menu-close"
          popoverTarget={FOLDER_MENU_ID}
          popoverTargetAction="hide"
          aria-label={t("close")}
          title={t("close")}
        >
          <CloseIcon />
        </button>
      </div>
      <ul className="folder-options">
        {options.map((folder) => {
          const chosen = folder.id === (current ?? "");
          const content = (
            <>
              <span className="folder-option-check">{chosen && <CheckIcon />}</span>
              <span className="folder-option-name">{folder.name}</span>
              {folder.count !== null && <span className="muted small">{format.number(folder.count)}</span>}
            </>
          );
          return (
            <li key={folder.id || "none"}>
              {chosen ? (
                // The folder it is already in: choosing it only closes the menu.
                <button
                  type="button"
                  className="folder-option"
                  aria-current="true"
                  popoverTarget={FOLDER_MENU_ID}
                  popoverTargetAction="hide"
                >
                  {content}
                </button>
              ) : (
                <form action={moveToFolderAction}>
                  <input type="hidden" name="id" value={articleId} />
                  <input type="hidden" name="folderId" value={folder.id} />
                  <SubmitButton className="folder-option">{content}</SubmitButton>
                </form>
              )}
            </li>
          );
        })}
      </ul>
      <form action={moveToFolderAction} className="folder-new">
        <input type="hidden" name="id" value={articleId} />
        <label htmlFor="newFolder" className="visually-hidden">
          {t("newFolder")}
        </label>
        <input id="newFolder" name="newFolder" type="text" placeholder={t("newFolder")} maxLength={80} required />
        <SubmitButton className="button primary" pendingText={t("moving")}>
          {t("move")}
        </SubmitButton>
      </form>
    </div>
  );
}
