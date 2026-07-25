import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { IconCheck, IconCopy, IconSparkle, IconLink } from "../Icons";

interface ReportCreatedModalProps {
  isOpen: boolean;
  onClose: () => void;
  shareUrl: string;
  paperCount: number;
}

export const ReportCreatedModal: React.FC<ReportCreatedModalProps> = ({
  isOpen,
  onClose,
  shareUrl,
  paperCount,
}) => {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(shareUrl).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenLink = () => {
    window.open(shareUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <div
      className="collab-modal-overlay"
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(15, 23, 42, 0.65)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 999999,
        padding: "20px",
      }}
      onClick={onClose}
    >
      {/* Modal Card Container */}
      <div
        className="collab-modal-card"
        style={{
          position: "relative",
          width: "min(100%, 480px)",
          background: "var(--color-surface, #ffffff)",
          border: "1px solid var(--color-border, #e2e8f0)",
          borderRadius: "16px",
          padding: "24px",
          boxShadow: "0 20px 40px rgba(0, 0, 0, 0.15)",
          color: "var(--color-text, #0f172a)",
          display: "flex",
          flexDirection: "column",
          gap: "18px",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          style={{
            position: "absolute",
            top: "16px",
            right: "16px",
            background: "none",
            border: "none",
            color: "var(--color-text-secondary, #64748b)",
            fontSize: "18px",
            cursor: "pointer",
            padding: "4px 8px",
            borderRadius: "8px",
            lineHeight: 1,
          }}
          aria-label="Close"
        >
          ✕
        </button>

        {/* Modal Header */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div
            style={{
              width: "42px",
              height: "42px",
              borderRadius: "12px",
              background: "rgba(16, 185, 129, 0.1)",
              color: "#10b981",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <IconSparkle size={22} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700, color: "var(--color-text, #0f172a)" }}>
              {t("account.report_modal_title", "Báo cáo Mây đã sẵn sàng")}
            </h3>
            <p style={{ margin: "2px 0 0", fontSize: "0.82rem", color: "var(--color-text-secondary, #64748b)" }}>
              {t("account.report_modal_desc", "Đã tổng hợp từ {{count}} tài liệu nghiên cứu", { count: paperCount })}
            </p>
          </div>
        </div>

        {/* URL Box */}
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <label style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--color-text-secondary, #475569)" }}>
            {t("account.report_modal_url_label", "Đường dẫn cố định của Workspace:")}
          </label>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 12px",
              background: "var(--color-bg-subtle, #f8fafc)",
              border: "1px solid var(--color-border, #e2e8f0)",
              borderRadius: "10px",
            }}
          >
            <input
              type="text"
              readOnly
              value={shareUrl}
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                outline: "none",
                fontSize: "0.85rem",
                color: "var(--color-primary, #0284c7)",
                fontWeight: 600,
                fontFamily: "monospace",
              }}
            />
            <button
              type="button"
              onClick={handleCopy}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 12px",
                borderRadius: "8px",
                fontSize: "0.78rem",
                fontWeight: 600,
                cursor: "pointer",
                border: copied ? "1px solid #10b981" : "1px solid #0284c7",
                background: copied ? "#10b981" : "#0284c7",
                color: "#ffffff",
                transition: "all 0.2s ease",
              }}
            >
              {copied ? (
                <>
                  <IconCheck size={14} />
                  <span>{t("account.copied", "Đã sao chép")}</span>
                </>
              ) : (
                <>
                  <IconCopy size={14} />
                  <span>{t("account.copy", "Sao chép")}</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "10px", paddingTop: "4px" }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "8px 16px",
              fontSize: "0.85rem",
              fontWeight: 600,
              color: "var(--color-text-secondary, #475569)",
              background: "var(--color-bg-subtle, #f1f5f9)",
              border: "1px solid var(--color-border, #cbd5e1)",
              borderRadius: "8px",
              cursor: "pointer",
            }}
          >
            {t("common.close", "Đóng")}
          </button>
          <button
            type="button"
            onClick={handleOpenLink}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "8px 16px",
              fontSize: "0.85rem",
              fontWeight: 600,
              color: "#ffffff",
              background: "var(--color-primary, #0284c7)",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
            }}
          >
            <IconLink size={16} />
            <span>{t("account.open_in_browser", "Mở trên Trình duyệt")}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
