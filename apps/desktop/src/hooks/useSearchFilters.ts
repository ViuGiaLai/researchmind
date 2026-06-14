import { useState, useCallback, useMemo } from "react";
import { FileText, Image, Bookmark } from "lucide-react";

/** Matches Rust SearchFilters struct. */
export interface SearchFiltersState {
  extensions: string[];
  dateFrom: string | null;
  dateTo: string | null;
  folder: string | null;
}

/** Common file extensions for quick-select. */
export const FILE_EXTENSIONS = [
  { ext: "pdf", label: "PDF", icon: FileText },
  { ext: "docx", label: "Word", icon: FileText },
  { ext: "txt", label: "Text", icon: FileText },
  { ext: "md", label: "Markdown", icon: Bookmark },
  { ext: "jpg", label: "Image", icon: Image },
  { ext: "png", label: "PNG", icon: Image },
];

/** Quick date range options. */
export const DATE_PRESETS = [
  { label: "Hôm nay", days: 0 },
  { label: "7 ngày", days: 7 },
  { label: "30 ngày", days: 30 },
  { label: "90 ngày", days: 90 },
  { label: "1 năm", days: 365 },
] as const;

const defaultFilters: SearchFiltersState = {
  extensions: [],
  dateFrom: null,
  dateTo: null,
  folder: null,
};

/** Hook for managing search filter state. */
export function useSearchFilters() {
  const [filters, setFilters] = useState<SearchFiltersState>(defaultFilters);
  const [isOpen, setIsOpen] = useState(false);

  const hasActiveFilters = useMemo(
    () =>
      filters.extensions.length > 0 ||
      filters.dateFrom !== null ||
      filters.dateTo !== null ||
      filters.folder !== null,
    [filters]
  );

  /** Toggle a file extension filter. */
  const toggleExtension = useCallback((ext: string) => {
    setFilters((prev) => {
      const exts = prev.extensions.includes(ext)
        ? prev.extensions.filter((e) => e !== ext)
        : [...prev.extensions, ext];
      return { ...prev, extensions: exts };
    });
  }, []);

  /** Set a date range preset (relative to today). */
  const setDatePreset = useCallback((days: number) => {
    if (days === 0) {
      const today = new Date().toISOString().split("T")[0];
      setFilters((prev) => ({ ...prev, dateFrom: today, dateTo: today }));
    } else {
      const from = new Date(Date.now() - days * 86400000)
        .toISOString()
        .split("T")[0];
      const to = new Date().toISOString().split("T")[0];
      setFilters((prev) => ({ ...prev, dateFrom: from, dateTo: to }));
    }
  }, []);

  /** Set custom date range. */
  const setCustomDate = useCallback(
    (from: string | null, to: string | null) => {
      setFilters((prev) => ({ ...prev, dateFrom: from, dateTo: to }));
    },
    []
  );

  /** Set folder filter. */
  const setFolder = useCallback((folder: string | null) => {
    setFilters((prev) => ({ ...prev, folder }));
  }, []);

  /** Reset all filters. */
  const resetFilters = useCallback(() => {
    setFilters(defaultFilters);
  }, []);

  /** Toggle the filter panel open/closed. */
  const toggleOpen = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  /** Build the Tauri-compatible filters object (with null for empty arrays). */
  const toApiFilters = useCallback(() => {
    return {
      extensions: filters.extensions.length > 0 ? filters.extensions : null,
      date_from: filters.dateFrom,
      date_to: filters.dateTo,
      folder: filters.folder,
    };
  }, [filters]);

  return {
    filters,
    isOpen,
    hasActiveFilters,
    toggleExtension,
    setDatePreset,
    setCustomDate,
    setFolder,
    resetFilters,
    toggleOpen,
    toApiFilters,
  };
}
