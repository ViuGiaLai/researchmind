import React from "react";
import { IconSearch, IconCheck, IconError, IconSpinner, IconStop } from "../Icons";

interface ScanButtonProps {
  status: "idle" | "scanning" | "completed" | "error" | "stopped";
  folderCount: number;
  onStart: () => void;
  onStop: () => void;
}

export const ScanButton: React.FC<ScanButtonProps> = ({
  status,
  folderCount,
  onStart,
  onStop,
}) => {
  const isScanning = status === "scanning";
  const canStart = !isScanning && folderCount > 0;

  if (isScanning) {
    return (
      <button className="scan-btn scan-btn-stop" onClick={onStop} title="Dừng quét">
        <IconSpinner size={18} />
        <span>Đang quét...</span>
      </button>
    );
  }

  return (
    <button
      className="scan-btn scan-btn-start"
      onClick={onStart}
      disabled={!canStart}
      title={
        folderCount === 0
          ? "Chưa có thư mục nào. Vui lòng thêm thư mục trước."
          : "Bắt đầu quét và index files"
      }
    >
      <span className="scan-btn-icon">
        {status === "completed" ? (
          <IconCheck size={18} />
        ) : status === "error" ? (
          <IconError size={18} />
        ) : (
          <IconSearch size={18} />
        )}
      </span>
      <span>
        {status === "completed"
          ? "Quét lại"
          : status === "error"
          ? "Thử lại"
          : "Bắt đầu quét"}
      </span>
    </button>
  );
};
