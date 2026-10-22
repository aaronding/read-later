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
  return (
    // Keyed by the folder so the form remounts, showing the new folder and
    // clearing the text box, after a move.
    <form key={current ?? "none"} action={moveToFolderAction} className="folder-picker">
      <input type="hidden" name="id" value={articleId} />
      <label htmlFor="folderId" className="muted small">
        Folder
      </label>
      <select id="folderId" name="folderId" defaultValue={current ?? ""}>
        <option value="">No folder</option>
        {folders.map((folder) => (
          <option key={folder.id} value={folder.id}>
            {folder.name}
          </option>
        ))}
      </select>
      <label htmlFor="newFolder" className="visually-hidden">
        Or a new folder
      </label>
      <input id="newFolder" name="newFolder" type="text" placeholder="or new folder" maxLength={80} />
      <SubmitButton className="button small" pendingText="Moving…">
        Move
      </SubmitButton>
    </form>
  );
}
