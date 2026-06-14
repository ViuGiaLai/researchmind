import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface TimelineFileEntry {
  date: string;
  file_id: string;
  filename: string;
  path: string;
  extension: string;
  size: number;
  event_type: string;
}

export interface TimelineSummary {
  period: string;
  count: number;
  total_size: number;
}

export interface TimelineData {
  files: TimelineFileEntry[];
  summary: TimelineSummary[];
  total_days: number;
  total_files: number;
  total_size: number;
}

/** Hook to fetch and manage timeline data. */
export function useTimeline() {
  const [data, setData] = useState<TimelineData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTimeline = useCallback(
    async (from?: string, to?: string, limit?: number) => {
      setLoading(true);
      setError(null);
      try {
        const result = await invoke<TimelineData>("get_timeline", {
          from: from || null,
          to: to || null,
          limit: limit || 200,
        });
        setData(result);
      } catch (e) {
        console.error("Failed to load timeline:", e);
        setError(String(e));
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  /** Format a date string to a readable Vietnamese format. */
  const formatDate = (dateStr: string): string => {
    try {
      const d = new Date(dateStr);
      const days = [
        "CN", "T2", "T3", "T4", "T5", "T6", "T7",
      ];
      const dayName = days[d.getDay()];
      const dd = String(d.getDate()).padStart(2, "0");
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const yyyy = d.getFullYear();
      const hh = String(d.getHours()).padStart(2, "0");
      const mi = String(d.getMinutes()).padStart(2, "0");
      return `${dayName}, ${dd}/${mm}/${yyyy} ${hh}:${mi}`;
    } catch {
      return dateStr;
    }
  };

  /** Get a human-readable label for the month period. */
  const formatPeriod = (period: string): string => {
    const [year, month] = period.split("-");
    const monthNames = [
      "Tháng 1", "Tháng 2", "Tháng 3", "Tháng 4", "Tháng 5", "Tháng 6",
      "Tháng 7", "Tháng 8", "Tháng 9", "Tháng 10", "Tháng 11", "Tháng 12",
    ];
    const mIdx = parseInt(month, 10) - 1;
    return `${monthNames[mIdx] || "Tháng " + month}, ${year}`;
  };

  return {
    data,
    loading,
    error,
    loadTimeline,
    formatSize,
    formatDate,
    formatPeriod,
  };
}
