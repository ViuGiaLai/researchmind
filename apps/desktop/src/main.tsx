import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/shared/ErrorBoundary";
import { AuthGate } from "./components/auth/AuthGate";
import { FirebaseAuthProvider } from "./lib/firebase";
import { initTheme } from "./lib/theme";
import { ToastProvider } from "./components/shared/Toast";
import { installGlobalDiagnosticHandlers } from "./lib/diagnosticLog";
import "./i18n";
import "./styles/variables.css";
import "./styles/globals.css";
import "./styles/daily-reader.css";
import "./styles/cite-panel.css";
import "./styles/debate.css";
import "./styles/highlights.css";
import "./styles/pdf.css";
import "./styles/projects.css";
import "./styles/evidence-matrix.css";
import "./styles/trust.css";
import "./styles/soft-modern.css";
import "./styles/ai-workspace-primitives.css";
import "./styles/theme-fixes.css";
import "./styles/help.css";
import "./styles/product-redesign.css";
import "./styles/anonymization.css";

initTheme();
installGlobalDiagnosticHandlers();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <FirebaseAuthProvider>
        <ToastProvider>
          <AuthGate><App /></AuthGate>
        </ToastProvider>
      </FirebaseAuthProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
