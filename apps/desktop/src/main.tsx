import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/shared/ErrorBoundary";
import { AuthGate } from "./components/auth/AuthGate";
import { ClerkOAuthCallback, PluggableAuthProvider } from "./lib/auth-provider";
import { initTheme } from "./lib/theme";
import { ToastProvider } from "./components/shared/Toast";
import { installGlobalDiagnosticHandlers } from "./lib/diagnosticLog";
import "./i18n";
import "./styles/variables.css";
import "./styles/globals.css";
import "./styles/soft-modern.css";
import "./styles/ai-workspace-primitives.css";
import "./styles/theme-fixes.css";
import "./styles/help.css";
import "./styles/product-redesign.css";

initTheme();
installGlobalDiagnosticHandlers();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <PluggableAuthProvider>
        <ToastProvider>
          {window.location.pathname === "/sso-callback" ? (
            <ClerkOAuthCallback />
          ) : (
            <AuthGate><App /></AuthGate>
          )}
        </ToastProvider>
      </PluggableAuthProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
