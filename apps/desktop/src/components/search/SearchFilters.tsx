import React from "react";
import {
  SearchFiltersState,
  FILE_EXTENSIONS,
  DATE_PRESETS,
} from "../../hooks/useSearchFilters";
import {
  IconSearch,
  IconClose,
  IconFileText,
  IconClock,
  IconFolder,
} from "../Icons";

interface SearchFiltersProps {
  filters: SearchFiltersState;
  isOpen: boolean;
  hasActiveFilters: boolean;
  folders: string[];
  onToggleExtension: (ext: string) => void;
  onSetDatePreset: (days: number) => void;
  onSetCustomDate: (from: string | null, to: string | null) => void;
  onSetFolder: (folder: string | null) => void;
  onReset: () => void;
  onToggleOpen: () => void;
}

export const SearchFilters: React.FC<SearchFiltersProps> = ({
  filters,
  isOpen,
  hasActiveFilters,
  folders,
  onToggleExtension,
  onSetDatePreset,
  onSetCustomDate,
  onSetFolder,
  onReset,
  onToggleOpen,
}) => {
  const handleCustomDateApply = (
    e: React.FormEvent<HTMLFormElement>
  ) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const from = data.get("date-from") as string | null;
    const to = data.get("date-to") as string | null;
    onSetCustomDate(from || null, to || null);
  };

  return (
    <div className="search-filters">
      {/* Toggle bar */}
      <div className="search-filters-toggle">
        <button className="search-filters-toggle-btn" onClick={onToggleOpen}>
          <IconSearch size={14} style={{ marginRight: 4 }} />
          <span>Bộ lọc</span>
          {hasActiveFilters && (
            <span className="search-filters-badge">!</span>
          )}
          <span className={`search-filters-arrow ${isOpen ? "open" : ""}`}>
            ▾
          </span>
        </button>
        {hasActiveFilters && (
          <button className="search-filters-clear" onClick={onReset} title="Xoá bộ lọc">              <IconClose size={12} />
            </button>
        )}
      </div>

      {/* Filter panel */}
      {isOpen && (
        <div className="search-filters-panel">
          {/* File type */}
          <div className="search-filters-group">
            <h4 className="search-filters-group-title"><IconFileText size={14} style={{ marginRight: 4 }} /> Loại file</h4>
            <div className="search-filters-chips">
              {FILE_EXTENSIONS.map(({ ext, label, icon: Icon }) => (
                <button
                  key={ext}
                  className={`search-filters-chip ${
                    filters.extensions.includes(ext) ? "active" : ""
                  }`}
                  onClick={() => onToggleExtension(ext)}
                >
                  <Icon size={14} style={{ marginRight: 4 }} />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Date range */}
          <div className="search-filters-group">
            <h4 className="search-filters-group-title"><IconClock size={14} style={{ marginRight: 4 }} /> Thời gian</h4>
            <div className="search-filters-chips">
              {DATE_PRESETS.map(({ label, days }) => (
                <button
                  key={days}
                  className="search-filters-chip"
                  onClick={() => onSetDatePreset(days)}
                >
                  {label}
                </button>
              ))}
            </div>
            <form
              key={(filters.dateFrom ?? "") + (filters.dateTo ?? "")}
              className="search-filters-date-custom"
              onSubmit={handleCustomDateApply}
            >
              <label className="search-filters-date-label">Từ:</label>
              <input
                type="date"
                name="date-from"
                className="search-filters-date-input"
                defaultValue={filters.dateFrom || ""}
              />
              <label className="search-filters-date-label">Đến:</label>
              <input
                type="date"
                name="date-to"
                className="search-filters-date-input"
                defaultValue={filters.dateTo || ""}
              />
              <button type="submit" className="search-filters-date-apply">
                Áp
              </button>
            </form>
          </div>

          {/* Folder filter */}
          {folders.length > 0 && (
            <div className="search-filters-group">
              <h4 className="search-filters-group-title"><IconFolder size={14} style={{ marginRight: 4 }} /> Thư mục</h4>
              <select
                className="search-filters-select"
                value={filters.folder || ""}
                onChange={(e) => onSetFolder(e.target.value || null)}
              >
                <option value="">Tất cả thư mục</option>
                {folders.map((folder) => (
                  <option key={folder} value={folder}>
                    {folder.split(/[\\/]/).pop() || folder}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Active filter summary */}
          {hasActiveFilters && (
            <div className="search-filters-active">
              <span>Đang lọc: </span>
              {filters.extensions.length > 0 && (
                <span className="search-filters-active-tag">
                  {filters.extensions.map((e) => `.${e}`).join(", ")}
                </span>
              )}
              {filters.dateFrom && (
                <span className="search-filters-active-tag">
                  từ {filters.dateFrom}
                  {filters.dateTo ? ` đến ${filters.dateTo}` : ""}
                </span>
              )}
              {filters.folder && (
                <span className="search-filters-active-tag">
                  <IconFolder size={12} style={{ marginRight: 2 }} /> {filters.folder.split(/[\\/]/).pop()}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
