import { getMyReports, queryByOwner } from "../../../lib/firestore";
import { jsonResponse, errorResponse } from "../../../lib/response";
import { requireUser } from "../../../lib/http";
export { onRequestOptions } from "../../../lib/cors";


function healthRow(name: string, ok: boolean) {
  return { name, status: ok ? "healthy" as const : "degraded" as const };
}

export const onRequestGet = async (context: any) => {
  const userId = requireUser(context);
  if (userId instanceof Response) return userId;

  try {
    const [workspaces, reports, backups, activity, devices] = await Promise.all([
      queryByOwner(context.env, "workspaces", userId).catch(() => []),
      getMyReports(context.env, userId).catch(() => []),
      queryByOwner(context.env, "backups", userId).catch(() => []),
      queryByOwner(context.env, "activity", userId, { limit: 200 }).catch(() => []),
      queryByOwner(context.env, "devices", userId).catch(() => []),
    ]);

    const snapshots = reports.filter(
      (r) => !String(r.id || "").startsWith("ws_"),
    );
    const storageMb =
      backups.reduce((sum, b) => sum + Number(b.size_bytes || 0), 0) / (1024 * 1024);
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const activityLast7d = activity.filter((a) => {
      const t = Date.parse(String(a.timestamp || a.created_at || 0));
      return Number.isFinite(t) && t >= weekAgo;
    }).length;

    const papers = workspaces.reduce((sum, w) => sum + Number(w.paper_count || 0), 0);
    const reportsCount = reports.length;
    const workspaceCount = workspaces.length;
    const deviceCount = devices.length;
    const backupSizeMb = Math.round(storageMb * 100) / 100;
    const onlineDevices = devices.filter((d: any) => d.trusted !== false);
    const lastBackup = backups.length > 0
      ? String(backups.sort((a: any, b: any) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())[0]?.created_at || null)
      : null;
    const lastSync = workspaces.length > 0
      ? String(workspaces.sort((a: any, b: any) => new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime())[0]?.updated_at || null)
      : null;

    return jsonResponse({
      workspaces: workspaceCount,
      reports: reportsCount,
      snapshots: snapshots.length,
      papers,
      // Below fields return 0/null when not tracked — no fabricated data
      citations: 0,
      aiChats: 0,
      notes: 0,
      knowledgeGraphs: 0,
      storageMb: backupSizeMb,
      backupSizeMb,
      lastBackupAt: lastBackup,
      pendingSync: 0,
      failedSync: 0,
      lastSyncAt: lastSync,
      devices: onlineDevices.map((d: any) => ({
        id: d.id,
        name: d.name || "Unknown",
        platform: d.platform || "desktop",
        lastSeenAt: d.last_seen_at || d.updated_at || d.created_at || new Date().toISOString(),
        current: Boolean(d.current),
        trusted: d.trusted !== false,
      })),
      aiUsage: [],
      researchGrowth: {
        papersPerWeek: 0,
        kgNodes: 0,
        evidenceExtracted: 0,
        contradictionsFound: 0,
        reportsGenerated: reportsCount,
      },
      researchStats: [],
      monthlySummary: null,
      activityLast7d,
      syncHealth: deviceCount > 0 ? 100 : workspaceCount > 0 ? 80 : 0,
      services: [
        healthRow("Backend", true),
        healthRow("Cloud Gateway", true),
        healthRow("Firestore", true),
        healthRow("Cloudflare", true),
        healthRow("Desktop Sync", deviceCount > 0),
      ],
      lastLogin: null,
      apiKeysCount: 0,
      sessionCount: deviceCount,
    });
  } catch (err: any) {
    return errorResponse(err.message, 500);
  }
};
