import { queryByOwner, processEventSideEffects, softDeleteDocument, upsertDocument, getDocument } from "../../../lib/firestore";
import { jsonResponse, errorResponse } from "../../../lib/response";
import { nowIso, readJson, requireUser } from "../../../lib/http";
export { onRequestOptions } from "../../../lib/cors";


export const onRequestGet = async (context: any) => {
  const userId = requireUser(context);
  if (userId instanceof Response) return userId;

  try {
    const rows = await queryByOwner(context.env, "devices", userId, {
      orderBy: "last_seen_at",
    });
    return jsonResponse({
      data: rows.map((d) => ({
        id: d.id,
        name: d.name || "Unknown",
        platform: d.platform || "desktop",
        os: d.os || undefined,
        version: d.version || undefined,
        architecture: d.architecture || undefined,
        timezone: d.timezone || undefined,
        lastSeenAt: d.last_seen_at || d.created_at,
        lastSyncAt: d.last_sync_at || undefined,
        lastLoginAt: d.last_login_at || undefined,
        createdAt: d.created_at,
        current: Boolean(d.current),
        trusted: d.trusted !== false,
        online: d.online !== false,
        syncStatus: d.sync_status || "synced",
        syncProgress: d.sync_progress !== undefined ? Number(d.sync_progress) : undefined,
        storageBytes: d.storage_bytes ? Number(d.storage_bytes) : undefined,
        workspaceCount: Number(d.workspace_count || 0),
        workspaces: Array.isArray(d.workspaces) ? d.workspaces : [],
        lastIp: d.last_ip || undefined,
        pendingSync: Number(d.pending_sync || 0),
        uploading: Number(d.uploading || 0),
        downloading: Number(d.downloading || 0),
        failedSync: Number(d.failed_sync || 0),
        lastBackupAt: d.last_backup_at || undefined,
        backupSizeBytes: d.backup_size_bytes ? Number(d.backup_size_bytes) : undefined,
        recentActivity: Array.isArray(d.recent_activity) ? d.recent_activity : [],
      })),
      total: rows.length,
    });
  } catch (err: any) {
    return errorResponse(err.message, 500);
  }
};

export const onRequestPost = async (context: any) => {
  const userId = requireUser(context);
  if (userId instanceof Response) return userId;
  const body = await readJson(context.request);
  if (body instanceof Response) return body;

  const deviceId = String(body.device_id || body.id || "").trim();
  const name = String(body.name || "Unknown device").trim();
  if (!deviceId) return errorResponse("device_id is required", 400);

  const ts = nowIso();
  const platform = body.platform || (/web/i.test(name) ? "web" : /mobile|android|ios/i.test(name) ? "mobile" : "desktop");

  try {
    // Clear current flag on other devices
    const existing = await queryByOwner(context.env, "devices", userId).catch(() => []);
    await Promise.all(
      existing
        .filter((d) => d.id !== deviceId && d.current)
        .map((d) =>
          upsertDocument(context.env, "devices", String(d.id), {
            ...d,
            current: false,
            updated_at: ts,
          }),
        ),
    );

    const doc = {
      id: deviceId,
      owner_uid: userId,
      name,
      platform,
      last_seen_at: ts,
      current: true,
      trusted: true,
      created_at: existing.find((d) => d.id === deviceId)?.created_at || ts,
      updated_at: ts,
    };
    await upsertDocument(context.env, "devices", deviceId, doc);
    await processEventSideEffects(context.env, {
      event_type: "cloud.device_linked",
      actor_id: userId,
      owner_uid: userId,
      title: "Device linked",
      detail: name,
      payload: { device_id: deviceId, platform },
    });
    return jsonResponse({ device_id: deviceId, registered: true, ...doc }, 201);
  } catch (err: any) {
    return errorResponse(err.message, 500);
  }
};
