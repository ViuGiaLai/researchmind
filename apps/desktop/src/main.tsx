import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/shared/ErrorBoundary";
import { initTheme } from "./lib/theme";
import "./i18n";
import "./styles/variables.css";
import "./styles/globals.css";
import "./styles/daily-reader.css";
import "./styles/cite-panel.css";
import "./styles/debate.css";
import "./styles/highlights.css";
import "./styles/pdf.css";
import "./styles/evidence-matrix.css";
import "./styles/trust.css";
import "./styles/soft-modern.css";
import "./styles/ai-workspace-primitives.css";
import "./styles/theme-fixes.css";
import "./styles/help.css";

initTheme();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
