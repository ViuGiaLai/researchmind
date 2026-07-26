(() => {
  // node_modules/@tsndr/cloudflare-worker-jwt/index.js
  function bytesToByteString(bytes) {
    let byteStr = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      byteStr += String.fromCharCode(bytes[i]);
    }
    return byteStr;
  }
  function byteStringToBytes(byteStr) {
    let bytes = new Uint8Array(byteStr.length);
    for (let i = 0; i < byteStr.length; i++) {
      bytes[i] = byteStr.charCodeAt(i);
    }
    return bytes;
  }
  function arrayBufferToBase64String(arrayBuffer) {
    return btoa(bytesToByteString(new Uint8Array(arrayBuffer)));
  }
  function base64StringToUint8Array(b64str) {
    return byteStringToBytes(atob(b64str));
  }
  function textToUint8Array(str) {
    return byteStringToBytes(str);
  }
  function arrayBufferToBase64Url(arrayBuffer) {
    return arrayBufferToBase64String(arrayBuffer).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  }
  function base64UrlToUint8Array(b64url) {
    return base64StringToUint8Array(b64url.replace(/-/g, "+").replace(/_/g, "/").replace(/\s/g, ""));
  }
  function textToBase64Url(str) {
    const encoder = new TextEncoder();
    const charCodes = encoder.encode(str);
    const binaryStr = String.fromCharCode(...charCodes);
    return btoa(binaryStr).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  }
  function pemToBinary(pem) {
    return base64StringToUint8Array(pem.replace(/-+(BEGIN|END).*/g, "").replace(/\s/g, ""));
  }
  async function importTextSecret(key, algorithm, keyUsages) {
    return await crypto.subtle.importKey("raw", textToUint8Array(key), algorithm, true, keyUsages);
  }
  async function importJwk(key, algorithm, keyUsages) {
    return await crypto.subtle.importKey("jwk", key, algorithm, true, keyUsages);
  }
  async function importPublicKey(key, algorithm, keyUsages) {
    return await crypto.subtle.importKey("spki", pemToBinary(key), algorithm, true, keyUsages);
  }
  async function importPrivateKey(key, algorithm, keyUsages) {
    return await crypto.subtle.importKey("pkcs8", pemToBinary(key), algorithm, true, keyUsages);
  }
  async function importKey(key, algorithm, keyUsages) {
    if (typeof key === "object")
      return importJwk(key, algorithm, keyUsages);
    if (typeof key !== "string")
      throw new Error("Unsupported key type!");
    if (key.includes("PUBLIC"))
      return importPublicKey(key, algorithm, keyUsages);
    if (key.includes("PRIVATE"))
      return importPrivateKey(key, algorithm, keyUsages);
    return importTextSecret(key, algorithm, keyUsages);
  }
  function decodePayload(raw) {
    const bytes = Array.from(atob(raw), (char) => char.charCodeAt(0));
    const decodedString = new TextDecoder("utf-8").decode(new Uint8Array(bytes));
    return JSON.parse(decodedString);
  }
  if (typeof crypto === "undefined" || !crypto.subtle)
    throw new Error("SubtleCrypto not supported!");
  var algorithms = {
    none: { name: "none" },
    ES256: { name: "ECDSA", namedCurve: "P-256", hash: { name: "SHA-256" } },
    ES384: { name: "ECDSA", namedCurve: "P-384", hash: { name: "SHA-384" } },
    ES512: { name: "ECDSA", namedCurve: "P-521", hash: { name: "SHA-512" } },
    HS256: { name: "HMAC", hash: { name: "SHA-256" } },
    HS384: { name: "HMAC", hash: { name: "SHA-384" } },
    HS512: { name: "HMAC", hash: { name: "SHA-512" } },
    RS256: { name: "RSASSA-PKCS1-v1_5", hash: { name: "SHA-256" } },
    RS384: { name: "RSASSA-PKCS1-v1_5", hash: { name: "SHA-384" } },
    RS512: { name: "RSASSA-PKCS1-v1_5", hash: { name: "SHA-512" } }
  };
  async function sign(payload, secret, options = "HS256") {
    if (typeof options === "string")
      options = { algorithm: options };
    options = { algorithm: "HS256", header: { typ: "JWT", ...options.header ?? {} }, ...options };
    if (!payload || typeof payload !== "object")
      throw new Error("payload must be an object");
    if (options.algorithm !== "none" && (!secret || typeof secret !== "string" && typeof secret !== "object"))
      throw new Error("secret must be a string, a JWK object or a CryptoKey object");
    if (typeof options.algorithm !== "string")
      throw new Error("options.algorithm must be a string");
    const algorithm = algorithms[options.algorithm];
    if (!algorithm)
      throw new Error("algorithm not found");
    if (!payload.iat)
      payload.iat = Math.floor(Date.now() / 1e3);
    const partialToken = `${textToBase64Url(JSON.stringify({ ...options.header, alg: options.algorithm }))}.${textToBase64Url(JSON.stringify(payload))}`;
    if (options.algorithm === "none")
      return partialToken;
    const key = secret instanceof CryptoKey ? secret : await importKey(secret, algorithm, ["sign"]);
    const signature = await crypto.subtle.sign(algorithm, key, textToUint8Array(partialToken));
    return `${partialToken}.${arrayBufferToBase64Url(signature)}`;
  }
  async function verify(token, secret, options = "HS256") {
    if (typeof options === "string")
      options = { algorithm: options };
    options = { algorithm: "HS256", clockTolerance: 0, throwError: false, ...options };
    if (typeof token !== "string")
      throw new Error("token must be a string");
    if (options.algorithm !== "none" && typeof secret !== "string" && typeof secret !== "object")
      throw new Error("secret must be a string, a JWK object or a CryptoKey object");
    if (typeof options.algorithm !== "string")
      throw new Error("options.algorithm must be a string");
    const tokenParts = token.split(".", 3);
    if (tokenParts.length < 2)
      throw new Error("token must consist of 2 or more parts");
    const [tokenHeader, tokenPayload, tokenSignature] = tokenParts;
    const algorithm = algorithms[options.algorithm];
    if (!algorithm)
      throw new Error("algorithm not found");
    const decodedToken = decode(token);
    try {
      if (decodedToken.header?.alg !== options.algorithm)
        throw new Error("INVALID_SIGNATURE");
      if (decodedToken.payload) {
        const now = Math.floor(Date.now() / 1e3);
        if (decodedToken.payload.nbf && decodedToken.payload.nbf > now && decodedToken.payload.nbf - now > (options.clockTolerance ?? 0))
          throw new Error("NOT_YET_VALID");
        if (decodedToken.payload.exp && decodedToken.payload.exp <= now && now - decodedToken.payload.exp > (options.clockTolerance ?? 0))
          throw new Error("EXPIRED");
      }
      if (algorithm.name === "none")
        return decodedToken;
      const key = secret instanceof CryptoKey ? secret : await importKey(secret, algorithm, ["verify"]);
      if (!await crypto.subtle.verify(algorithm, key, base64UrlToUint8Array(tokenSignature), textToUint8Array(`${tokenHeader}.${tokenPayload}`)))
        throw new Error("INVALID_SIGNATURE");
      return decodedToken;
    } catch (err) {
      if (options.throwError)
        throw err;
      return;
    }
  }
  function decode(token) {
    return {
      header: decodePayload(token.split(".")[0].replace(/-/g, "+").replace(/_/g, "/")),
      payload: decodePayload(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))
    };
  }
  var index_default = {
    sign,
    verify,
    decode
  };

  // functions/lib/firestore.ts
  var cachedAccessToken = null;
  var tokenExpiration = 0;
  async function getAccessToken(env) {
    if (cachedAccessToken && Date.now() < tokenExpiration) {
      return cachedAccessToken;
    }
    const iat = Math.floor(Date.now() / 1e3);
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
      exp
    };
    const token = await index_default.sign(payload, privateKey, { algorithm: "RS256" });
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: token
      })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(`Failed to get Firestore access token: ${JSON.stringify(data)}`);
    }
    cachedAccessToken = data.access_token || null;
    tokenExpiration = Date.now() + ((data.expires_in || 3600) - 60) * 1e3;
    return cachedAccessToken;
  }
  function projectIdOf(env) {
    return (env.FIREBASE_PROJECT_ID || "").trim().replace(/^"|"$/g, "");
  }
  function docUrl(env, collection, id) {
    return `https://firestore.googleapis.com/v1/projects/${projectIdOf(env)}/databases/(default)/documents/${collection}/${encodeURIComponent(id)}`;
  }
  function jsonToFirestore(obj) {
    if (obj === null || obj === void 0) return { nullValue: null };
    if (typeof obj === "boolean") return { booleanValue: obj };
    if (typeof obj === "string") return { stringValue: obj };
    if (typeof obj === "number") {
      return Number.isInteger(obj) ? { integerValue: String(obj) } : { doubleValue: obj };
    }
    if (Array.isArray(obj)) {
      return { arrayValue: { values: obj.map(jsonToFirestore) } };
    }
    if (typeof obj === "object") {
      const fields = {};
      for (const [key, value] of Object.entries(obj)) {
        if (value !== void 0) fields[key] = jsonToFirestore(value);
      }
      return { mapValue: { fields } };
    }
    return { nullValue: null };
  }
  function firestoreToJson(obj) {
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
      const res = {};
      const fields = obj.mapValue.fields || {};
      for (const key in fields) {
        res[key] = firestoreToJson(fields[key]);
      }
      return res;
    }
    return obj;
  }
  async function upsertDocument(env, collection, id, data) {
    const token = await getAccessToken(env);
    const doc = { fields: jsonToFirestore(data).mapValue.fields };
    const res = await fetch(docUrl(env, collection, id), {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(doc)
    });
    if (!res.ok) {
      throw new Error(`Firestore upsert ${collection}/${id}: ${await res.text()}`);
    }
    return { id, ...data };
  }
  async function getDocument(env, collection, id) {
    const token = await getAccessToken(env);
    const res = await fetch(docUrl(env, collection, id), {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Firestore get ${collection}/${id}: ${await res.text()}`);
    const data = await res.json();
    return { id, ...firestoreToJson({ mapValue: { fields: data.fields } }) };
  }

  // functions/lib/response.ts
  function jsonResponse(data, status = 200, headers = {}) {
    return new Response(JSON.stringify(data), {
      status,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        ...headers
      }
    });
  }
  function errorResponse(message, status = 400) {
    return jsonResponse({ error: message }, status);
  }

  // functions/lib/http.ts
  function requireUser(context) {
    if (!context.data?.userId) {
      return errorResponse("Unauthorized: Missing or invalid token", 401);
    }
    return context.data.userId;
  }
  async function readJson(request) {
    try {
      return await request.json();
    } catch {
      return errorResponse("Invalid JSON payload", 400);
    }
  }
  function nowIso() {
    return (/* @__PURE__ */ new Date()).toISOString();
  }

  // functions/api/v1/me.ts
  var onRequestGet = async (context) => {
    const userId = requireUser(context);
    if (userId instanceof Response) return userId;
    try {
      const row = await getDocument(context.env, "users", userId);
      if (!row) {
        return jsonResponse({
          id: userId,
          email: "",
          name: "Researcher",
          plan: "free",
          emailVerified: true,
          createdAt: nowIso(),
          updatedAt: nowIso()
        });
      }
      return jsonResponse({
        id: row.id || userId,
        email: row.email || "",
        name: row.name || row.display_name || "Researcher",
        avatarUrl: row.avatar_url || void 0,
        plan: row.plan || "free",
        emailVerified: row.email_verified !== false,
        createdAt: row.created_at || nowIso(),
        updatedAt: row.updated_at || nowIso()
      });
    } catch (err) {
      return errorResponse(err.message, 500);
    }
  };
  var onRequestPut = async (context) => {
    const userId = requireUser(context);
    if (userId instanceof Response) return userId;
    const body = await readJson(context.request);
    if (body instanceof Response) return body;
    try {
      const existing = await getDocument(context.env, "users", userId) || {
        id: userId,
        created_at: nowIso(),
        plan: "free"
      };
      const next = {
        ...existing,
        id: userId,
        email: body.email !== void 0 ? body.email : existing.email,
        name: body.name !== void 0 ? body.name : existing.name,
        display_name: body.name !== void 0 ? body.name : existing.display_name,
        avatar_url: body.avatarUrl !== void 0 ? body.avatarUrl : existing.avatar_url,
        plan: existing.plan || "free",
        email_verified: true,
        updated_at: nowIso(),
        created_at: existing.created_at || nowIso()
      };
      await upsertDocument(context.env, "users", userId, next);
      return jsonResponse({
        id: userId,
        email: next.email || "",
        name: next.name || "Researcher",
        avatarUrl: next.avatar_url || void 0,
        plan: next.plan || "free",
        emailVerified: true,
        createdAt: next.created_at,
        updatedAt: next.updated_at
      });
    } catch (err) {
      return errorResponse(err.message, 500);
    }
  };
})();
