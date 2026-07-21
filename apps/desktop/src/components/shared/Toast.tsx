import React, { createContext, useContext, useState, useCallback, useRef } from "react";
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from "lucide-react";
import i18n from "../../i18n";

// ─── Types ─────────────────────────────────────────────────────

export type ToastType = "success" | "error" | "info" | "warning";

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  isDismissing?: boolean;
}

interface ToastContextValue {
  toasts: Toast[];
  addToast: (type: ToastType, message: string) => void;
  removeToast: (id: string) => void;
}

// ─── Context ───────────────────────────────────────────────────

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return {
      toasts: [],
      addToast: () => {},
      removeToast: () => {},
    };
  }
  return ctx;
}

// ─── Provider ──────────────────────────────────────────────────

const AUTO_DISMISS_MS = 4000;
const DISMISS_ANIMATION_MS = 250; // must match CSS transition duration

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counterRef = useRef(0);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, isDismissing: true } : t))
    );
    setTimeout(() => {
      removeToast(id);
    }, DISMISS_ANIMATION_MS);
  }, [removeToast]);

  const addToast = useCallback(
    (type: ToastType, message: string) => {
      const id = `toast-${++counterRef.current}`;
      setToasts((prev) => [...prev, { id, type, message }]);
      setTimeout(() => dismissToast(id), AUTO_DISMISS_MS);
    },
    [dismissToast]
  );

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast: dismissToast }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  );
};

// ─── Constants & Styling ───────────────────────────────────────

const ICONS: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle2 size={15} strokeWidth={1.6} style={{ color: "var(--color-success, #10b981)" }} />,
  error: <XCircle size={15} strokeWidth={1.6} style={{ color: "var(--color-error, #ef4444)" }} />,
  info: <Info size={15} strokeWidth={1.6} style={{ color: "var(--color-primary, #14b8a6)" }} />,
  warning: <AlertTriangle size={15} strokeWidth={1.6} style={{ color: "var(--color-warning, #f59e0b)" }} />,
};

const ACCENTS: Record<ToastType, string> = {
  success: "var(--color-success, #10b981)",
  error: "var(--color-error, #ef4444)",
  info: "var(--color-primary, #14b8a6)",
  warning: "var(--color-warning, #f59e0b)",
};

export function getToastTitle(type: ToastType): string {
  return i18n.t(`toast.${type}`);
}

// Safe helper to strip hardcoded emojis from standard/legacy toast messages
function cleanMessage(msg: string): string {
  let cleaned = msg.trim();
  const emojisToRemove = ["❌", "📋", "✅", "⚠️", "ℹ️", "🚨", "✔️"];
  for (const emoji of emojisToRemove) {
    if (cleaned.startsWith(emoji)) {
      cleaned = cleaned.substring(emoji.length).trim();
    }
  }
  return cleaned;
}

const TOAST_STYLE = (
  <style>{`
    :root {
      --toast-success-outer-bg: rgba(16, 185, 129, 0.03);
      --toast-success-outer-border: rgba(16, 185, 129, 0.12);
      --toast-error-outer-bg: rgba(239, 68, 68, 0.03);
      --toast-error-outer-border: rgba(239, 68, 68, 0.12);
      --toast-info-outer-bg: rgba(20, 184, 166, 0.03);
      --toast-info-outer-border: rgba(20, 184, 166, 0.12);
      --toast-warning-outer-bg: rgba(245, 158, 11, 0.03);
      --toast-warning-outer-border: rgba(245, 158, 11, 0.12);
      --toast-inner-border: rgba(255, 255, 255, 0.04);
      --toast-inner-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.03);
    }
    
    [data-theme="light"] {
      --toast-success-outer-bg: rgba(5, 150, 105, 0.03);
      --toast-success-outer-border: rgba(5, 150, 105, 0.1);
      --toast-error-outer-bg: rgba(220, 38, 38, 0.03);
      --toast-error-outer-border: rgba(220, 38, 38, 0.1);
      --toast-info-outer-bg: rgba(13, 148, 136, 0.03);
      --toast-info-outer-border: rgba(13, 148, 136, 0.1);
      --toast-warning-outer-bg: rgba(217, 119, 6, 0.03);
      --toast-warning-outer-border: rgba(217, 119, 6, 0.1);
      --toast-inner-border: rgba(0, 0, 0, 0.02);
      --toast-inner-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.85);
    }

    @keyframes toastSlideIn {
      0% {
        transform: translateY(20px) scale(0.95);
        opacity: 0;
      }
      100% {
        transform: translateY(0) scale(1);
        opacity: 1;
      }
    }

    .toast-item-outer {
      max-height: 160px;
      margin-bottom: 8px;
      opacity: 1;
      padding: 4px;
      border-radius: var(--radius-lg, 18px);
      background: var(--toast-outer-bg);
      border: 1px solid var(--toast-outer-border);
      box-shadow: var(--shadow-lg, 0 16px 40px rgba(0, 0, 0, 0.1));
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      animation: toastSlideIn 320ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
      transition: max-height 250ms cubic-bezier(0.16, 1, 0.3, 1),
                  margin-bottom 250ms cubic-bezier(0.16, 1, 0.3, 1),
                  padding 250ms cubic-bezier(0.16, 1, 0.3, 1),
                  opacity 250ms cubic-bezier(0.16, 1, 0.3, 1),
                  transform 250ms cubic-bezier(0.16, 1, 0.3, 1);
    }

    .toast-item-outer.exiting {
      max-height: 0 !important;
      margin-bottom: 0 !important;
      padding-top: 0 !important;
      padding-bottom: 0 !important;
      opacity: 0 !important;
      transform: translateY(-10px) scale(0.95) !important;
      border-color: transparent !important;
      box-shadow: none !important;
      overflow: hidden !important;
      pointer-events: none !important;
    }

    .toast-card {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 11px 13px;
      border-radius: 14px; /* inner Concentric math: 18px radius - 4px padding */
      background: var(--color-surface, #0f0f11);
      border: 1px solid var(--toast-inner-border);
      color: var(--color-text, #f4f4f5);
      font-family: var(--font-sans, sans-serif);
      position: relative;
      overflow: hidden;
    }

    .toast-close-btn {
      background: none;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 3px;
      border-radius: var(--radius-xs, 4px);
      color: var(--color-text-secondary, #a1a1aa);
      opacity: 0.5;
      transition: all var(--transition-fast, 180ms ease);
      flex-shrink: 0;
      margin-top: 1px;
    }

    .toast-close-btn:hover {
      opacity: 1;
      background: var(--color-surface-hover, rgba(255, 255, 255, 0.04));
      color: var(--color-text, #f4f4f5);
    }
  `}</style>
);

// ─── Individual Item ───────────────────────────────────────────

const ToastItem: React.FC<{
  toast: Toast;
  onDismiss: (id: string) => void;
}> = ({ toast, onDismiss }) => {
  const { id, type, message, isDismissing } = toast;
  const accentColor = ACCENTS[type];
  const cleanedMessage = cleanMessage(message);

  return (
    <div
      className={`toast-item-outer ${isDismissing ? "exiting" : ""}`}
      style={{
        pointerEvents: "auto",
        "--toast-outer-bg": `var(--toast-${type}-outer-bg)`,
        "--toast-outer-border": `var(--toast-${type}-outer-border)`,
      } as React.CSSProperties}
      role="alert"
    >
      <div
        className="toast-card"
        style={{
          boxShadow: "var(--toast-inner-shadow)",
        }}
      >
        {/* Modern Accent Pill */}
        <div
          style={{
            width: 3,
            alignSelf: "stretch",
            backgroundColor: accentColor,
            borderRadius: 9999,
            flexShrink: 0,
          }}
        />

        {/* Dynamic Light Stroke Icon */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 18, flexShrink: 0, marginLeft: 2 }}>
          {ICONS[type]}
        </div>

        {/* Text Area */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3, minWidth: 0, paddingRight: 4 }}>
          <span style={{ fontSize: "10.5px", letterSpacing: "0.06em", color: accentColor, fontWeight: 700 }}>
            {getToastTitle(type)}
          </span>
          <div style={{ color: "var(--color-text)", fontSize: "13px", fontWeight: 500, lineHeight: 1.45, wordBreak: "break-word" }}>
            {cleanedMessage}
          </div>
        </div>

        {/* Elegant Micro-Close button */}
        <button
          onClick={() => onDismiss(id)}
          className="toast-close-btn"
          aria-label={i18n.t("toast.dismiss")}
        >
          <X size={13} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
};

// ─── Container ─────────────────────────────────────────────────

const ToastContainer: React.FC<{
  toasts: Toast[];
  onDismiss: (id: string) => void;
}> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <>
      {TOAST_STYLE}
      <div
        style={{
          position: "fixed",
          bottom: 24,
          right: 24,
          zIndex: 9999,
          display: "flex",
          flexDirection: "column",
          gap: 0,
          maxWidth: 380,
          width: "calc(100% - 48px)",
          pointerEvents: "none",
        }}
      >
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
        ))}
      </div>
    </>
  );
};
