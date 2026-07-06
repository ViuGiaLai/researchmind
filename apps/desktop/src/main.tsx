import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/shared/ErrorBoundary";
import "./styles/variables.css";
import "./styles/globals.css";
import "./styles/daily-reader.css";
import "./styles/cite-panel.css";
import "./styles/debate.css";
import "./styles/highlights.css";
import "./styles/pdf.css";
import "./styles/evidence-matrix.css";
import "./styles/trust.css";

// Apply saved theme before first render to prevent flash
(function () {
  try {
    const saved = localStorage.getItem("app-theme");
    if (saved === "light" || saved === "dark") {
      document.documentElement.setAttribute("data-theme", saved);
    } else {
      document.documentElement.setAttribute("data-theme", "dark");
    }
  } catch {
    document.documentElement.setAttribute("data-theme", "dark");
  }
})();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
