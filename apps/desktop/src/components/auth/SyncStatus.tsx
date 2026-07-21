import React, { useEffect, useState } from "react";
import { IconCloud, IconCloudOff, IconSpinner } from "../Icons";

export function SyncStatus() {
  const [status, setStatus] = useState<"online" | "offline" | "syncing">("online");

  useEffect(() => {
    const handleOnline = () => setStatus("online");
    const handleOffline = () => setStatus("offline");
    
    // Custom events from SyncDaemon
    const handleSyncStart = () => setStatus("syncing");
    const handleSyncEnd = () => setStatus(navigator.onLine ? "online" : "offline");

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("researchmind:sync-start", handleSyncStart);
    window.addEventListener("researchmind:sync-end", handleSyncEnd);

    if (!navigator.onLine) {
      setStatus("offline");
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("researchmind:sync-start", handleSyncStart);
      window.removeEventListener("researchmind:sync-end", handleSyncEnd);
    };
  }, []);

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 6,
      padding: "4px 8px", borderRadius: 12,
      fontSize: "0.75rem", fontWeight: 500,
      background: status === "offline" ? "rgba(239, 68, 68, 0.1)" : "rgba(45, 212, 191, 0.1)",
      color: status === "offline" ? "#ef4444" : "#2dd4bf",
      border: `1px solid ${status === "offline" ? "rgba(239, 68, 68, 0.2)" : "rgba(45, 212, 191, 0.2)"}`
    }}>
      {status === "syncing" && <IconSpinner size={14} className="auth-spin" />}
      {status === "online" && <IconCloud size={14} />}
      {status === "offline" && <IconCloudOff size={14} />}
      
      <span>
        {status === "syncing" ? "Syncing..." : status === "online" ? "Synced" : "Offline"}
      </span>
    </div>
  );
}
