import React from "react";
import { useTranslation } from "react-i18next";
import { IconSearch, IconCheck, IconError, IconSpinner } from "../Icons";

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
  const { t } = useTranslation();
  const isScanning = status === "scanning";
  const canStart = !isScanning && folderCount > 0;

  if (isScanning) {
    return (
      <button className="scan-btn scan-btn-stop" onClick={onStop} title={t("scan.stop")}>
        <IconSpinner size={18} />
        <span>{t("scan.scanning")}</span>
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
          ? t("scan.no_folder")
          : t("scan.start_scan_title")
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
          ? t("scan.rescan")
          : status === "error"
          ? t("scan.retry")
          : t("scan.start")}
      </span>
    </button>
  );
};
