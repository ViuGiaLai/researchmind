-- =====================================================================
-- ResearchMind - Giai Đoạn 2: Cloud Sync (D1 Database Schema)
-- Storage Layer: Offline-first & E2EE Support
-- =====================================================================

-- 1. Quản lý định danh (Pluggable Auth, mặc định: Clerk)
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, -- Ví dụ: user_2Pq... (clerk_user_id)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. Dữ liệu Cấu hình (Tùy chọn cho người dùng)
CREATE TABLE IF NOT EXISTS user_preferences (
    user_id TEXT PRIMARY KEY,
    preferences_json TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 3. Workflow Engine: Quản lý Dự án
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'draft',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    deleted_at DATETIME, -- Soft delete cho đồng bộ
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_updated ON projects(updated_at);

-- 4. Documents: Chỉ lưu Metadata, File PDF nằm ở Local/R2
CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    authors TEXT,
    published_year INTEGER,
    abstract TEXT,
    local_file_uri TEXT, -- Đường dẫn tham chiếu ở Local IndexedDB
    r2_object_key TEXT, -- Tương lai: Đường dẫn nếu sync PDF lên R2
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    deleted_at DATETIME,
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_docs_project ON documents(project_id);
CREATE INDEX IF NOT EXISTS idx_docs_updated ON documents(updated_at);

-- 5. Annotations: Highlight và ghi chú dính liền với PDF
CREATE TABLE IF NOT EXISTS annotations (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    page_number INTEGER,
    bounding_box TEXT, -- JSON tọa độ
    color TEXT,
    note_content TEXT, -- Có thể E2EE tùy ý người dùng
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    deleted_at DATETIME,
    FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_anno_document ON annotations(document_id);
CREATE INDEX IF NOT EXISTS idx_anno_updated ON annotations(updated_at);

-- 6. Memory Engine: Ghi chú độc lập / Tổng hợp (E2EE)
CREATE TABLE IF NOT EXISTS encrypted_notes (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    project_id TEXT, -- Có thể null nếu là ghi chú tự do
    encrypted_payload TEXT NOT NULL, -- Toàn bộ tiêu đề & nội dung được mã hóa (AES-GCM)
    nonce TEXT NOT NULL, -- Dùng cho AES-GCM
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    deleted_at DATETIME,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_notes_user ON encrypted_notes(user_id);
CREATE INDEX IF NOT EXISTS idx_notes_updated ON encrypted_notes(updated_at);

-- 7. Sync Metadata: Dùng cho Incremental Sync
CREATE TABLE IF NOT EXISTS sync_metadata (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    device_id TEXT NOT NULL,
    resource_type TEXT NOT NULL, -- 'projects', 'documents', 'encrypted_notes'...
    last_synced_at DATETIME NOT NULL,
    sync_state TEXT NOT NULL, -- 'success', 'conflict', 'pending'
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_sync_user ON sync_metadata(user_id);

-- 8. Version Engine (Phục vụ Lịch sử & Rollback)
CREATE TABLE IF NOT EXISTS version_history (
    id TEXT PRIMARY KEY,
    resource_id TEXT NOT NULL, -- ID của document hoặc note
    resource_type TEXT NOT NULL,
    version INTEGER NOT NULL,
    snapshot_payload TEXT NOT NULL, -- Lưu trữ dữ liệu lúc đó (có thể đã mã hóa)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by_device TEXT
);
CREATE INDEX IF NOT EXISTS idx_version_resource ON version_history(resource_id);
