import { useTranslations } from "next-intl";
import { archiveAction, deleteAction, favoriteAction, readAction } from "@/app/actions";
import { ConfirmButton } from "./confirm-button";
import { FOLDER_MENU_ID } from "./folder-menu";
import { ArchiveIcon, FolderIcon, InboxIcon, StarIcon, TrashIcon, UnreadIcon } from "./icons";
import { LeavingForm } from "./reader-navigation";
import { SubmitButton } from "./submit-button";

/**
 * The reader's actions, the same bar under the title and at the end of the
 * article. Buttons show an icon and a label, or only the icon on phones,
 * where the label is still read out. Archive, Mark unread and Delete are done
 * with the article and go back to its list; Favorite, Folder and Move to
 * Inbox stay.
 */
export function ReaderActions({
  article,
  folderName,
  back,
}: {
  article: { id: string; archivedAt: Date | null; favorite: boolean };
  folderName: string | null;
  /** The list to go back to. */
  back: string;
}) {
  const t = useTranslations("Reader");
  const tCommon = useTranslations("Common");
  const tFolders = useTranslations("Folders");
  return (
    <div className="reader-actions" role="group" aria-label={t("actionsLabel")}>
      {article.archivedAt ? (
        <form action={archiveAction} className="inline-form">
          <input type="hidden" name="id" value={article.id} />
          <input type="hidden" name="archived" value="false" />
          <SubmitButton>
            <InboxIcon />
            <span className="action-label">{tCommon("moveToInbox")}</span>
          </SubmitButton>
        </form>
      ) : (
        <LeavingForm action={archiveAction} back={back}>
          <input type="hidden" name="id" value={article.id} />
          <input type="hidden" name="archived" value="true" />
          <SubmitButton>
            <ArchiveIcon />
            <span className="action-label">{tCommon("archiveAction")}</span>
          </SubmitButton>
        </LeavingForm>
      )}
      <form action={favoriteAction} className="inline-form">
        <input type="hidden" name="id" value={article.id} />
        <input type="hidden" name="favorite" value={article.favorite ? "false" : "true"} />
        <SubmitButton aria-pressed={article.favorite}>
          <StarIcon filled={article.favorite} />
          <span className="action-label">{t("favorite")}</span>
        </SubmitButton>
      </form>
      <LeavingForm action={readAction} back={back}>
        <input type="hidden" name="id" value={article.id} />
        <input type="hidden" name="read" value="false" />
        <SubmitButton>
          <UnreadIcon />
          <span className="action-label">{t("markUnread")}</span>
        </SubmitButton>
      </LeavingForm>
      <button
        type="button"
        className="button folder-button"
        popoverTarget={FOLDER_MENU_ID}
        aria-haspopup="dialog"
        aria-label={folderName ? tFolders("current", { name: folderName }) : tFolders("label")}
      >
        <FolderIcon />
        <span className="action-label">{folderName ?? tFolders("label")}</span>
      </button>
      <LeavingForm action={deleteAction} back={back} className="inline-form reader-delete">
        <input type="hidden" name="id" value={article.id} />
        <ConfirmButton className="button danger" message={t("deleteConfirm")}>
          <TrashIcon />
          <span className="action-label">{tCommon("delete")}</span>
        </ConfirmButton>
      </LeavingForm>
    </div>
  );
}
