# MemoryOS — Phase 1 MVP Specification

> **Mục tiêu:** "Tìm file PDF về Docker mà tôi đọc khoảng tháng trước" — trong dưới 1 giây.
> **Nền tảng:** Windows Desktop (Tauri + Rust + React)
> **Desktop là Core Product.** Mobile chỉ là thiết bị nhập liệu sau này.

---

## 1. Tổng Quan MVP

```
MemoryOS Desktop v0.1
├── 🔍 Search (Natural Language)
│   ├── Full-text Search (BM25)
│   ├── Semantic Search (Vector)
│   └── Re-ranker (BM25 + Vector)
├── 📄 PDF Reader (Preview inline)
├── 👁️ OCR (PaddleOCR — JPG, PNG, scan, receipt)
├── 💬 AI Chat (Local LLM qua Ollama)
│   ├── Hỏi về dữ liệu
│   └── Tóm tắt nội dung
├── 📅 Timeline
│   ├── Tự động nhóm theo thời gian
│   └── "Tháng 5/2025 — 23 file"
├── 🕸️ Memory Graph
│   ├── Node: file, topic, person, project
│   └── Edge: related, contains, mentions
├── 🗄️ Local Database (SQLite + FTS5)
├── 🔒 Encryption (AES-256-GCM)
└── ⚙️ Settings
    ├── Chọn thư mục
    ├── Model config
    └── Privacy controls
```

---

## 2. Project Structure (Cargo Workspace)

```
memoryos/
├── apps/
│   └── desktop/                          # Tauri desktop app
│       ├── package.json
│       ├── tsconfig.json
│       ├── vite.config.ts
│       ├── index.html
│       ├── src/                          # React frontend
│       │   ├── main.tsx
│       │   ├── App.tsx
│       │   ├── components/
│       │   │   ├── layout/
│       │   │   │   ├── Sidebar.tsx
│       │   │   │   ├── Header.tsx
│       │   │   │   └── MainContent.tsx
│       │   │   ├── folder/
│       │   │   │   ├── FolderPicker.tsx
│       │   │   │   ├── FolderList.tsx
│       │   │   │   └── FolderCard.tsx
│       │   │   ├── scan/
│       │   │   │   ├── ScanButton.tsx
│       │   │   │   ├── ScanProgress.tsx
│       │   │   │   └── ScanLog.tsx
│       │   │   ├── search/
│       │   │   │   ├── SearchBar.tsx
│       │   │   │   ├── SearchResults.tsx
│       │   │   │   ├── SearchResultCard.tsx
│       │   │   │   └── SearchFilters.tsx
│       │   │   ├── preview/
│       │   │   │   ├── FilePreview.tsx
│       │   │   │   ├── PdfPreview.tsx
│       │   │   │   └── TextPreview.tsx
│       │   │   ├── chat/
│       │   │   │   ├── ChatPanel.tsx
│       │   │   │   ├── ChatMessage.tsx
│       │   │   │   └── ChatInput.tsx
│       │   │   ├── timeline/
│       │   │   │   ├── TimelineView.tsx
│       │   │   │   ├── TimelineGroup.tsx
│       │   │   │   └── TimelineItem.tsx
│       │   │   ├── graph/
│       │   │   │   ├── GraphView.tsx
│       │   │   │   ├── GraphNode.tsx
│       │   │   │   └── GraphEdge.tsx
│       │   │   ├── stats/
│       │   │   │   ├── StatsOverview.tsx
│       │   │   │   ├── FileTypeChart.tsx
│       │   │   │   └── RecentActivity.tsx
│       │   │   └── common/
│       │   │       ├── Button.tsx
│       │   │       ├── Modal.tsx
│       │   │       ├── Spinner.tsx
│       │   │       ├── EmptyState.tsx
│       │   │       └── ErrorBoundary.tsx
│       │   ├── hooks/
│       │   │   ├── useSearch.ts
│       │   │   ├── useScan.ts
│       │   │   ├── useFolders.ts
│       │   │   ├── useChat.ts
│       │   │   ├── useTimeline.ts
│       │   │   ├── useGraph.ts
│       │   │   ├── useStats.ts
│       │   │   └── useDebounce.ts
│       │   ├── types/
│       │   │   ├── file.ts
│       │   │   ├── search.ts
│       │   │   ├── chat.ts
│       │   │   ├── graph.ts
│       │   │   └── stats.ts
│       │   ├── utils/
│       │   │   ├── format.ts
│       │   │   ├── icons.tsx
│       │   │   └── constants.ts
│       │   └── styles/
│       │       ├── globals.css
│       │       ├── variables.css
│       │       └── components.css
│       ├── src-tauri/                   # Tauri Rust backend
│       │   ├── Cargo.toml
│       │   ├── tauri.conf.json
│       │   ├── build.rs
│       │   ├── icons/
│       │   └── src/
│       │       ├── main.rs
│       │       ├── lib.rs
│       │       ├── commands/
│       │       │   ├── mod.rs
│       │       │   ├── folder.rs
│       │       │   ├── scan.rs
│       │       │   ├── search.rs
│       │       │   ├── index.rs
│       │       │   ├── chat.rs
│       │       │   ├── timeline.rs
│       │       │   ├── graph.rs
│       │       │   └── stats.rs
│       │       └── ocr/
│       │           └── mod.rs           # Gọi Python PaddleOCR
│       └── ...
├── crates/                              # Rust workspace crates
│   ├── memory-core/                     # Core engine
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs
│   │       ├── scanner.rs               # Walk directories, hash files
│   │       └── extractor.rs             # PDF, DOCX, TXT, MD extraction
│   ├── memory-indexer/                  # File scanning + indexing
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs
│   │       ├── db.rs                    # SQLite schema + CRUD
│   │       └── pipeline.rs              # Indexing pipeline
│   ├── memory-search/                   # BM25 + Vector search
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs
│   │       ├── bm25.rs
│   │       ├── vector.rs
│   │       └── reranker.rs
│   ├── memory-security/                 # Encryption
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs
│   │       └── encrypt.rs               # AES-256-GCM + Argon2id
│   ├── memory-ai/                       # AI + NLP
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs
│   │       ├── ollama.rs                # Ollama API client
│   │       ├── nlp.rs                   # Natural language parser
│   │       ├── embedder.rs              # Embedding generation
│   │       └── chat.rs                  # Chat context
│   └── memory-graph/                    # Knowledge Graph
│       ├── Cargo.toml
│       └── src/
│           ├── lib.rs
│           ├── graph.rs                 # Node + Edge management
│           ├── timeline.rs              # Timeline engine
│           └── relation.rs              # Relation extraction
├── docs/
├── tests/
│   ├── integration/
│   └── fixtures/
├── Cargo.toml                           # Workspace root
└── README.md
```

---

## 3. Database Schema (SQLite)

### 3.1 files — File Metadata

```sql
CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY,
    path TEXT NOT NULL UNIQUE,
    filename TEXT NOT NULL,
    extension TEXT NOT NULL,
    hash TEXT NOT NULL,
    size INTEGER NOT NULL,
    created_at TEXT,
    modified_at TEXT,
    indexed_at TEXT DEFAULT (datetime('now')),
    status TEXT DEFAULT 'pending'  -- pending, indexing, indexed, failed, skipped
);
```

### 3.2 file_contents — Full Text Content

```sql
CREATE TABLE IF NOT EXISTS file_contents (
    file_id TEXT PRIMARY KEY REFERENCES files(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    extracted_at TEXT DEFAULT (datetime('now'))
);
```

### 3.3 files_fts — Full-Text Search Index (FTS5)

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS files_fts USING fts5(
    filename,
    content,
    tokenize='unicode61'
);
```

### 3.4 embeddings — Vector Embeddings

```sql
CREATE TABLE IF NOT EXISTS embeddings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    chunk_text TEXT NOT NULL,
    embedding BLOB,
    model TEXT DEFAULT 'bge-small-en-v1.5',
    UNIQUE(file_id, chunk_index)
);
```

### 3.5 graph_nodes — Knowledge Graph Nodes

```sql
CREATE TABLE IF NOT EXISTS graph_nodes (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,        -- file, topic, person, project
    name TEXT NOT NULL,
    description TEXT,
    file_id TEXT REFERENCES files(id),
    created_at TEXT DEFAULT (datetime('now'))
);
```

### 3.6 graph_edges — Knowledge Graph Connections

```sql
CREATE TABLE IF NOT EXISTS graph_edges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id TEXT NOT NULL REFERENCES graph_nodes(id),
    target_id TEXT NOT NULL REFERENCES graph_nodes(id),
    relation TEXT NOT NULL,     -- related, contains, mentions, similar
    weight REAL DEFAULT 1.0,
    created_at TEXT DEFAULT (datetime('now'))
);
```

### 3.7 timeline — Timeline Events

```sql
CREATE TABLE IF NOT EXISTS timeline (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    file_id TEXT REFERENCES files(id),
    event_type TEXT,            -- file_created, file_modified, project, learning
    created_at TEXT DEFAULT (datetime('now'))
);
```

### 3.8 chat_history — AI Chat History

```sql
CREATE TABLE IF NOT EXISTS chat_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    role TEXT NOT NULL,          -- user, assistant
    content TEXT NOT NULL,
    context_files TEXT,          -- JSON array of file_ids used
    created_at TEXT DEFAULT (datetime('now'))
);
```

### 3.9 config — Application Configuration

```sql
CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

INSERT OR IGNORE INTO config (key, value) VALUES
    ('scanned_folders', '[]'),
    ('max_file_size_mb', '100'),
    ('ollama_model', 'qwen2.5:7b'),
    ('embedding_model', 'bge-small-en-v1.5'),
    ('encryption_enabled', 'false'),
    ('theme', 'light');
```

### 3.10 scan_log — Scan History

```sql
CREATE TABLE IF NOT EXISTS scan_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    folder TEXT NOT NULL,
    files_found INTEGER,
    files_indexed INTEGER,
    files_skipped INTEGER,
    duration_ms INTEGER,
    scanned_at TEXT DEFAULT (datetime('now'))
);
```

---

## 4. Tauri Commands (IPC API)

### 4.1 Folder Management

```rust
#[tauri::command]
fn select_folder(app: tauri::AppHandle) -> Result<Vec<String>, String>

#[tauri::command]
fn get_selected_folders() -> Result<Vec<String>, String>

#[tauri::command]
fn remove_folder(folder: String) -> Result<(), String>
```

### 4.2 Scanning

```rust
#[tauri::command]
fn start_scan(app: tauri::AppHandle) -> Result<(), String>

#[tauri::command]
fn stop_scan() -> Result<(), String>

#[tauri::command]
fn get_scan_progress() -> Result<ScanProgress, String>
```

### 4.3 Search

```rust
#[tauri::command]
fn search(query: SearchQuery) -> Result<Vec<SearchResult>, String>

#[tauri::command]
fn get_preview(file_id: String) -> Result<String, String>

#[tauri::command]
fn get_suggestions(query: String) -> Result<Vec<String>, String>
```

### 4.4 AI Chat

```rust
#[tauri::command]
fn chat(message: String) -> Result<ChatResponse, String>
// Gửi message → Ollama LLM → Trả về câu trả lời
// Tự động include context từ search results

#[tauri::command]
fn get_chat_history() -> Result<Vec<ChatMessage>, String>

#[tauri::command]
fn clear_chat_history() -> Result<(), String>
```

### 4.5 Timeline

```rust
#[tauri::command]
fn get_timeline(filter: TimelineFilter) -> Result<Vec<TimelineEvent>, String>
// filter: { period: "day"|"week"|"month"|"year", from: String, to: String }

#[tauri::command]
fn get_timeline_summary() -> Result<Vec<TimelineSummary>, String>
// Trả về: [{ period: "2025-05", count: 23, size: "1.2GB" }]
```

### 4.6 Knowledge Graph

```rust
#[tauri::command]
fn get_graph() -> Result<GraphData, String>
// Trả về: { nodes: [GraphNode], edges: [GraphEdge] }

#[tauri::command]
fn get_node_details(node_id: String) -> Result<GraphNode, String>

#[tauri::command]
fn search_graph(query: String) -> Result<Vec<GraphNode>, String>
```

### 4.7 Index Management

```rust
#[tauri::command]
fn delete_index() -> Result<(), String>

#[tauri::command]
fn delete_all_memory() -> Result<(), String>

#[tauri::command]
fn get_stats() -> Result<IndexStats, String>
```

---

## 5. UI Mockup

### Main Layout

```
┌────────────────────────────────────────────────────────────┐
│ 🔍 MemoryOS                                        ⚙️ 📊 │
├─────────┬──────────────────────────────────────────────────┤
│         │                                                  │
│ 📂 Tìm  │  🔎 "Tìm file PDF về Docker tháng trước"   [🔍] │
│   kiếm  │                                                  │
│         │  🎯 5 kết quả (0.42s)                            │
│ 💬 Chat │                                                  │
│         │  ┌──────────────────────────────────────────────┐│
│ 📅      │  │ 📄 docker-compose-guide.pdf         ⭐ 92%  ││
│ Timeline│  │ 📁 D:\Study\Docker\ 📅 15/05/2025 2.3 MB    ││
│         │  │ "Hướng dẫn cài đặt Docker và docker-        ││
│ 🕸️ Graph│  │  compose cho người mới bắt đầu..."          ││
│         │  └──────────────────────────────────────────────┘│
│ 📊      │  ┌──────────────────────────────────────────────┐│
│ Thống kê│  │ 📄 Docker-Kubernetes-Notes.md       ⭐ 85%  ││
│         │  │ 📁 D:\Study\ 📅 10/05/2025 45 KB            ││
│         │  │ "...các lệnh Docker cơ bản, images,         ││
│         │  │  containers, docker-compose..."              ││
│         │  └──────────────────────────────────────────────┘│
│         │                                                  │
│         │  [📄 PDF] [🐳 Docker] [📅 Tháng trước]          │
├─────────┴──────────────────────────────────────────────────┤
│ 📊 1,245 file · 3.2 GB · 12 thư mục · Indexed: 100%  🔒   │
└────────────────────────────────────────────────────────────┘
```

### AI Chat Panel

```
┌────────────────────────────────────┐
│ 💬 AI Chat                    [✕] │
├────────────────────────────────────┤
│                                    │
│ 👤 Tôi: Tìm giúp tôi file PDF     │
│ về Docker mà tôi đọc tháng trước  │
│                                    │
│ ├─────────────────────────────────┤│
│ │ 🤖 MemoryOS:                    ││
│ │ Tôi tìm thấy 5 file liên quan   ││
│ │ đến Docker:                     ││
│ │                                 ││
│ │ 1. docker-compose-guide.pdf     ││
│ │    (15/05/2025)                 ││
│ │ 2. Docker-Kubernetes-Notes.md   ││
│ │    (10/05/2025)                 ││
│ │ 3. docker-cheatsheet.pdf        ││
│ │    (08/05/2025)                 ││
│ │ ...                             ││
│ │                                 ││
│ │ Bạn muốn tôi tóm tắt nội dung   ││
│ │ file nào không?                 ││
│ └─────────────────────────────────┘│
│                                    │
│ 👤 Tôi: Tóm tắt file số 1          │
│                                    │
│ ├─────────────────────────────────┤│
│ │ 🤖 MemoryOS:                    ││
│ │ File docker-compose-guide.pdf   ││
│ │ (2.3 MB, 45 trang)              ││
│ │                                 ││
│ │ Nội dung chính:                 ││
│ │ • Cài đặt Docker trên Windows   ││
│ │ • Docker Compose cơ bản         ││
│ │ • Network, Volume, Service      ││
│ │ • CI/CD với Docker              ││
│ └─────────────────────────────────┘│
│                                    │
│ ┌────────────────────────────────┐ │
│ │ Hỏi thêm về dữ liệu của bạn... │ │
│ └────────────────────────────────┘ │
└────────────────────────────────────┘
```

---

## 6. Search Flow Chi Tiết

```
User gõ: "Tìm file PDF về Docker mà tôi đọc khoảng tháng trước"
     │
     ▼
Step 1: NLP Parse (memory-ai/nlp.rs)
  ├── Keywords: ["Docker", "PDF"]
  ├── Intent: search
  ├── Time: "tháng trước" → date range
  └── Type: PDF
     │
     ▼
Step 2: BM25 Full-text Search (memory-search/bm25.rs)
  ├── Query: "Docker" → 50 results
  ├── Filter: extension=pdf, date_range
  └── Score: TF-IDF → BM25
     │
     ▼
Step 3: Vector Search (memory-search/vector.rs)
  ├── Embed query → cosine similarity
  ├── Top 50 results
  └── Score: 0.0 → 1.0
     │
     ▼
Step 4: Re-rank (memory-search/reranker.rs)
  ├── Normalize BM25 score
  ├── Normalize Vector score
  ├── Weighted combination: BM25*0.4 + Vector*0.6
  └── Sort → Top 20
     │
     ▼
Step 5: AI Enhance (Optional — memory-ai/chat.rs)
  ├── Gửi top results cho LLM
  ├── LLM tóm tắt + giải thích
  └── Trả về natural language answer
     │
     ▼
Trả về UI
  ├── SearchResults → danh sách
  └── ChatPanel → câu trả lời tự nhiên
```

---

## 7. Memory Graph Flow

```
File được index
     │
     ▼
memory-graph/relation.rs:
  ├── Extract topics từ content (NLP)
  ├── Tạo nodes: file, topic, person, project
  └── Tạo edges: related, contains, mentions
     │
     ▼
Ví dụ:
  [docker-compose-guide.pdf]
       │ contains
       ▼
  [Docker] ───related─── [Kubernetes]
       │                    │
       │ mentions           │ mentions
       ▼                    ▼
  [Container]          [Orchestration]
       │
       │ related
       ▼
  [Docker-Kubernetes-Notes.md]
     │
     ▼
Khi user search "Docker":
  → Tìm được cả PDF + Notes + topics liên quan
```

---

## 8. Timeline Flow

```
File được index
     │
     ▼
memory-graph/timeline.rs:
  ├── Lấy modified_at từ file metadata
  ├── Group theo: ngày → tuần → tháng → năm
  └── Tạo TimelineEvent
     │
     ▼
UI TimelineView:
  ├── 📅 Tháng 5/2025 (23 file)
  │   ├── 📄 docker-compose-guide.pdf (15/05)
  │   ├── 📄 Docker-Kubernetes-Notes.md (10/05)
  │   └── ...
  ├── 📅 Tháng 4/2025 (45 file)
  └── 📅 Tháng 3/2025 (12 file)
```

---

## 9. OCR Pipeline

```
User chọn folder có ảnh (JPG, PNG)
     │
     ▼
Rust gọi Python script:
  ┌──────────────────────────────────────┐
  │  python scripts/ocr_pipeline.py      │
  │      --input D:\Scan\                │
  │      --output D:\memoryos\ocr_results│
  └──────────────────────────────────────┘
     │
     ▼
PaddleOCR xử lý:
  ├── Phát hiện text trong ảnh
  ├── Nhận dạng ký tự (có tiếng Việt)
  └── Trả về JSON: [{ text, confidence, bbox }]
     │
     ▼
Lưu text vào file_contents + FTS5 index
     │
     ▼
Search được: "Tìm hóa đơn điện", "Tìm CCCD", "Tìm giấy khai sinh"
```

---

## 10. Error Handling

| Error | Handling |
|---|---|
| File đang được mở | Skip, log warning |
| PDF bị password | Skip, log warning |
| DOCX corrupted | Skip, log error |
| File > 100MB | Skip, log info |
| SQLite busy | Retry 3 times, then error |
| Ollama not running | Thông báo, fallback to FTS5 only |
| PaddleOCR not installed | Hướng dẫn cài đặt |
| Permission denied | Skip, log warning |

---

## 11. Performance Targets

| Metric | Target |
|---|---|
| Scan 10,000 files | < 5 phút |
| Full-text search | < 100ms |
| Semantic search | < 500ms |
| AI Chat response | < 3s (local LLM) |
| Timeline load | < 200ms |
| Graph load (10,000 nodes) | < 1s |
| UI response time | < 50ms |
| RAM usage | < 200MB idle, < 500MB indexing |
| Disk usage | ~10% of indexed file size |

---

## 12. Cargo.toml Files

### Workspace Root (`Cargo.toml`)

```toml
[workspace]
members = [
    "crates/memory-core",
    "crates/memory-indexer",
    "crates/memory-search",
    "crates/memory-security",
    "crates/memory-ai",
    "crates/memory-graph",
]
resolver = "2"
```

### Desktop App (`apps/desktop/src-tauri/Cargo.toml`)

```toml
[package]
name = "memory-os-desktop"
version = "0.1.0"
edition = "2021"

[dependencies]
memory-core = { path = "../../../crates/memory-core" }
memory-indexer = { path = "../../../crates/memory-indexer" }
memory-search = { path = "../../../crates/memory-search" }
memory-security = { path = "../../../crates/memory-security" }
memory-ai = { path = "../../../crates/memory-ai" }
memory-graph = { path = "../../../crates/memory-graph" }
tauri = { version = "2", features = ["dialog"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["full"] }
```

### memory-core

```toml
[package]
name = "memory-core"
version = "0.1.0"
edition = "2021"

[dependencies]
walkdir = "2"
sha2 = "0.10"
chrono = "0.4"
uuid = { version = "1", features = ["v4"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
pdf-extract = "0.7"
docx-rs = "0.4"
log = "0.4"
```

### memory-search

```toml
[package]
name = "memory-search"
version = "0.1.0"
edition = "2021"

[dependencies]
serde = { version = "1", features = ["derive"] }
serde_json = "1"
rusqlite = { version = "0.31", features = ["bundled", "fts5"] }
log = "0.4"
```

### memory-ai

```toml
[package]
name = "memory-ai"
version = "0.1.0"
edition = "2021"

[dependencies]
reqwest = { version = "0.12", features = ["json"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["full"] }
log = "0.4"
```

### memory-security

```toml
[package]
name = "memory-security"
version = "0.1.0"
edition = "2021"

[dependencies]
aes-gcm = "0.10"
argon2 = "0.5"
base64 = "0.22"
serde = { version = "1", features = ["derive"] }
rand = "0.8"
log = "0.4"
```

### memory-graph

```toml
[package]
name = "memory-graph"
version = "0.1.0"
edition = "2021"

[dependencies]
serde = { version = "1", features = ["derive"] }
serde_json = "1"
rusqlite = { version = "0.31", features = ["bundled"] }
chrono = "0.4"
log = "0.4"
```

---

## 13. Xây dựng theo thứ tự

### Tuần 1-2: Nền tảng
- [ ] Tạo Cargo workspace
- [ ] Tạo Tauri desktop app
- [ ] `memory-core`: scanner + extractor (PDF, DOCX, TXT, MD)
- [ ] `memory-indexer`: SQLite schema + pipeline

### Tuần 3-4: Index + Search
- [ ] `memory-search`: BM25 + FTS5
- [ ] `memory-ai`: embedder (Ollama API)
- [ ] `memory-search`: vector search
- [ ] `memory-search`: reranker

### Tuần 5-6: Ưu tiên trải nghiệm
- [ ] UI: SearchBar + SearchResults
- [ ] UI: FolderPicker + ScanProgress
- [ ] UI: FilePreview (PDF, text)

### Tuần 7-8: AI + Features
- [ ] `memory-ai`: NLP parse + chat
- [ ] UI: ChatPanel
- [ ] `memory-graph`: graph engine
- [ ] UI: GraphView (d3.js hoặc vis.js)

### Tuần 9-10: Timeline + Security
- [ ] `memory-graph`: timeline engine
- [ ] UI: TimelineView
- [ ] `memory-security`: AES-256-GCM
- [ ] UI: Settings + Privacy

### Tuần 11-12: OCR + Hoàn thiện
- [ ] OCR pipeline (PaddleOCR)
- [ ] Testing + Bug fixes
- [ ] Performance optimization
- [ ] Package build
