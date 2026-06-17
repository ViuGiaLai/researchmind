import React, { createContext, useContext, useState, useCallback, useRef } from "react";

// ─── Types ─────────────────────────────────────────────────────

export type ToastType = "success" | "error" | "info" | "warning";

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
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
    // Fallback for components using toast outside provider
    return {
      toasts: [],
      addToast: () => {},
      removeToast: () => {},
    };
  }
  return ctx;
}

// ─── Provider ──────────────────────────────────────────────────

const AUTO_DISMISS_MS = 3500;

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counterRef = useRef(0);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (type: ToastType, message: string) => {
      const id = `toast-${++counterRef.current}`;
      setToasts((prev) => [...prev, { id, type, message }]);
      setTimeout(() => removeToast(id), AUTO_DISMISS_MS);
    },
    [removeToast]
  );

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </ToastContext.Provider>
  );
};

// ─── Container ─────────────────────────────────────────────────

const ICONS: Record<ToastType, string> = {
  success: "✅",
  error: "❌",
  info: "ℹ️",
  warning: "⚠️",
};

const COLORS: Record<ToastType, { bg: string; border: string; text: string }> = {
  success: { bg: "#f0fdf4", border: "#22c55e", text: "#166534" },
  error: { bg: "#fef2f2", border: "#ef4444", text: "#991b1b" },
  info: { bg: "#eff6ff", border: "#3b82f6", text: "#1e40af" },
  warning: { bg: "#fffbeb", border: "#f59e0b", text: "#92400e" },
};

// Inline style sheet for toast animation (avoids needing to modify globals.css)
const TOAST_ANIMATION_STYLE = (
  <style>{`
    @keyframes toastSlideIn {
      from {
        transform: translateX(100%);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
  `}</style>
);

const ToastContainer: React.FC<{
  toasts: Toast[];
  onDismiss: (id: string) => void;
}> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <>
      {TOAST_ANIMATION_STYLE}
      <div
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        maxWidth: 400,
      }}
    >
      {toasts.map((toast) => {
        const colors = COLORS[toast.type];
        return (
          <div
            key={toast.id}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              padding: "12px 16px",
              borderRadius: 10,
              background: colors.bg,
              border: `1px solid ${colors.border}`,
              boxShadow: "0 4px 16px rgba(0,0,0,0.1)",
              color: colors.text,
              fontSize: 14,
              lineHeight: 1.5,
              animation: "toastSlideIn 0.3s ease-out",
            }}
            role="alert"
          >
            <span style={{ fontSize: 16, flexShrink: 0 }}>{ICONS[toast.type]}</span>
            <span style={{ flex: 1 }}>{toast.message}</span>
            <button
              onClick={() => onDismiss(toast.id)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: 16,
                color: colors.text,
                opacity: 0.6,
                padding: 0,
                lineHeight: 1,
                flexShrink: 0,
              }}
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        );
      })}
    </div>
    </>
  );
};
