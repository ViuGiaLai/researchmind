import React from "react";
import i18n from "../../i18n";
import { recordDiagnostic } from "../../lib/diagnosticLog";

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message || i18n.t("error.unknown") };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    recordDiagnostic("error", error.message, `${error.stack || ""}\n${info.componentStack || ""}`);
    console.error("UI ErrorBoundary:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="app-loading" style={{ minHeight: "100dvh" }}>
          <div className="app-loading-content">
            <h2 style={{ margin: 0, fontSize: "1.1rem" }}>{i18n.t("error.ui_error")}</h2>
            <p style={{ fontSize: "0.85rem", opacity: 0.8 }}>{this.state.message}</p>
            <button
              type="button"
              className="app-retry-btn"
              onClick={() => window.location.reload()}
            >
              {i18n.t("error.reload")}
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
