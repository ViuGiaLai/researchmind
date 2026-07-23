import { verifyToken } from "@clerk/backend";
import { Hono, type Context } from "hono";
import { cors } from "hono/cors";

type Bindings = {
  DB: D1Database;
  CLERK_SECRET_KEY?: string;
  CLERK_JWT_KEY?: string;
  ALLOWED_ORIGINS: string;
};

type AppEnv = {
  Bindings: Bindings;
  Variables: { userId: string };
};

const app = new Hono<AppEnv>();

const parseAllowedOrigins = (value: string): string[] =>
  value
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0 && origin !== "*");

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const optionalString = (value: unknown): string | null =>
  typeof value === "string" ? value : null;

const optionalInteger = (value: unknown): number | null =>
  typeof value === "number" && Number.isInteger(value) ? value : null;

const conflictResponse = (c: Context<AppEnv>) =>
  c.json({ error: "Resource ID is already owned by another account" }, 409);

app.use("*", async (c, next) => {
  const corsMiddleware = cors({
    origin: parseAllowedOrigins(c.env.ALLOWED_ORIGINS || ""),
    allowHeaders: ["Authorization", "Content-Type"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  });
  return corsMiddleware(c, next);
});

app.use("/api/*", async (c, next) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  if (!c.env.CLERK_SECRET_KEY && !c.env.CLERK_JWT_KEY) {
    console.error(JSON.stringify({ message: "Clerk verification is not configured" }));
    return c.json({ error: "Authentication service unavailable" }, 503);
  }

  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) return c.json({ error: "Unauthorized" }, 401);

  const allowedOrigins = parseAllowedOrigins(c.env.ALLOWED_ORIGINS || "");
  try {
    const verified = await verifyToken(token, {
      secretKey: c.env.CLERK_SECRET_KEY,
      jwtKey: c.env.CLERK_JWT_KEY,
      authorizedParties: allowedOrigins.length > 0 ? allowedOrigins : undefined,
    });
    if (!isNonEmptyString(verified.sub) || verified.sts === "pending") {
      return c.json({ error: "Unauthorized" }, 401);
    }

    c.set("userId", verified.sub);
    await c.env.DB.prepare(
      "INSERT INTO users (id) VALUES (?) ON CONFLICT(id) DO UPDATE SET updated_at=CURRENT_TIMESTAMP",
    )
      .bind(verified.sub)
      .run();
    await next();
  } catch (error) {
    console.warn(
      JSON.stringify({
        message: "Clerk token verification failed",
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    return c.json({ error: "Unauthorized" }, 401);
  }
});

app.get("/", (c) => c.text("ResearchMind Cloud Sync API is running!"));

// Old clients treated this placeholder as success even though it persisted
// nothing. Fail explicitly to prevent silent data loss.
app.all("/api/sync", (c) =>
  c.json(
    {
      error:
        "Legacy batch sync is disabled because it did not persist data. Update the desktop client.",
    },
    410,
  ),
);

app.get("/api/projects", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT * FROM projects WHERE user_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC",
  )
    .bind(c.get("userId"))
    .all();
  return c.json({ data: results });
});

app.post("/api/projects", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json<Record<string, unknown>>();
  if (!isNonEmptyString(body.id) || !isNonEmptyString(body.name)) {
    return c.json({ error: "id and name are required" }, 400);
  }

  const result = await c.env.DB.prepare(
    `INSERT INTO projects (id, user_id, name, description, status)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name=excluded.name,
       description=excluded.description,
       status=excluded.status,
       updated_at=CURRENT_TIMESTAMP
     WHERE projects.user_id=excluded.user_id`,
  )
    .bind(
      body.id.trim(),
      userId,
      body.name.trim(),
      optionalString(body.description),
      optionalString(body.status) || "draft",
    )
    .run();
  if (result.meta.changes === 0) return conflictResponse(c);
  return c.json({ status: "saved" });
});

app.get("/api/documents", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT * FROM documents WHERE user_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC",
  )
    .bind(c.get("userId"))
    .all();
  return c.json({ data: results });
});

app.post("/api/documents", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json<Record<string, unknown>>();
  if (
    !isNonEmptyString(body.id) ||
    !isNonEmptyString(body.project_id) ||
    !isNonEmptyString(body.title)
  ) {
    return c.json({ error: "id, project_id and title are required" }, 400);
  }

  const projectId = body.project_id.trim();
  const ownedProject = await c.env.DB.prepare(
    "SELECT 1 FROM projects WHERE id = ? AND user_id = ? AND deleted_at IS NULL",
  )
    .bind(projectId, userId)
    .first();
  if (!ownedProject) return c.json({ error: "Project not found" }, 404);

  const result = await c.env.DB.prepare(
    `INSERT INTO documents
       (id, project_id, user_id, title, authors, published_year, abstract, local_file_uri)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       project_id=excluded.project_id,
       title=excluded.title,
       authors=excluded.authors,
       published_year=excluded.published_year,
       abstract=excluded.abstract,
       local_file_uri=excluded.local_file_uri,
       updated_at=CURRENT_TIMESTAMP
     WHERE documents.user_id=excluded.user_id`,
  )
    .bind(
      body.id.trim(),
      projectId,
      userId,
      body.title.trim(),
      optionalString(body.authors),
      optionalInteger(body.published_year),
      optionalString(body.abstract),
      optionalString(body.local_file_uri),
    )
    .run();
  if (result.meta.changes === 0) return conflictResponse(c);
  return c.json({ status: "saved" });
});

app.get("/api/annotations", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT * FROM annotations WHERE user_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC",
  )
    .bind(c.get("userId"))
    .all();
  return c.json({ data: results });
});

app.post("/api/annotations", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json<Record<string, unknown>>();
  if (!isNonEmptyString(body.id) || !isNonEmptyString(body.document_id)) {
    return c.json({ error: "id and document_id are required" }, 400);
  }

  const documentId = body.document_id.trim();
  const ownedDocument = await c.env.DB.prepare(
    "SELECT 1 FROM documents WHERE id = ? AND user_id = ? AND deleted_at IS NULL",
  )
    .bind(documentId, userId)
    .first();
  if (!ownedDocument) return c.json({ error: "Document not found" }, 404);

  const result = await c.env.DB.prepare(
    `INSERT INTO annotations
       (id, document_id, user_id, page_number, bounding_box, color, note_content)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       document_id=excluded.document_id,
       page_number=excluded.page_number,
       bounding_box=excluded.bounding_box,
       color=excluded.color,
       note_content=excluded.note_content,
       updated_at=CURRENT_TIMESTAMP
     WHERE annotations.user_id=excluded.user_id`,
  )
    .bind(
      body.id.trim(),
      documentId,
      userId,
      optionalInteger(body.page_number),
      optionalString(body.bounding_box),
      optionalString(body.color),
      optionalString(body.note_content),
    )
    .run();
  if (result.meta.changes === 0) return conflictResponse(c);
  return c.json({ status: "saved" });
});

app.get("/api/notes", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT * FROM encrypted_notes WHERE user_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC",
  )
    .bind(c.get("userId"))
    .all();
  return c.json({ data: results });
});

app.post("/api/notes", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json<Record<string, unknown>>();
  if (
    !isNonEmptyString(body.id) ||
    !isNonEmptyString(body.encrypted_payload) ||
    !isNonEmptyString(body.nonce)
  ) {
    return c.json({ error: "id, encrypted_payload and nonce are required" }, 400);
  }

  let projectId: string | null = null;
  if (body.project_id !== undefined && body.project_id !== null) {
    if (!isNonEmptyString(body.project_id)) {
      return c.json({ error: "project_id must be a non-empty string" }, 400);
    }
    projectId = body.project_id.trim();
    const ownedProject = await c.env.DB.prepare(
      "SELECT 1 FROM projects WHERE id = ? AND user_id = ? AND deleted_at IS NULL",
    )
      .bind(projectId, userId)
      .first();
    if (!ownedProject) return c.json({ error: "Project not found" }, 404);
  }

  const result = await c.env.DB.prepare(
    `INSERT INTO encrypted_notes
       (id, user_id, project_id, encrypted_payload, nonce)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       project_id=excluded.project_id,
       encrypted_payload=excluded.encrypted_payload,
       nonce=excluded.nonce,
       updated_at=CURRENT_TIMESTAMP
     WHERE encrypted_notes.user_id=excluded.user_id`,
  )
    .bind(
      body.id.trim(),
      userId,
      projectId,
      body.encrypted_payload.trim(),
      body.nonce.trim(),
    )
    .run();
  if (result.meta.changes === 0) return conflictResponse(c);
  return c.json({ status: "saved" });
});

app.onError((error, c) => {
  console.error(
    JSON.stringify({
      message: "Cloud sync request failed",
      error: error instanceof Error ? error.message : String(error),
      path: c.req.path,
    }),
  );
  return c.json({ error: "Internal server error" }, 500);
});

export default app;
