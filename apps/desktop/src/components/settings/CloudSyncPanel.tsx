import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../lib/auth-provider";
import { db } from "../../lib/db";
import { fetchCloudStats, getSyncMode, restoreFromCloud, setSyncMode as updateSyncMode, type SyncMode } from "../../lib/sync";
import { IconCloud, IconCloudOff, IconRefresh, IconSpinner, IconCheck, IconDownload, IconLock, IconZap } from "../Icons";
import { useToast } from "../shared/Toast";
import { useConfirmDialog } from "../shared/ConfirmDialog";

interface CloudStats {
  projects: number;
  documents: number;
  annotations: number;
  notes: number;
  last_updated: string | null;
}

interface LocalStats {
  projects: number;
  documents: number;
  annotations: number;
  notes: number;
}

export const CloudSyncPanel: React.FC = () => {
  const { t } = useTranslation();
  const { getToken, user, isGuest } = useAuth();
  const toast = useToast();
  const { confirm, confirmationDialog } = useConfirmDialog();

  const [syncStatus, setSyncStatus] = useState<"synced" | "syncing" | "error" | "offline">("synced");
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [syncMode, setSyncModeState] = useState<SyncMode>(() => getSyncMode());
  const [conflictStrategy, setConflictStrategy] = useState<"auto" | "manual">("auto");
  
  const [cloudStats, setCloudStats] = useState<CloudStats | null>(null);
  const [localStats, setLocalStats] = useState<LocalStats | null>(null);
  const [recentActivities, setRecentActivities] = useState<Array<{ time: string; text: string; type: "success" | "error" | "info" }>>([]);
  
  const [loadingStats, setLoadingStats] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const handleModeChange = (mode: SyncMode) => {
    updateSyncMode(mode);
    setSyncModeState(mode);
    addActivity(t("cloud_sync.sync_mode_title") + ": " + mode, "info");
  };

  const addActivity = (text: string, type: "success" | "error" | "info") => {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setRecentActivities(prev => [{ time, text, type }, ...prev.slice(0, 4)]);
  };

  const loadLastSyncTime = () => {
    setLastSyncTime(localStorage.getItem('rm_last_synced'));
  };

  const loadStats = useCallback(async () => {
    if (isGuest || !user) return;
    setLoadingStats(true);
    try {
      const token = await getToken();
      if (token) {
        const stats = await fetchCloudStats(token);
        setCloudStats(stats);
      }
      
      const pCount = await db.projects.count();
      const dCount = await db.documents.count();
      const aCount = await db.annotations.count();
      const nCount = await db.encrypted_notes.count();
      
      setLocalStats({
        projects: pCount,
        documents: dCount,
        annotations: aCount,
        notes: nCount
      });
    } catch (e) {
      console.error("Failed to load stats", e);
    } finally {
      setLoadingStats(false);
    }
  }, [getToken, isGuest, user]);

  useEffect(() => {
    loadLastSyncTime();
    loadStats();
    
    if (!navigator.onLine) {
      setSyncStatus("offline");
    }

    const handleSyncStart = () => setSyncStatus("syncing");
    const handleSyncEnd = () => setSyncStatus(navigator.onLine ? "synced" : "offline");
    const handleSyncSuccess = () => {
      loadLastSyncTime();
      loadStats();
      setSyncStatus("synced");
      addActivity(t("cloud_sync.activity_synced"), "success");
    };
    const handleSyncError = () => {
      setSyncStatus("error");
      addActivity(t("cloud_sync.activity_error"), "error");
    };

    window.addEventListener("researchmind:sync-start", handleSyncStart);
    window.addEventListener("researchmind:sync-end", handleSyncEnd);
    window.addEventListener("researchmind:sync-success", handleSyncSuccess);
    window.addEventListener("researchmind:sync-error", handleSyncError);

    return () => {
      window.removeEventListener("researchmind:sync-start", handleSyncStart);
      window.removeEventListener("researchmind:sync-end", handleSyncEnd);
      window.removeEventListener("researchmind:sync-success", handleSyncSuccess);
      window.removeEventListener("researchmind:sync-error", handleSyncError);
    };
  }, [loadStats, t]);

  const handleSyncNow = () => {
    window.dispatchEvent(new Event("researchmind:trigger-sync"));
  };

  const handleRestore = async () => {
    if (!user) return;
    const proceed = await confirm(t("cloud_sync.restore_warning") + "\n\n" + t("cloud_sync.restore_confirm"));
    if (!proceed) return;

    setRestoring(true);
    try {
      const token = await getToken();
      if (token) {
        await restoreFromCloud(token);
        toast.addToast("success", t("cloud_sync.restore_success"));
        addActivity(t("cloud_sync.activity_restored"), "success");
        loadStats();
        loadLastSyncTime();
      }
    } catch (e) {
      toast.addToast("error", t("cloud_sync.restore_error"));
    } finally {
      setRestoring(false);
    }
  };

  const handleVerify = async () => {
    setVerifying(true);
    try {
      const token = await getToken();
      let match = false;
      if (token) {
        const cStats = await fetchCloudStats(token);
        const pCount = await db.projects.count();
        const dCount = await db.documents.count();
        const aCount = await db.annotations.count();
        const nCount = await db.encrypted_notes.count();
        
        match = cStats.projects === pCount && 
                cStats.documents === dCount && 
                cStats.annotations === aCount && 
                cStats.notes === nCount;
      }
      
      if (match) {
        toast.addToast("success", t("cloud_sync.verify_match"));
      } else {
        toast.addToast("error", t("cloud_sync.verify_mismatch"));
      }
    } catch (e) {
      toast.addToast("error", t("cloud_sync.verify_error"));
    } finally {
      setVerifying(false);
    }
  };

  if (isGuest) {
    return (
      <div className="cloud-sync-panel">
        <section className="cloud-sync-summary" style={{ display: "flex", gap: "16px", padding: "16px", background: "rgba(255,255,255,0.05)", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.1)" }}>
          <IconCloudOff size={22} />
          <div>
            <h3>{t("cloud_sync.guest_title")}</h3>
            <p>{t("cloud_sync.guest_desc")}</p>
          </div>
        </section>
      </div>
    );
  }

  const getStatusColor = () => {
    if (syncMode === "local_only") return "var(--color-text-muted, #9ca3af)";
    if (syncStatus === "error" || syncStatus === "offline") return "var(--color-error, #ef4444)";
    if (syncStatus === "syncing") return "var(--color-warning, #f59e0b)";
    return "var(--color-success, #2dd4bf)";
  };

  const getSyncModeLabel = () => {
    if (syncMode === "smart") return "🟢 " + t("cloud_sync.mode_smart_title");
    if (syncMode === "manual") return "🟡 " + t("cloud_sync.mode_manual_title");
    return "🔒 " + t("cloud_sync.mode_local_only_title");
  };

  return (
    <div className="cloud-sync-panel">
      <style>{`
        .cloud-sync-panel {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }
        .cloud-sync-header-banner {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 20px;
          background: rgba(45, 212, 191, 0.06);
          border: 1px solid rgba(45, 212, 191, 0.2);
          border-radius: 12px;
        }
        .cloud-sync-mode-pill {
          padding: 4px 10px;
          border-radius: 20px;
          font-size: 0.8rem;
          font-weight: 600;
          background: rgba(255,255,255,0.08);
          border: 1px solid var(--border-color);
        }
        .cloud-sync-warning-banner {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 18px;
          background: rgba(245, 158, 11, 0.1);
          border: 1px solid rgba(245, 158, 11, 0.3);
          border-radius: 10px;
          color: #f59e0b;
          font-size: 0.85rem;
        }
        .cloud-sync-dashboard-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 12px;
        }
        .cloud-sync-dash-card {
          padding: 14px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: 10px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .cloud-sync-dash-label {
          font-size: 0.75rem;
          color: var(--color-text-muted);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .cloud-sync-dash-value {
          font-size: 1.1rem;
          font-weight: 600;
          color: var(--color-text);
        }
        .cloud-sync-modes {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          gap: 14px;
          margin-bottom: 8px;
        }
        .cloud-sync-mode-card {
          padding: 18px;
          background: var(--bg-secondary);
          border: 2px solid var(--border-color);
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          flex-direction: column;
          gap: 10px;
          position: relative;
        }
        .cloud-sync-mode-card:hover {
          border-color: var(--color-primary, #2dd4bf);
          background: rgba(45, 212, 191, 0.03);
        }
        .cloud-sync-mode-card.active {
          border-color: var(--color-primary, #2dd4bf);
          background: rgba(45, 212, 191, 0.08);
        }
        .cloud-sync-mode-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-weight: 600;
          font-size: 0.98rem;
        }
        .cloud-sync-mode-badge {
          font-size: 0.7rem;
          padding: 2px 8px;
          border-radius: 12px;
          background: rgba(45, 212, 191, 0.2);
          color: #2dd4bf;
          font-weight: 600;
        }
        .cloud-sync-mode-bullets {
          display: flex;
          flex-direction: column;
          gap: 4px;
          font-size: 0.78rem;
          color: var(--color-text-muted);
        }
        .cloud-sync-bullet-item {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .cloud-sync-stats {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 14px;
        }
        .cloud-sync-stat-card {
          padding: 16px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: 10px;
        }
        .cloud-sync-stat-title {
          font-size: 0.82rem;
          color: var(--color-text-muted);
          margin-bottom: 8px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          font-weight: 600;
        }
        .cloud-sync-stat-values {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
        }
        .cloud-sync-stat-val {
          font-size: 1.4rem;
          font-weight: 600;
          color: var(--color-text);
        }
        .cloud-sync-stat-label {
          font-size: 0.75rem;
          color: var(--color-text-muted);
        }
        .cloud-sync-activity-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          padding: 12px;
          font-size: 0.8rem;
        }
        .cloud-sync-activity-item {
          display: flex;
          justify-content: space-between;
          color: var(--color-text-muted);
        }
        .cloud-sync-actions {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
          padding-top: 16px;
          border-top: 1px solid var(--border-color);
        }
      `}</style>

      {/* Header Banner with Sync Mode Badge */}
      <section className="cloud-sync-header-banner">
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <IconCloud size={28} style={{ color: getStatusColor() }} />
          <div>
            <h3 style={{ margin: 0, fontSize: "1.1rem" }}>{t("cloud_sync.title")}</h3>
            <p style={{ margin: "2px 0 0 0", fontSize: "0.85rem", opacity: 0.8 }}>{t("cloud_sync.description")}</p>
          </div>
        </div>
        <div className="cloud-sync-mode-pill">
          {getSyncModeLabel()}
        </div>
      </section>

      {/* Local-only Warning Banner if active */}
      {syncMode === "local_only" && (
        <section className="cloud-sync-warning-banner">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <IconLock size={20} />
            <span>{t("cloud_sync.mode_local_only_warning")}</span>
          </div>
          <button 
            className="rm-btn rm-btn-secondary" 
            style={{ fontSize: "0.78rem", padding: "4px 10px" }}
            onClick={() => handleModeChange("smart")}
          >
            {t("cloud_sync.enable_sync_btn")}
          </button>
        </section>
      )}

      {/* Sync Dashboard Status Cards */}
      <section className="cloud-sync-dashboard-grid">
        <div className="cloud-sync-dash-card">
          <span className="cloud-sync-dash-label">{t("cloud_sync.dash_status")}</span>
          <span className="cloud-sync-dash-value" style={{ color: getStatusColor(), display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: getStatusColor() }} />
            {syncMode === "local_only" ? t("cloud_sync.status_local_only") : syncStatus === "syncing" ? t("cloud_sync.status_syncing") : syncStatus === "error" ? t("cloud_sync.status_error") : syncStatus === "offline" ? t("cloud_sync.status_offline") : lastSyncTime ? t("cloud_sync.status_synced") : t("cloud_sync.last_sync_never")}
          </span>
        </div>
        <div className="cloud-sync-dash-card">
          <span className="cloud-sync-dash-label">{t("cloud_sync.last_synced")}</span>
          <span className="cloud-sync-dash-value" style={{ fontSize: "0.95rem" }}>
            {lastSyncTime ? new Date(parseInt(lastSyncTime, 10)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : t("cloud_sync.last_sync_never")}
          </span>
        </div>
        <div className="cloud-sync-dash-card">
          <span className="cloud-sync-dash-label">{t("cloud_sync.cloud_health")}</span>
          <span className="cloud-sync-dash-value" style={{ color: syncStatus === "offline" ? "var(--color-error)" : "#2dd4bf", fontSize: "0.95rem" }}>
            {syncStatus === "offline" ? t("cloud_sync.health_offline") : t("cloud_sync.health_healthy")}
          </span>
        </div>
        <div className="cloud-sync-dash-card">
          <span className="cloud-sync-dash-label">{t("cloud_sync.conflicts_count")}</span>
          <span className="cloud-sync-dash-value" style={{ color: "#2dd4bf" }}>0</span>
        </div>
      </section>

      {/* 3-Level Sync Mode Selector */}
      <section>
        <h4 style={{ marginBottom: "12px", fontSize: "0.95rem", color: "var(--color-text-muted)" }}>{t("cloud_sync.sync_mode_title")}</h4>
        <div className="cloud-sync-modes">
          {/* Smart Sync Card */}
          <div 
            className={`cloud-sync-mode-card ${syncMode === "smart" ? "active" : ""}`}
            onClick={() => handleModeChange("smart")}
          >
            <div className="cloud-sync-mode-header">
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <IconZap size={16} style={{ color: "#2dd4bf" }} />
                {t("cloud_sync.mode_smart_title")}
              </span>
              <span className="cloud-sync-mode-badge">{t("cloud_sync.mode_smart_badge")}</span>
            </div>
            <div style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>{t("cloud_sync.mode_smart_desc")}</div>
            <div className="cloud-sync-mode-bullets">
              <div className="cloud-sync-bullet-item"><IconCheck size={12} style={{ color: "#2dd4bf" }} /> {t("cloud_sync.mode_smart_b1")}</div>
              <div className="cloud-sync-bullet-item"><IconCheck size={12} style={{ color: "#2dd4bf" }} /> {t("cloud_sync.mode_smart_b2")}</div>
              <div className="cloud-sync-bullet-item"><IconCheck size={12} style={{ color: "#2dd4bf" }} /> {t("cloud_sync.mode_smart_b3")}</div>
            </div>
          </div>

          {/* Manual Sync Card */}
          <div 
            className={`cloud-sync-mode-card ${syncMode === "manual" ? "active" : ""}`}
            onClick={() => handleModeChange("manual")}
          >
            <div className="cloud-sync-mode-header">
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <IconRefresh size={16} style={{ color: "#f59e0b" }} />
                {t("cloud_sync.mode_manual_title")}
              </span>
            </div>
            <div style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>{t("cloud_sync.mode_manual_desc")}</div>
            <div className="cloud-sync-mode-bullets">
              <div className="cloud-sync-bullet-item"><IconCheck size={12} style={{ color: "#f59e0b" }} /> {t("cloud_sync.mode_manual_b1")}</div>
              <div className="cloud-sync-bullet-item"><IconCheck size={12} style={{ color: "#f59e0b" }} /> {t("cloud_sync.mode_manual_b2")}</div>
            </div>
          </div>

          {/* Local-only Privacy Card */}
          <div 
            className={`cloud-sync-mode-card ${syncMode === "local_only" ? "active" : ""}`}
            onClick={() => handleModeChange("local_only")}
          >
            <div className="cloud-sync-mode-header">
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <IconLock size={16} style={{ color: "#ef4444" }} />
                {t("cloud_sync.mode_local_only_title")}
              </span>
            </div>
            <div style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>{t("cloud_sync.mode_local_only_desc")}</div>
            <div className="cloud-sync-mode-bullets">
              <div className="cloud-sync-bullet-item"><IconCheck size={12} style={{ color: "#ef4444" }} /> {t("cloud_sync.mode_local_only_b1")}</div>
              <div className="cloud-sync-bullet-item"><IconCheck size={12} style={{ color: "#ef4444" }} /> {t("cloud_sync.mode_local_only_b2")}</div>
              <div className="cloud-sync-bullet-item"><IconCheck size={12} style={{ color: "#ef4444" }} /> {t("cloud_sync.mode_local_only_b4")}</div>
            </div>
          </div>
        </div>
      </section>

      {/* Storage & Item Counts Overview Grid */}
      <section>
        <h4 style={{ marginBottom: "8px", fontSize: "0.95rem", color: "var(--color-text-muted)" }}>{t("cloud_sync.data_overview")}</h4>
        <p style={{ margin: "0 0 14px 0", fontSize: "0.82rem", color: "var(--color-text-muted)", opacity: 0.85 }}>
          {t("cloud_sync.sync_zero_hint")}
        </p>
        {loadingStats ? (
          <div className="rm-loading"><IconSpinner size={18} /> {t("common.loading")}</div>
        ) : (
          <div className="cloud-sync-stats">
            <div className="cloud-sync-stat-card">
              <div className="cloud-sync-stat-title">{t("cloud_sync.projects_label")}</div>
              <div className="cloud-sync-stat-values">
                <div><span className="cloud-sync-stat-val">{localStats?.projects || 0}</span> <span className="cloud-sync-stat-label">Local</span></div>
                <div><span className="cloud-sync-stat-val">{cloudStats?.projects || 0}</span> <span className="cloud-sync-stat-label">Cloud</span></div>
              </div>
            </div>
            <div className="cloud-sync-stat-card">
              <div className="cloud-sync-stat-title">{t("cloud_sync.documents_label")}</div>
              <div className="cloud-sync-stat-values">
                <div><span className="cloud-sync-stat-val">{localStats?.documents || 0}</span> <span className="cloud-sync-stat-label">Local</span></div>
                <div><span className="cloud-sync-stat-val">{cloudStats?.documents || 0}</span> <span className="cloud-sync-stat-label">Cloud</span></div>
              </div>
            </div>
            <div className="cloud-sync-stat-card">
              <div className="cloud-sync-stat-title">{t("cloud_sync.annotations_label")}</div>
              <div className="cloud-sync-stat-values">
                <div><span className="cloud-sync-stat-val">{localStats?.annotations || 0}</span> <span className="cloud-sync-stat-label">Local</span></div>
                <div><span className="cloud-sync-stat-val">{cloudStats?.annotations || 0}</span> <span className="cloud-sync-stat-label">Cloud</span></div>
              </div>
            </div>
            <div className="cloud-sync-stat-card">
              <div className="cloud-sync-stat-title">{t("cloud_sync.notes_label")}</div>
              <div className="cloud-sync-stat-values">
                <div><span className="cloud-sync-stat-val">{localStats?.notes || 0}</span> <span className="cloud-sync-stat-label">Local</span></div>
                <div><span className="cloud-sync-stat-val">{cloudStats?.notes || 0}</span> <span className="cloud-sync-stat-label">Cloud</span></div>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Conflict Resolution Strategy */}
      <section style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", background: "var(--bg-secondary)", borderRadius: 10, border: "1px solid var(--border-color)" }}>
        <div>
          <strong style={{ fontSize: "0.9rem" }}>{t("cloud_sync.conflict_resolution_title")}</strong>
          <p style={{ margin: "2px 0 0 0", fontSize: "0.8rem", color: "var(--color-text-muted)" }}>Select how conflict edits are handled when merging local and cloud versions.</p>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <label style={{ fontSize: "0.82rem", display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
            <input type="radio" name="conflict_strat" checked={conflictStrategy === "auto"} onChange={() => setConflictStrategy("auto")} />
            {t("cloud_sync.conflict_auto")}
          </label>
          <label style={{ fontSize: "0.82rem", display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
            <input type="radio" name="conflict_strat" checked={conflictStrategy === "manual"} onChange={() => setConflictStrategy("manual")} />
            {t("cloud_sync.conflict_manual")}
          </label>
        </div>
      </section>

      {/* Recent Sync Activity Log */}
      <section>
        <h4 style={{ marginBottom: "10px", fontSize: "0.95rem", color: "var(--color-text-muted)" }}>{t("cloud_sync.recent_activity")}</h4>
        <div className="cloud-sync-activity-list">
          {recentActivities.length === 0 ? (
            <div style={{ opacity: 0.7, fontStyle: "italic" }}>{t("cloud_sync.activity_empty")}</div>
          ) : (
            recentActivities.map((act, idx) => (
              <div key={idx} className="cloud-sync-activity-item">
                <span>{act.text}</span>
                <span style={{ opacity: 0.7 }}>{act.time}</span>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Reordered Polished Action Buttons */}
      <div className="cloud-sync-actions">
        {/* 1. Sync Now */}
        <button 
          className="rm-btn rm-btn-primary" 
          onClick={handleSyncNow}
          disabled={syncMode === "local_only" || syncStatus === "syncing" || syncStatus === "offline"}
        >
          {syncStatus === "syncing" ? <IconSpinner size={14} /> : <IconRefresh size={14} />}
          {t("cloud_sync.sync_now")}
        </button>

        {/* 2. Restore from Cloud */}
        <button 
          className="rm-btn rm-btn-secondary" 
          style={{ color: syncMode === "local_only" ? "var(--color-text-muted)" : "var(--color-warning, #f59e0b)" }}
          onClick={handleRestore}
          disabled={syncMode === "local_only" || restoring || syncStatus === "offline"}
        >
          {restoring ? <IconSpinner size={14} /> : <IconDownload size={14} />}
          {t("cloud_sync.restore_cloud")}
        </button>

        {/* 3. Verify Cloud Backup */}
        <button 
          className="rm-btn rm-btn-secondary" 
          style={{ marginLeft: "auto" }}
          onClick={handleVerify}
          disabled={syncMode === "local_only" || verifying || loadingStats || syncStatus === "offline"}
        >
          {verifying ? <IconSpinner size={14} /> : <IconCheck size={14} />}
          {t("cloud_sync.verify_data")}
        </button>
      </div>

      {confirmationDialog}
    </div>
  );
};
