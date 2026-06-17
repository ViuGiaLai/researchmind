import React, { useState } from "react";
import { IconError, IconRefresh, IconCheck, IconSpinner } from "../Icons";

interface OllamaErrorBannerProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  retryLoading?: boolean;
  retryLabel?: string;
  showCommands?: boolean;
  showDocLink?: boolean;
  compact?: boolean;
}

const COMMANDS = [
  { label: "Khởi động Ollama", cmd: "ollama serve" },
  { label: "Kiểm tra model", cmd: "ollama list" },
];

export const OllamaErrorBanner: React.FC<OllamaErrorBannerProps> = ({
  title = "Không thể kết nối đến Ollama",
  message,
  onRetry,
  retryLoading = false,
  retryLabel = "Thử lại",
  showCommands = true,
  showDocLink = true,
  compact = false,
}) => {
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const copyCommand = async (cmd: string, idx: number) => {
    try {
      await navigator.clipboard.writeText(cmd);
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 2000);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = cmd;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 2000);
    }
  };

  return (
    <div className={`ollama-error-banner ${compact ? "compact" : ""}`}>
      <div className="ollama-error-header">
        <IconError size={compact ? 16 : 20} />
        <span className="ollama-error-title">{title}</span>
      </div>

      {message && <p className="ollama-error-message">{message}</p>}

      {showCommands && (
        <div className="ollama-error-commands">
          <span className="ollama-error-commands-label">Cách khắc phục:</span>
          {COMMANDS.map((item, idx) => (
            <div key={idx} className="ollama-error-command-row">
              <span className="ollama-error-command-desc">{item.label}:</span>
              <code className="ollama-error-command-code">{item.cmd}</code>
              <button
                className="ollama-error-copy-btn"
                onClick={() => copyCommand(item.cmd, idx)}
                title="Sao chép lệnh"
              >
                {copiedIdx === idx ? (
                  <IconCheck size={14} />
                ) : (
                  <span className="copy-text">Sao chép</span>
                )}
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="ollama-error-actions">
        {onRetry && (
          <button
            className="ollama-error-retry-btn"
            onClick={onRetry}
            disabled={retryLoading}
          >
            {retryLoading ? (
              <IconSpinner size={14} />
            ) : (
              <IconRefresh size={14} />
            )}
            <span>{retryLoading ? "Đang kiểm tra..." : retryLabel}</span>
          </button>
        )}

        {showDocLink && (
          <a
            className="ollama-error-doc-link"
            href="https://ollama.com/download"
            target="_blank"
            rel="noopener noreferrer"
          >
            Tải Ollama tại ollama.com ↗
          </a>
        )}
      </div>
    </div>
  );
};
