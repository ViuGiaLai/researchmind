import jwt from "@tsndr/cloudflare-worker-jwt";

interface Env {
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
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: token,
    }),
  });

  const data = await response.json() as any;
  if (!response.ok) {
    throw new Error(`Failed to get Firestore access token: ${JSON.stringify(data)}`);
  }

  cachedAccessToken = data.access_token;
  tokenExpiration = Date.now() + (data.expires_in - 60) * 1000;
  return cachedAccessToken as string;
}

function jsonToFirestore(obj: any): any {
  if (obj === null) return { nullValue: null };
  if (typeof obj === "boolean") return { booleanValue: obj };
  if (typeof obj === "string") return { stringValue: obj };
  if (typeof obj === "number") {
    return Number.isInteger(obj) ? { integerValue: obj } : { doubleValue: obj };
  }
  if (Array.isArray(obj)) {
    return { arrayValue: { values: obj.map(jsonToFirestore) } };
  }
  if (typeof obj === "object") {
    const fields: any = {};
    for (const key in obj) {
      if (obj[key] !== undefined) {
        fields[key] = jsonToFirestore(obj[key]);
      }
    }
    return { mapValue: { fields } };
  }
  return { nullValue: null };
}

function firestoreToJson(obj: any): any {
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
    const res: any = {};
    const fields = obj.mapValue.fields || {};
    for (const key in fields) {
      res[key] = firestoreToJson(fields[key]);
    }
    return res;
  }
  return obj;
}

export async function saveWorkspaceReport(env: Env, workspaceId: string, data: any) {
  const token = await getAccessToken(env);
  const projectId = (env.FIREBASE_PROJECT_ID || "").trim().replace(/^"|"$/g, "");
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/workspace_reports/${workspaceId}`;
  
  const doc = { fields: jsonToFirestore(data).mapValue.fields };
  
  const res = await fetch(url, {
    method: "PATCH",
    headers: { 
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(doc)
  });
  
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Firestore save workspace report error: ${err}`);
  }
  return true;
}

export async function getWorkspaceReport(env: Env, workspaceId: string) {
  const token = await getAccessToken(env);
  const projectId = (env.FIREBASE_PROJECT_ID || "").trim().replace(/^"|"$/g, "");
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/workspace_reports/${workspaceId}`;
  
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });
  
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Firestore get workspace report error: ${await res.text()}`);
  
  const data = await res.json() as any;
  return firestoreToJson({ mapValue: { fields: data.fields } });
}

export async function createSnapshotReport(env: Env, id: string, data: any) {
  const token = await getAccessToken(env);
  const projectId = (env.FIREBASE_PROJECT_ID || "").trim().replace(/^"|"$/g, "");
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/report_snapshots/${id}`;
  
  const doc = { fields: jsonToFirestore(data).mapValue.fields };
  
  const res = await fetch(url, {
    method: "PATCH",
    headers: { 
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(doc)
  });
  
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Firestore save snapshot error: ${err}`);
  }
  return true;
}

export async function getSnapshotReport(env: Env, id: string) {
  const token = await getAccessToken(env);
  const projectId = (env.FIREBASE_PROJECT_ID || "").trim().replace(/^"|"$/g, "");
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/report_snapshots/${id}`;
  
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });
  
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Firestore get snapshot error: ${await res.text()}`);
  
  const data = await res.json() as any;
  return firestoreToJson({ mapValue: { fields: data.fields } });
}

// Universal getReport with collection fallback strategy
export async function getReport(env: Env, id: string) {
  // 1. Try workspace_reports
  const wsDoc = await getWorkspaceReport(env, id).catch(() => null);
  if (wsDoc) return wsDoc;

  // 2. Try report_snapshots
  const snapDoc = await getSnapshotReport(env, id).catch(() => null);
  if (snapDoc) return snapDoc;

  // 3. Fallback to legacy reports collection
  const token = await getAccessToken(env);
  const projectId = (env.FIREBASE_PROJECT_ID || "").trim().replace(/^"|"$/g, "");
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/reports/${id}`;
  
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });
  
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Firestore get error: ${await res.text()}`);
  
  const data = await res.json() as any;
  return firestoreToJson({ mapValue: { fields: data.fields } });
}

export async function createReport(env: Env, id: string, data: any) {
  return createSnapshotReport(env, id, data);
}

export async function updateReport(env: Env, id: string, partialData: any) {
  const token = await getAccessToken(env);
  
  const fields = jsonToFirestore(partialData).mapValue.fields;
  const updateMask = Object.keys(fields).map(k => `updateMask.fieldPaths=${k}`).join('&');
  
  const url = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/reports/${id}?${updateMask}`;
  
  const doc = { name: `projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/reports/${id}`, fields };
  
  const res = await fetch(url, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(doc)
  });
  
  if (!res.ok) throw new Error(`Firestore update error: ${await res.text()}`);
  return true;
}

export async function getMyReports(env: Env, userId: string) {
  const token = await getAccessToken(env);
  const url = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents:runQuery`;
  
  const query = {
    structuredQuery: {
      from: [{ collectionId: "reports" }],
      where: {
        compositeFilter: {
          op: "AND",
          filters: [
            {
              fieldFilter: {
                field: { fieldPath: "owner_uid" },
                op: "EQUAL",
                value: { stringValue: userId }
              }
            }
          ]
        }
      },
      orderBy: [{ field: { fieldPath: "updated_at" }, direction: "DESCENDING" }]
    }
  };
  
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(query)
  });
  
  if (!res.ok) throw new Error(`Firestore query error: ${await res.text()}`);
  const results = await res.json() as any[];
  
  return results
    .filter(r => r.document)
    .map(r => {
      const id = r.document.name.split("/").pop();
      const data = firestoreToJson({ mapValue: { fields: r.document.fields } });
      return { id, ...data };
    })
    .filter(r => !r.deleted_at);
}
