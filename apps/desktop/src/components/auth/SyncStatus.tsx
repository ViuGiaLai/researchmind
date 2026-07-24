import { useEffect, useState } from "react";
import { IconCloud, IconCloudOff, IconLock, IconSpinner, IconWarning } from "../Icons";
import { getSyncMode, type SyncMode } from "../../lib/sync";

export function SyncStatus() {
  const [status, setStatus] = useState<"online" | "offline" | "syncing" | "error" | "local_only">("online");
  const [lastSynced, setLastSynced] = useState<string | null>(null);

  useEffect(() => {
    setLastSynced(localStorage.getItem('rm_last_synced'));

    const mode = getSyncMode();
    if (mode === "local_only") {
      setStatus("local_only");
    }

    const handleOnline = () => {
      if (getSyncMode() === "local_only") setStatus("local_only");
      else setStatus("online");
    };
    const handleOffline = () => setStatus("offline");
    
    // Custom events from SyncDaemon
    const handleSyncStart = () => setStatus("syncing");
    const handleSyncEnd = () => {
      const currentMode = getSyncMode();
      if (currentMode === "local_only") setStatus("local_only");
      else setStatus(navigator.onLine ? "online" : "offline");
    };
    const handleSyncSuccess = () => {
      setLastSynced(localStorage.getItem('rm_last_synced'));
      if (getSyncMode() === "local_only") setStatus("local_only");
      else setStatus("online");
    };
    const handleSyncError = () => setStatus("error");
    const handleModeChanged = (e: Event) => {
      const detail = (e as CustomEvent<{ mode: SyncMode }>).detail;
      if (detail.mode === "local_only") setStatus("local_only");
      else setStatus(navigator.onLine ? "online" : "offline");
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("researchmind:sync-start", handleSyncStart);
    window.addEventListener("researchmind:sync-end", handleSyncEnd);
    window.addEventListener("researchmind:sync-success", handleSyncSuccess);
    window.addEventListener("researchmind:sync-error", handleSyncError);
    window.addEventListener("researchmind:sync-mode-changed", handleModeChanged);

    if (!navigator.onLine) {
      setStatus("offline");
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("researchmind:sync-start", handleSyncStart);
      window.removeEventListener("researchmind:sync-end", handleSyncEnd);
      window.removeEventListener("researchmind:sync-success", handleSyncSuccess);
      window.removeEventListener("researchmind:sync-error", handleSyncError);
      window.removeEventListener("researchmind:sync-mode-changed", handleModeChanged);
    };
  }, []);

  const formatRelativeTime = (timestamp: string) => {
    const diff = Date.now() - parseInt(timestamp, 10);
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  const getStyle = () => {
    if (status === "local_only") return { bg: "rgba(156, 163, 175, 0.1)", color: "#9ca3af", border: "rgba(156, 163, 175, 0.2)" };
    if (status === "offline") return { bg: "rgba(239, 68, 68, 0.1)", color: "#ef4444", border: "rgba(239, 68, 68, 0.2)" };
    if (status === "error") return { bg: "rgba(245, 158, 11, 0.1)", color: "#f59e0b", border: "rgba(245, 158, 11, 0.2)" };
    return { bg: "rgba(45, 212, 191, 0.1)", color: "#2dd4bf", border: "rgba(45, 212, 191, 0.2)" };
  };

  const s = getStyle();

  const getStatusText = () => {
    if (status === "local_only") return "Local Only";
    if (status === "syncing") return "Syncing...";
    if (status === "error") return "Error";
    if (status === "offline") return "Offline";
    return lastSynced ? "Synced" : "Not Synced";
  };

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 6,
      padding: "4px 8px", borderRadius: 12,
      fontSize: "0.75rem", fontWeight: 500,
      background: s.bg, color: s.color, border: `1px solid ${s.border}`
    }} title={lastSynced ? `Last synced: ${new Date(parseInt(lastSynced, 10)).toLocaleString()}` : "Cloud sync status"}>
      {status === "syncing" && <IconSpinner size={14} className="auth-spin" />}
      {status === "online" && <IconCloud size={14} />}
      {status === "local_only" && <IconLock size={14} />}
      {status === "offline" && <IconCloudOff size={14} />}
      {status === "error" && <IconWarning size={14} />}
      
      <span>{getStatusText()}</span>
      {status === "online" && lastSynced && (
        <span style={{ opacity: 0.7, marginLeft: 4, fontSize: "0.7rem" }}>
          {formatRelativeTime(lastSynced)}
        </span>
      )}
    </div>
  );
}
