import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/shared/ErrorBoundary";
import { AuthGate } from "./components/auth/AuthGate";
import { ClerkOAuthCallback, PluggableAuthProvider } from "./lib/auth-provider";
import { loadClientConfig } from "./lib/client-config";
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

function ClientConfigBootstrap() {
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    loadClientConfig()
      .then(() => { if (!cancelled) setReady(true); })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => { cancelled = true; };
  }, [attempt]);

  if (error) {
    return (
      <main className="app-loading" role="alert">
        <p>Unable to load the secure application configuration.</p>
        <p>{error}</p>
        <button type="button" onClick={() => { setError(null); setAttempt((value) => value + 1); }}>Try again</button>
      </main>
    );
  }

  if (!ready) return <main className="app-loading">Loading ResearchMind…</main>;

  // Clerk and all remote client endpoints are initialized only after the
  // configuration is fetched from the URL bundled in gateway.json.
  return <ConfiguredApplication />;
}

function ConfiguredApplication() {
  return (
    <PluggableAuthProvider>
      <ToastProvider>
        {window.location.pathname === "/sso-callback" ? (
          <ClerkOAuthCallback />
        ) : (
          <AuthGate><App /></AuthGate>
        )}
      </ToastProvider>
    </PluggableAuthProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ClientConfigBootstrap />
    </ErrorBoundary>
  </React.StrictMode>,
);