import { useTranslation } from "react-i18next";
import { IconFolderOpen, IconSpinner } from "../Icons";

interface FolderPickerProps {
  onAddFolder: () => void;
  isAdding: boolean;
}

/**
 * Button component that opens the native folder selection dialog
 * via the `add_folder` Tauri command.
 */
export function FolderPicker({ onAddFolder, isAdding }: FolderPickerProps) {
  const { t } = useTranslation();
  return (
    <button
      className="folder-picker-btn"
      onClick={onAddFolder}
      disabled={isAdding}
      title={t("folder.pick_title")}
    >
      {isAdding ? (
        <IconSpinner size={18} />
      ) : (
        <>
          <IconFolderOpen size={18} />
          <span className="folder-picker-text">{t("import.select_folder")}</span>
        </>
      )}
    </button>
  );
}
