import { Hono } from "hono";
import { cors } from "hono/cors";

type Bindings = {
  DB: D1Database;
  CLERK_SECRET_KEY: string;
  ALLOWED_ORIGINS: string;
};

const app = new Hono<{ Bindings: Bindings }>();

// 1. CORS Middleware
app.use("*", async (c, next) => {
  const allowed = (c.env.ALLOWED_ORIGINS || "*").split(",");
  const corsMiddleware = cors({
    origin: allowed,
    allowHeaders: ["Authorization", "Content-Type"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  });
  return corsMiddleware(c, next);
});

// 2. Auth Middleware (Mock/Placeholder cho Clerk)
// Trong thực tế sẽ dùng thư viện verify JWT của Clerk hoặc jose
app.use("/api/*", async (c, next) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  
  const token = authHeader.split(" ")[1];
  // FIXME: Thêm logic verify JWT token từ Clerk ở đây
  // Hiện tại giả định token chính là user_id (cho mục đích demo/MVP)
  c.set("userId", token);
  
  await next();
});

// 3. API Routes theo Resource (RESTful)
app.get("/", (c) => {
  return c.text("ResearchMind Cloud Sync API is running!");
});

// ==========================================
// SYNC ENGINE API
// ==========================================
app.post("/api/sync", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json();
  // TODO: Logic xử lý Batch Sync (LWW Conflict Resolution)
  return c.json({ status: "success", synced_items: 0 });
});

app.get("/api/sync", async (c) => {
  const userId = c.get("userId");
  const lastSynced = c.req.query("last_synced_at");
  // TODO: Pull các thay đổi mới hơn last_synced_at
  return c.json({ changes: [] });
});

// ==========================================
// WORKFLOW ENGINE: Projects
// ==========================================
app.get("/api/projects", async (c) => {
  const userId = c.get("userId");
  const { results } = await c.env.DB.prepare("SELECT * FROM projects WHERE user_id = ? AND deleted_at IS NULL").bind(userId).all();
  return c.json({ data: results });
});

app.post("/api/projects", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json();
  // Validate & Insert
  await c.env.DB.prepare("INSERT INTO projects (id, user_id, name, description) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, description=excluded.description, updated_at=CURRENT_TIMESTAMP")
    .bind(body.id, userId, body.name, body.description)
    .run();
  return c.json({ status: "saved" });
});

// ==========================================
// DOCUMENTS ENGINE: Paper Metadata
// ==========================================
app.get("/api/documents", async (c) => {
  const userId = c.get("userId");
  const { results } = await c.env.DB.prepare(
    "SELECT * FROM documents WHERE user_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC"
  ).bind(userId).all();
  return c.json({ data: results });
});

app.post("/api/documents", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json();
  await c.env.DB.prepare(
    `INSERT INTO documents (id, project_id, user_id, title, authors, published_year, abstract, local_file_uri)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       title=excluded.title, authors=excluded.authors,
       published_year=excluded.published_year, abstract=excluded.abstract,
       local_file_uri=excluded.local_file_uri, updated_at=CURRENT_TIMESTAMP`
  )
    .bind(body.id, body.project_id || null, userId, body.title, body.authors || null,
      body.published_year || null, body.abstract || null, body.local_file_uri || null)
    .run();
  return c.json({ status: "saved" });
});

// ==========================================
// MEMORY ENGINE: Encrypted Notes (E2EE)
// ==========================================
app.get("/api/notes", async (c) => {
  const userId = c.get("userId");
  const { results } = await c.env.DB.prepare("SELECT * FROM encrypted_notes WHERE user_id = ? AND deleted_at IS NULL").bind(userId).all();
  return c.json({ data: results });
});

app.post("/api/notes", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json();
  // NOTE: encrypted_payload & nonce là bắt buộc
  await c.env.DB.prepare("INSERT INTO encrypted_notes (id, user_id, project_id, encrypted_payload, nonce) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET encrypted_payload=excluded.encrypted_payload, nonce=excluded.nonce, updated_at=CURRENT_TIMESTAMP")
    .bind(body.id, userId, body.project_id || null, body.encrypted_payload, body.nonce)
    .run();
  return c.json({ status: "saved" });
});

export default app;
