import React from "react";
import { IconFileText, IconError, IconCheck, IconStop } from "../Icons";

interface ScanProgress {
  total_files: number;
  indexed_files: number;
  failed_files: number;
  current_file: string | null;
  percentage: number;
  is_running: boolean;
}

interface ScanProgressProps {
  progress: ScanProgress;
  status: "idle" | "scanning" | "completed" | "error" | "stopped";
}

const formatPercent = (pct: number): string => {
  return `${Math.round(pct)}%`;
};

export const ScanProgress: React.FC<ScanProgressProps> = ({ progress, status }) => {
  if (status === "idle") return null;

  const isScanning = status === "scanning";
  const pct = Math.round(progress.percentage);
  const barWidth = Math.min(pct, 100);

  return (
    <div className={`scan-progress ${status}`}>
      {/* Progress bar */}
      <div className="scan-progress-bar-track">
        <div
          className={`scan-progress-bar-fill ${isScanning ? "animate" : ""}`}
          style={{ width: `${barWidth}%` }}
        />
      </div>

      {/* Stats row */}
      <div className="scan-progress-stats">
        <span className="scan-progress-percentage">{formatPercent(progress.percentage)}</span>
        <span className="scan-progress-files">
          <IconFileText size={12} style={{ marginRight: 4 }} />
          {progress.indexed_files}/{progress.total_files}
        </span>
        {progress.failed_files > 0 && (
          <span className="scan-progress-failed">
            <IconError size={12} style={{ marginRight: 2 }} /> {progress.failed_files}
          </span>
        )}
      </div>

      {/* Current file / status message */}
      <div className="scan-progress-current">
        {isScanning && progress.current_file && (
          <>
            <IconFileText size={12} />
            <span className="scan-progress-file-name" title={progress.current_file}>
              {progress.current_file}
            </span>
          </>
        )}
        {!isScanning && status === "completed" && (
          <span className="scan-progress-done">
            <IconCheck size={14} style={{ marginRight: 4 }} />
            Đã hoàn thành! {progress.indexed_files} file đã được index.
          </span>
        )}
        {!isScanning && status === "error" && (
          <span className="scan-progress-error">
            <IconError size={14} style={{ marginRight: 4 }} />
            {progress.current_file || "Có lỗi xảy ra."}
          </span>
        )}
        {!isScanning && status === "stopped" && (
          <span className="scan-progress-stopped">
            <IconStop size={14} style={{ marginRight: 4 }} />
            Đã dừng. {progress.indexed_files} file đã được index.
          </span>
        )}
      </div>
    </div>
  );
};
