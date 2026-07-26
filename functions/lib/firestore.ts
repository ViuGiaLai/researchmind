import jwt from "@tsndr/cloudflare-worker-jwt";

export interface Env {
  FIREBASE_PROJECT_ID: string;
  FIREBASE_CLIENT_EMAIL: string;
  FIREBASE_PRIVATE_KEY: string;
}

let cachedAccessToken: string | null = null;
let tokenExpiration = 0;

async function getAccessToken(env: Env): Promise<string> {
  if (cachedAccessToken && Date.now() < tokenExpiration) {
    return cachedAccessToken;
  }

  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 3600;

  const clientEmail = (env.FIREBASE_CLIENT_EMAIL || "").trim().replace(/^"|"$/g, "");
  let privateKey = (env.FIREBASE_PRIVATE_KEY || "").trim().replace(/^"|"$/g, "");
  privateKey = privateKey.replace(/\\n/g, "\n");

  const payload = {
    iss: clientEmail,
    sub: clientEmail,
    aud: "https://oauth2.googleapis.com/token",
    scope: "https://www.googleapis.com/auth/datastore",
    iat,
    exp,
  };

  const token = await jwt.sign(payload, privateKey, { algorithm: "RS256" });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: token,
    }),
  });

  const data = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!response.ok) {
    throw new Error(`Failed to get Firestore access token: ${JSON.stringify(data)}`);
  }

  cachedAccessToken = data.access_token || null;
  tokenExpiration = Date.now() + ((data.expires_in || 3600) - 60) * 1000;
  return cachedAccessToken as string;
}

function projectIdOf(env: Env): string {
  return (env.FIREBASE_PROJECT_ID || "").trim().replace(/^"|"$/g, "");
}

function docUrl(env: Env, collection: string, id: string): string {
  return `https://firestore.googleapis.com/v1/projects/${projectIdOf(env)}/databases/(default)/documents/${collection}/${encodeURIComponent(id)}`;
}

function queryUrl(env: Env): string {
  return `https://firestore.googleapis.com/v1/projects/${projectIdOf(env)}/databases/(default)/documents:runQuery`;
}

export function jsonToFirestore(obj: unknown): Record<string, unknown> {
  if (obj === null || obj === undefined) return { nullValue: null };
  if (typeof obj === "boolean") return { booleanValue: obj };
  if (typeof obj === "string") return { stringValue: obj };
  if (typeof obj === "number") {
    return Number.isInteger(obj) ? { integerValue: String(obj) } : { doubleValue: obj };
  }
  if (Array.isArray(obj)) {
    return { arrayValue: { values: obj.map(jsonToFirestore) } };
  }
  if (typeof obj === "object") {
    const fields: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (value !== undefined) fields[key] = jsonToFirestore(value);
    }
    return { mapValue: { fields } };
  }
  return { nullValue: null };
}

export function firestoreToJson(obj: any): any {
  if (!obj) return obj;
  if ("nullValue" in obj) return null;
  if ("booleanValue" in obj) return obj.booleanValue;
  if ("stringValue" in obj) return obj.stringValue;
  if ("integerValue" in obj) return parseInt(obj.integerValue, 10);
  if ("doubleValue" in obj) return parseFloat(obj.doubleValue);
  if ("arrayValue" in obj) {
    return (obj.arrayValue.values || []).map(firestoreToJson);
  }
  if ("mapValue" in obj) {
    const res: Record<string, unknown> = {};
    const fields = obj.mapValue.fields || {};
    for (const key in fields) {
      res[key] = firestoreToJson(fields[key]);
    }
    return res;
  }
  return obj;
}

export async function upsertDocument(
  env: Env,
  collection: string,
  id: string,
  data: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const token = await getAccessToken(env);
  const doc = { fields: (jsonToFirestore(data) as any).mapValue.fields };
  const res = await fetch(docUrl(env, collection, id), {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(doc),
  });
  if (!res.ok) {
    throw new Error(`Firestore upsert ${collection}/${id}: ${await res.text()}`);
  }
  return { id, ...data };
}

export async function getDocument(
  env: Env,
  collection: string,
  id: string,
): Promise<Record<string, unknown> | null> {
  const token = await getAccessToken(env);
  const res = await fetch(docUrl(env, collection, id), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Firestore get ${collection}/${id}: ${await res.text()}`);
  const data = (await res.json()) as any;
  return { id, ...firestoreToJson({ mapValue: { fields: data.fields } }) };
}

export async function deleteDocument(
  env: Env,
  collection: string,
  id: string,
): Promise<void> {
  const token = await getAccessToken(env);
  const res = await fetch(docUrl(env, collection, id), {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Firestore delete ${collection}/${id}: ${await res.text()}`);
  }
}

export async function softDeleteDocument(
  env: Env,
  collection: string,
  id: string,
  deletedBy: string,
): Promise<void> {
  const existing = (await getDocument(env, collection, id)) || { id };
  await upsertDocument(env, collection, id, {
    ...existing,
    deleted_at: new Date().toISOString(),
    deleted_by: deletedBy,
    updated_at: new Date().toISOString(),
  });
}

export type OwnerQueryOptions = {
  ownerField?: string;
  orderBy?: string;
  limit?: number;
  extraFilters?: Array<{
    field: string;
    op: "EQUAL" | "IN";
    value: string | number | boolean;
  }>;
};

/**
 * Query Firestore by owner_uid with server-side defense-in-depth filtering.
 * The Firestore REST API query filters at the database level, and the
 * application layer re-validates owner_uid to prevent data leaks even if
 * the Firestore query is compromised or misconfigured.
 */
export async function queryByOwner(
  env: Env,
  collection: string,
  ownerUid: string,
  options: OwnerQueryOptions = {},
): Promise<Record<string, unknown>[]> {
  const token = await getAccessToken(env);
  const ownerField = options.ownerField || "owner_uid";
  const filters: unknown[] = [
    {
      fieldFilter: {
        field: { fieldPath: ownerField },
        op: "EQUAL",
        value: { stringValue: ownerUid },
      },
    },
  ];

  for (const f of options.extraFilters || []) {
    let value: Record<string, unknown>;
    if (typeof f.value === "boolean") value = { booleanValue: f.value };
    else if (typeof f.value === "number") {
      value = Number.isInteger(f.value)
        ? { integerValue: String(f.value) }
        : { doubleValue: f.value };
    } else value = { stringValue: f.value };

    filters.push({
      fieldFilter: {
        field: { fieldPath: f.field },
        op: f.op,
        value,
      },
    });
  }

  // Equality-only query — avoid Firestore composite indexes (owner_uid + orderBy).
  // Sort + limit are applied client-side after fetch.
  const structuredQuery: Record<string, unknown> = {
    from: [{ collectionId: collection }],
    where:
      filters.length === 1
        ? filters[0]
        : { compositeFilter: { op: "AND", filters } },
  };

  const res = await fetch(queryUrl(env), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ structuredQuery }),
  });

  if (!res.ok) throw new Error(`Firestore query ${collection}: ${await res.text()}`);
  const results = (await res.json()) as any[];

  let rows = results
    .filter((r) => r.document)
    .map((r) => {
      const id = r.document.name.split("/").pop();
      const data = firestoreToJson({ mapValue: { fields: r.document.fields } });
      return { id, ...data };
    })
    .filter((r) => !r.deleted_at);

  // Defense-in-depth: application-level owner validation
  if (ownerField === "owner_uid") {
    rows = ownedBy(rows, ownerUid);
  }

  if (options.orderBy) {
    const key = options.orderBy;
    rows = rows.sort((a, b) => {
      const ta = Date.parse(String(a[key] || a.updated_at || a.created_at || a.timestamp || 0));
      const tb = Date.parse(String(b[key] || b.updated_at || b.created_at || b.timestamp || 0));
      return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
    });
  }

  if (options.limit && options.limit > 0) {
    rows = rows.slice(0, options.limit);
  }

  return rows;
}

export async function recordActivity(
  env: Env,
  entry: {
    owner_uid: string;
    type: string;
    title: string;
    detail: string;
    workspace_id?: string;
    actor_id?: string;
    actor_name?: string;
  },
): Promise<void> {
  const id = `act_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
  await upsertDocument(env, "activity", id, {
    ...entry,
    timestamp: new Date().toISOString(),
    created_at: new Date().toISOString(),
  });
}

// ─── Report helpers (existing contract — used by desktop + web) ───

export async function saveWorkspaceReport(env: Env, workspaceId: string, data: any) {
  return upsertDocument(env, "workspace_reports", workspaceId, data);
}

export async function getWorkspaceReport(env: Env, workspaceId: string) {
  return getDocument(env, "workspace_reports", workspaceId);
}

export async function createSnapshotReport(env: Env, id: string, data: any) {
  return upsertDocument(env, "report_snapshots", id, data);
}

export async function getSnapshotReport(env: Env, id: string) {
  return getDocument(env, "report_snapshots", id);
}

export async function getReport(env: Env, id: string) {
  const wsDoc = await getWorkspaceReport(env, id).catch(() => null);
  if (wsDoc) return wsDoc;

  const snapDoc = await getSnapshotReport(env, id).catch(() => null);
  if (snapDoc) return snapDoc;

  return getDocument(env, "reports", id);
}

export async function createReport(env: Env, id: string, data: any) {
  return createSnapshotReport(env, id, data);
}

export async function updateReport(env: Env, id: string, partialData: any) {
  const existing = await getReport(env, id);
  if (!existing) throw new Error("Report not found");

  const collection = id.startsWith("ws_")
    ? "workspace_reports"
    : existing.id && String(existing.id).startsWith("ws_")
      ? "workspace_reports"
      : "report_snapshots";

  // Try legacy reports collection if neither known
  let target = collection;
  const ws = await getWorkspaceReport(env, id).catch(() => null);
  if (ws) target = "workspace_reports";
  else {
    const snap = await getSnapshotReport(env, id).catch(() => null);
    if (snap) target = "report_snapshots";
    else target = "reports";
  }

  return upsertDocument(env, target, id, { ...existing, ...partialData, id });
}

/**
 * Filter results to only include items owned by the given userId.
 * This is a defense-in-depth layer — even if Firestore query misses the filter,
 * no data from other users will be returned to the caller.
 */
function ownedBy(results: Record<string, unknown>[], userId: string): Record<string, unknown>[] {
  return results.filter((r) => {
    const uid = String(r.owner_uid || "");
    return uid === userId;
  });
}

/** List all cloud reports owned by user (live + snapshots + legacy). */
export async function getMyReports(env: Env, userId: string) {
  const [live, snaps, legacy] = await Promise.all([
    queryByOwner(env, "workspace_reports", userId, { orderBy: "updated_at" }).catch(() => []),
    queryByOwner(env, "report_snapshots", userId, { orderBy: "updated_at" }).catch(() => []),
    queryByOwner(env, "reports", userId, { orderBy: "updated_at" }).catch(() => []),
  ]);

  // Defense-in-depth: double-check owner_uid at application level
  const filtered = ownedBy([...legacy, ...snaps, ...live], userId);

  const byId = new Map<string, Record<string, unknown>>();
  for (const row of filtered) {
    const id = String(row.id || "");
    if (!id) continue;
    byId.set(id, row);
  }
  return Array.from(byId.values()).sort((a, b) => {
    const ta = Date.parse(String(a.updated_at || a.created_at || 0));
    const tb = Date.parse(String(b.updated_at || b.created_at || 0));
    return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
  });
}
