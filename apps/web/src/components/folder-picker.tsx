import { useTranslations } from "next-intl";
import { moveToFolderAction } from "@/app/actions";
import { SubmitButton } from "./submit-button";

export function FolderPicker({
  articleId,
  current,
  folders,
}: {
  articleId: string;
  current: string | null;
  folders: { id: string; name: string }[];
}) {
  const t = useTranslations("Folders");
  return (
    // Keyed by the folder so the form remounts, showing the new folder and
    // clearing the text box, after a move.
    <form key={current ?? "none"} action={moveToFolderAction} className="folder-picker">
      <input type="hidden" name="id" value={articleId} />
      <label htmlFor="folderId" className="muted small">
        {t("label")}
      </label>
      <select id="folderId" name="folderId" defaultValue={current ?? ""}>
        <option value="">{t("noFolder")}</option>
        {folders.map((folder) => (
          <option key={folder.id} value={folder.id}>
            {folder.name}
          </option>
        ))}
      </select>
      <label htmlFor="newFolder" className="visually-hidden">
        {t("newFolderLabel")}
      </label>
      <input id="newFolder" name="newFolder" type="text" placeholder={t("newFolderPlaceholder")} maxLength={80} />
      <SubmitButton className="button small" pendingText={t("moving")}>
        {t("move")}
      </SubmitButton>
    </form>
  );
}
