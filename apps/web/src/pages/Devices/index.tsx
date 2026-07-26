import React, { useEffect, useState, useMemo } from "react";
import type { Device, SyncStatus } from "@researchmind/types";
import { listDevices, revokeDevice, renameDevice, forceSync, createDeviceBackup } from "@/services/devices";
import { Badge, Button, Card, CardContent, EmptyState } from "@researchmind/ui";
import { Loading } from "@/components/common/Loading";
import { formatRelativeTime, formatBytes } from "@researchmind/utils";
import { t, tpl } from "@/i18n";
import {
  Monitor, Laptop, Smartphone, Globe, Wifi, WifiOff,
  RefreshCw, Trash2, Download, ChevronDown, ChevronRight,
  Pencil, Check, X, HardDrive, Clock, Bug, Activity,
  Server, Database, Shield, Upload, Layers, Calendar,
} from "lucide-react";

const platformIcons: Record<string, React.ReactNode> = {
  desktop: <Monitor className="h-4 w-4" />,
  laptop: <Laptop className="h-4 w-4" />,
  web: <Globe className="h-4 w-4" />,
  mobile: <Smartphone className="h-4 w-4" />,
};

const syncStyles: Record<string, string> = {
  synced: "text-emerald-400 bg-emerald-500/10",
  syncing: "text-amber-400 bg-amber-500/10",
  pending: "text-sky-400 bg-sky-500/10",
  conflict: "text-rose-400 bg-rose-500/10",
  offline: "text-slate-500 bg-slate-800",
  error: "text-rose-400 bg-rose-500/10",
};

const wsSyncStyles: Record<string, string> = {
  synced: "text-emerald-400",
  syncing: "text-amber-400",
  pending: "text-sky-400",
  conflict: "text-rose-400",
  offline: "text-slate-500",
  error: "text-rose-400",
};

type TimeBucket = "today" | "yesterday" | "older";

function getTimeBucket(ts: string): TimeBucket {
  const d = new Date(ts);
  const now = new Date();
  const daysDiff = Math.floor((new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 86400000);
  if (daysDiff === 0) return "today";
  if (daysDiff === 1) return "yesterday";
  return "older";
}

const BUCKET_ORDER: TimeBucket[] = ["today", "yesterday", "older"];

function SyncProgressBar({ progress, status }: { progress?: number; status: SyncStatus }) {
  if (status !== "syncing" || progress === undefined || progress === 0) return null;

  const stage = progress < 33 ? "uploading" : progress < 66 ? "downloading" : progress < 100 ? "verifying" : "completed";

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-amber-400 font-medium">{t(`devices.syncProgress.${stage}`)}</span>
        <span className="text-slate-500">{Math.round(progress)}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
        <div
          className="h-full rounded-full bg-gradient-to-r from-amber-400 via-sky-400 to-emerald-400 transition-all duration-500"
          style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
        />
      </div>
    </div>
  );
}

function ActivityTimeline({ activities }: { activities: { type: string; title: string; timestamp: string }[] }) {
  const buckets = useMemo(() => {
    const map = new Map<TimeBucket, typeof activities>();
    for (const a of activities) {
      const b = getTimeBucket(a.timestamp);
      if (!map.has(b)) map.set(b, []);
      map.get(b)!.push(a);
    }
    return BUCKET_ORDER.filter((b) => map.has(b)).map((b) => ({ bucket: b, items: map.get(b)! }));
  }, [activities]);

  return (
    <div className="space-y-3">
      {buckets.map(({ bucket, items }) => (
        <div key={bucket}>
          <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
            {t(`devices.activity.${bucket}`)}
          </h4>
          <div className="ml-1 space-y-1.5">
            {items.map((act, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-slate-700" />
                <span className="text-slate-500 w-10 shrink-0">
                  {new Date(act.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
                <span className="text-slate-400">{act.title}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Device Detail Card ───
function DeviceDetailCard({
  device: initialDevice,
  onRevoke,
  onRefresh,
}: {
  device: Device;
  onRevoke: (id: string) => void;
  onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(initialDevice.name);
  const [busy, setBusy] = useState(false);
  const [device, setDevice] = useState(initialDevice);

  useEffect(() => { setDevice(initialDevice); }, [initialDevice]);

  async function handleRename() {
    if (!newName.trim() || newName === device.name) { setRenaming(false); return; }
    setBusy(true);
    try {
      await renameDevice(device.id, newName.trim());
      setDevice((d) => ({ ...d, name: newName.trim() }));
    } catch { /* ignore */ }
    setBusy(false);
    setRenaming(false);
  }

  async function handleForceSync() {
    setBusy(true);
    try {
      await forceSync(device.id);
    } catch { /* ignore */ }
    setBusy(false);
  }

  async function handleCreateBackup() {
    setBusy(true);
    try {
      await createDeviceBackup(device.id);
      onRefresh();
    } catch { /* ignore */ }
    setBusy(false);
  }

  return (
    <Card>
      <CardContent className="space-y-3">
        {/* ── Header ─────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-800 text-slate-400">
              {platformIcons[device.platform] || <Monitor className="h-4 w-4" />}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                {renaming ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") void handleRename(); if (e.key === "Escape") { setRenaming(false); setNewName(device.name); } }}
                      placeholder={t("devices.rename.placeholder")}
                      className="w-40 rounded-md border border-slate-700 bg-slate-900 px-2 py-0.5 text-sm text-slate-200 outline-none focus:border-sky-500"
                      autoFocus
                    />
                    <button onClick={() => void handleRename()} className="rounded p-0.5 text-emerald-400 hover:text-emerald-300"><Check className="h-3.5 w-3.5" /></button>
                    <button onClick={() => { setRenaming(false); setNewName(device.name); }} className="rounded p-0.5 text-slate-500 hover:text-slate-300"><X className="h-3.5 w-3.5" /></button>
                  </div>
                ) : (
                  <>
                    <h3 className="font-semibold text-slate-50 truncate max-w-[200px]">{device.name}</h3>
                    <button onClick={() => { setNewName(device.name); setRenaming(true); }} className="rounded p-0.5 text-slate-600 hover:text-slate-400">
                      <Pencil className="h-3 w-3" />
                    </button>
                    {device.current && <Badge tone="info" className="text-[10px] shrink-0">{t("devices.thisDevice")}</Badge>}
                  </>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                {device.os && <span>{device.os}</span>}
                {device.version && <span>v{device.version}</span>}
                {device.platform && <span className="capitalize">{device.platform}</span>}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${syncStyles[device.syncStatus] || syncStyles.synced}`}>
              {device.online ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
              {device.online ? t("devices.online") : t("devices.offline")}
            </span>
            <button onClick={() => setExpanded(!expanded)} className="rounded-lg p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-200">
              {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* ── Sync status row ────────────────────── */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 ${syncStyles[device.syncStatus] || syncStyles.synced}`}>
            {t("devices.status." + device.syncStatus)}
          </span>
          <span className="text-slate-500">{t("devices.info.lastSync")}: {device.lastSyncAt ? formatRelativeTime(device.lastSyncAt) : "—"}</span>
          {device.storageBytes !== undefined && (
            <span className="text-slate-500">{formatBytes(device.storageBytes)}</span>
          )}
          <span className="text-slate-500">{device.workspaceCount} {t("devices.info.workspaces")}</span>
        </div>

        {/* ── Sync progress bar ──────────────────── */}
        {expanded && <SyncProgressBar progress={device.syncProgress} status={device.syncStatus} />}

        {/* ── Expanded details ───────────────────── */}
        {expanded && (
          <div className="space-y-4 border-t border-slate-800/60 pt-3">
            {/* Info grid */}
            <div>
              <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-600">{t("devices.col.os")}</h4>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {device.os && (
                  <div><span className="text-[10px] text-slate-600">{t("devices.info.os")}</span><p className="text-xs text-slate-300">{device.os}</p></div>
                )}
                {device.version && (
                  <div><span className="text-[10px] text-slate-600">{t("devices.info.version")}</span><p className="text-xs text-slate-300">v{device.version}</p></div>
                )}
                {device.architecture && (
                  <div><span className="text-[10px] text-slate-600">{t("devices.info.architecture")}</span><p className="text-xs text-slate-300">{device.architecture}</p></div>
                )}
                {device.timezone && (
                  <div><span className="text-[10px] text-slate-600">{t("devices.info.timezone")}</span><p className="text-xs text-slate-300">{device.timezone}</p></div>
                )}
                {device.cpu && (
                  <div><span className="text-[10px] text-slate-600">{t("devices.info.cpu")}</span><p className="text-xs text-slate-300">{device.cpu}</p></div>
                )}
                {device.ram && (
                  <div><span className="text-[10px] text-slate-600">{t("devices.info.ram")}</span><p className="text-xs text-slate-300">{device.ram}</p></div>
                )}
                {device.diskRemaining && (
                  <div><span className="text-[10px] text-slate-600">{t("devices.info.disk")}</span><p className="text-xs text-slate-300">{device.diskRemaining}</p></div>
                )}
                {device.lastIp && (
                  <div><span className="text-[10px] text-slate-600">{t("devices.info.ip")}</span><p className="text-xs font-mono text-slate-300">{device.lastIp}</p></div>
                )}
                <div><span className="text-[10px] text-slate-600">{t("devices.info.lastLogin")}</span><p className="text-xs text-slate-300">{device.lastLoginAt ? formatRelativeTime(device.lastLoginAt) : "—"}</p></div>
              </div>
            </div>

            {/* Workspaces with sync status */}
            {device.workspaces && device.workspaces.length > 0 && (
              <div>
                <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                  <Layers className="h-3 w-3" />
                  {t("devices.sections.workspaces")}
                </h4>
                <div className="space-y-1">
                  {device.workspaces.map((ws) => {
                    const wsStatus = (ws as any).syncStatus || "synced";
                    return (
                      <div key={ws.id} className="flex items-center justify-between text-xs">
                        <span className="text-slate-300">{ws.name}</span>
                        <span className={`inline-flex items-center gap-1 font-medium ${wsSyncStyles[wsStatus] || wsSyncStyles.synced}`}>
                          {wsStatus === "synced" && "✓"}
                          {wsStatus === "syncing" && "⏳"}
                          {wsStatus === "conflict" && "⚠"}
                          {wsStatus === "pending" && "○"}
                          {t("devices.status." + wsStatus)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Activity timeline */}
            {device.recentActivity && device.recentActivity.length > 0 && (
              <div>
                <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                  <Activity className="h-3 w-3" />
                  {t("devices.sections.activity")}
                </h4>
                <ActivityTimeline activities={device.recentActivity} />
              </div>
            )}

            {/* Backup section */}
            <div>
              <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                <Download className="h-3 w-3" />
                {t("devices.sections.backup")}
              </h4>
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-2.5">
                  <div className="text-[10px] text-slate-600">{t("devices.backup.lastBackup")}</div>
                  <div className="mt-0.5 text-xs text-slate-300">
                    {device.lastBackupAt ? formatRelativeTime(device.lastBackupAt) : "—"}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-2.5">
                  <div className="text-[10px] text-slate-600">{t("devices.backup.nextAuto")}</div>
                  <div className="mt-0.5 text-xs text-slate-300">
                    {device.nextBackupAt ? formatRelativeTime(device.nextBackupAt)
                      : tpl("devices.backup.tonight", { time: "02:00" })}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-2.5">
                  <div className="text-[10px] text-slate-600">{t("devices.backup.restorePoints")}</div>
                  <div className="mt-0.5 text-xs text-slate-300">{device.restorePointCount ?? "—"}</div>
                </div>
              </div>
              <Button size="sm" variant="ghost" className="mt-1.5 h-7 text-xs" onClick={() => void handleCreateBackup()}>
                <Download className="mr-1 h-3 w-3" />{t("devices.backup.create")}
              </Button>
            </div>

            {/* Storage breakdown */}
            <div>
              <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                <HardDrive className="h-3 w-3" />
                {t("devices.sections.storage")}
              </h4>
              <div className="space-y-1.5">
                {[
                  { key: "metadata" as const, bytes: device.storageMetadataBytes ?? (device.storageBytes ? Math.round(device.storageBytes * 0.1) : undefined) },
                  { key: "reports" as const, bytes: device.storageReportsBytes ?? (device.storageBytes ? Math.round(device.storageBytes * 0.3) : undefined) },
                  { key: "backups" as const, bytes: device.storageBackupsBytes ?? (device.backupSizeBytes ?? undefined) },
                ].filter((s) => s.bytes !== undefined).map((s) => (
                  <div key={s.key} className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">{t(`devices.storage.${s.key}`)}</span>
                    <span className="text-slate-300">{formatBytes(s.bytes!)}</span>
                  </div>
                ))}
                {device.storageBytes !== undefined && (
                  <div className="flex items-center justify-between text-xs border-t border-slate-800/40 pt-1">
                    <span className="text-slate-400 font-medium">{t("common.total")}</span>
                    <span className="text-slate-200 font-medium">{formatBytes(device.storageBytes)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Sync Health */}
            <div>
              <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                <Shield className="h-3 w-3" />
                {t("devices.sections.syncHealth")}
              </h4>
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-2.5">
                  <div className="text-[10px] text-slate-600">{t("devices.syncHealth.percentage")}</div>
                  <div className="mt-0.5 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800">
                      <div
                        className="h-full rounded-full bg-emerald-400"
                        style={{ width: `${device.syncHealthPercent ?? (device.failedSync ? Math.max(0, 100 - device.failedSync * 5) : 98)}%` }}
                      />
                    </div>
                    <span className="text-xs text-slate-300">{device.syncHealthPercent ?? (device.failedSync ? Math.max(0, 100 - device.failedSync * 5) : 98)}%</span>
                  </div>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-2.5">
                  <div className="text-[10px] text-slate-600 flex items-center gap-1">
                    <Bug className="h-3 w-3" />{t("devices.syncHealth.lastError")}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-300">
                    {device.lastErrorAt ? tpl("devices.syncHealth.ago", { time: formatRelativeTime(device.lastErrorAt) }) : "—"}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-2.5">
                  <div className="text-[10px] text-slate-600">{t("devices.syncHealth.avgTime")}</div>
                  <div className="mt-0.5 text-xs text-slate-300">
                    {device.avgSyncTimeMs ? `${(device.avgSyncTimeMs / 1000).toFixed(1)}s` : "—"}
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-2 border-t border-slate-800/40 pt-2">
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => void handleForceSync()} loading={busy}>
                <RefreshCw className="mr-1 h-3 w-3" />{t("devices.actions.forceSync")}
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => void handleCreateBackup()} loading={busy}>
                <Download className="mr-1 h-3 w-3" />{t("devices.actions.createBackup")}
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs text-rose-400 hover:text-rose-300" onClick={() => onRevoke(device.id)}>
                <Trash2 className="mr-1 h-3 w-3" />{t("devices.actions.disconnect")}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function DevicesPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await listDevices();
      setDevices(res.data);
    } catch {
      setDevices([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const onlineDevices = devices.filter((d) => d.online);
  const offlineDevices = devices.filter((d) => !d.online);
  const pendingCount = devices.reduce((s, d) => s + (d.pendingSync || 0), 0);

  if (loading) return <Loading />;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="page-title">{t("devices.title")}</h2>
        <p className="page-subtitle">{t("devices.subtitle")}</p>
      </div>

      {devices.length === 0 ? (
        <EmptyState
          icon={<Monitor className="h-8 w-8" />}
          title={t("devices.empty.title")}
          description={t("devices.empty.description")}
          action={<Button size="sm">{t("devices.empty.action")}</Button>}
        />
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid gap-3 sm:grid-cols-4">
            <Card><CardContent><div className="text-xs text-slate-500">{t("devices.summaryCards.total")}</div><div className="text-2xl font-bold text-slate-50">{devices.length}</div></CardContent></Card>
            <Card><CardContent><div className="text-xs text-slate-500">{t("devices.summaryCards.online")}</div><div className="text-2xl font-bold text-emerald-300">{onlineDevices.length}</div></CardContent></Card>
            <Card><CardContent><div className="text-xs text-slate-500">{t("devices.summaryCards.offlineCount")}</div><div className="text-2xl font-bold text-slate-400">{offlineDevices.length}</div></CardContent></Card>
            <Card><CardContent><div className="text-xs text-slate-500">{t("devices.summaryCards.pendingSync")}</div><div className="text-2xl font-bold text-amber-300">{pendingCount}</div></CardContent></Card>
          </div>

          {/* Online devices */}
          {onlineDevices.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">{t("devices.online")} ({onlineDevices.length})</h3>
              <div className="space-y-2">
                {onlineDevices.map((d) => (
                  <DeviceDetailCard key={d.id} device={d} onRevoke={setRevokingId} onRefresh={load} />
                ))}
              </div>
            </div>
          )}

          {/* Offline devices */}
          {offlineDevices.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">{t("devices.offline")} ({offlineDevices.length})</h3>
              <div className="space-y-2">
                {offlineDevices.map((d) => (
                  <DeviceDetailCard key={d.id} device={d} onRevoke={setRevokingId} onRefresh={load} />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Revoke confirm modal */}
      {revokingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <Card className="mx-4 w-full max-w-md">
            <CardContent className="space-y-4">
              <h3 className="text-base font-semibold text-slate-100">{t("devices.revokeConfirm.title")}</h3>
              <p className="text-sm text-slate-400">{t("devices.revokeConfirm.description")}</p>
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="outline" onClick={() => setRevokingId(null)}>{t("common.cancel")}</Button>
                <Button size="sm" variant="danger" loading={busy} onClick={async () => {
                  setBusy(true);
                  try {
                    await revokeDevice(revokingId);
                    await load();
                  } catch { /* ignore */ }
                  setBusy(false);
                  setRevokingId(null);
                }}>{t("devices.revoke")}</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
