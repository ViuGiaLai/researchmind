const STORAGE_KEY = "researchmind:diagnostic-log";
const MAX_ENTRIES = 80;

export interface DiagnosticEntry {
  at: string;
  level: "error" | "warning" | "info";
  message: string;
  context?: string;
}

function redact(value: string): string {
  return value
    .replace(/(api[_-]?key|token|authorization|password)[=: ]+[^\s,;]+/gi, "$1=[REDACTED]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[EMAIL]")
    .slice(0, 2000);
}

export function readDiagnosticLog(): DiagnosticEntry[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function recordDiagnostic(level: DiagnosticEntry["level"], message: string, context?: string): void {
  try {
    const entries = readDiagnosticLog();
    entries.push({ at: new Date().toISOString(), level, message: redact(message), context: context ? redact(context) : undefined });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));
  } catch {
    // Diagnostics are best-effort and never leave this device.
  }
}

export function clearDiagnosticLog(): void {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}

export function installGlobalDiagnosticHandlers(): () => void {
  const onError = (event: ErrorEvent) => recordDiagnostic("error", event.message, event.error?.stack);
  const onRejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
    recordDiagnostic("error", reason.message, reason.stack);
  };
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
  };
}
