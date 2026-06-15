import { IconFolder, IconClose, IconSpinner } from "../Icons";

interface FolderListProps {
  folders: string[];
  onRemoveFolder: (folder: string) => void;
  isLoading: boolean;
}

/**
 * Displays the list of selected folders with a remove button for each.
 */
export function FolderList({ folders, onRemoveFolder, isLoading }: FolderListProps) {
  if (isLoading) {
    return (
      <div className="folder-list-loading">
        <IconSpinner size={16} />
        <span style={{ marginLeft: 8 }}>Đang tải...</span>
      </div>
    );
  }

  if (folders.length === 0) {
    return (
      <div className="folder-list-empty">
        <p>Chưa có thư mục nào được chọn.</p>
        <p className="folder-list-hint">
          Nhấn "Chọn thư mục" để thêm thư mục cần index.
        </p>
      </div>
    );
  }

  return (
    <div className="folder-list">
      {folders.map((folder) => (
        <div key={folder} className="folder-item">
          <div className="folder-item-info">
            <IconFolder size={18} className="icon-folder" />
            <div className="folder-item-path">
              <span className="folder-item-name">
                {folder.split(/[\\/]/).pop() || folder}
              </span>
              <span className="folder-item-fullpath">{folder}</span>
            </div>
          </div>
          <button
            className="folder-item-remove"
            onClick={() => onRemoveFolder(folder)}
            title="Xóa thư mục này"
          >
            <IconClose size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}
