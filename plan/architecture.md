# ResearchMind VN — Architecture

> **Kiến trúc tổng thể cho ResearchMind VN — Trợ lý nghiên cứu AI cho học giả Việt Nam**
> **Local-first, Python backend, Tauri shell**

---

## 1. Tổng Quan Kiến Trúc

```
┌──────────────────────────────────────────────────────────────────┐
│                   Presentation Layer (React + shadcn/ui)          │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  Library │ Search │ Chat │ Settings │ Preview │ Stats      │  │
│  └────────────────────────┬───────────────────────────────────┘  │
│                           │ IPC (invoke/event)                    │
├───────────────────────────┼──────────────────────────────────────┤
│                   Tauri Shell (Rust — chỉ làm cầu nối)            │
│  ┌────────────────────────┴───────────────────────────────────┐  │
│  │  - Mở cửa sổ desktop                                       │  │
│  │  - Gọi Python backend qua child process / HTTP localhost    │  │
│  │  - File dialog chọn thư mục                                 │  │
│  └────────────────────────┬───────────────────────────────────┘  │
├───────────────────────────┼──────────────────────────────────────┤
│                   Backend Core (Python FastAPI)                   │
│  ┌────────────────────────┴───────────────────────────────────┐  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌────────────────┐  │  │
│  │  │  ingestion/  │  │   search/    │  │    chat/       │  │  │
│  │  │  parser.py   │  │   bm25.py    │  │  retriever.py  │  │  │
│  │  │  chunker.py  │  │   vector.py  │  │  generator.py  │  │  │
│  │  │ embedder.py  │  │   hybrid.py  │  │                │  │  │
│  │  └──────────────┘  └──────────────┘  └────────────────┘  │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌────────────────┐  │  │
│  │  │    db/       │  │  library/    │  │   config/      │  │  │
│  │  │  models.py   │  │  crud.py     │  │  settings.py   │  │  │
│  │  └──────────────┘  └──────────────┘  └────────────────┘  │  │
│  └───────────────────────────────────────────────────────────┘  │
├─────────────────────────────────┼────────────────────────────────┤
│                        Data Layer                                │
│  ┌──────────────────────────────┴─────────────────────────────┐  │
│  │                    Local Storage                            │  │
│  │  ┌────────────┐  ┌────────────┐  ┌─────────────────────┐  │  │
│  │  │  SQLite    │  │  ChromaDB  │  │  Local File System  │  │  │
│  │  │  (FTS5     │  │  (Vector   │  │  (PDF copies)        │  │  │
│  │  │   + Meta)  │  │   Store)   │  │                      │  │  │
│  │  └────────────┘  └────────────┘  └─────────────────────┘  │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 2. Thành Phần Chi Tiết

### 2.1 Frontend (React + TypeScript + shadcn/ui)

| Công nghệ | Phiên bản | Mục đích |
|---|---|---|
| React | 19 | UI framework |
| TypeScript | 5.x | Type safety |
| shadcn/ui | Latest | UI components |
| Tailwind CSS | 4 | Styling |
| TanStack Query | 5 | Data fetching + caching |
| Zustand | 4 | State management (UI state) |
| react-pdf | latest | PDF preview |

### 2.2 Tauri Shell (Rust — tối thiểu)

Tauri chỉ đóng vai trò **desktop shell**, không xử lý logic chính:

```rust
// src-tauri/src/main.rs (cực kỳ đơn giản)
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())  // File dialog
        .invoke_handler(tauri::generate_handler![
            open_backend,    // Khởi chạy Python backend
            close_backend,   // Tắt Python backend
            select_folder,   // File picker dialog
            get_status,      // Backend health check
        ])
        .run(tauri::generate_context!())
        .expect("error");
}
```

**Tại sao vẫn dùng Tauri thay vì Electron?**
- Nhẹ (RAM ~50MB vs Electron ~200MB)
- Có sẵn file dialog, system tray
- Dễ dàng đóng gói thành .exe
- Vẫn cho React frontend như Electron

### 2.3 Backend Core (Python FastAPI)

| Module | File | Chức năng |
|---|---|---|
| **ingestion/parser.py** | PyMuPDF | Extract text + metadata từ PDF |
| **ingestion/chunker.py** | LangChain TextSplitter | Chia text thành chunks 512 tokens |
| **ingestion/embedder.py** | sentence-transformers (bge-m3) | Tạo embedding vector |
| **search/bm25.py** | SQLite FTS5 | Full-text search |
| **search/vector.py** | ChromaDB | Vector search |
| **search/hybrid.py** | Custom fusion | Kết hợp BM25 + Vector + Re-rank |
| **chat/retriever.py** | Custom | RAG retrieval pipeline |
| **chat/generator.py** | llama-server (GGUF) / Claude API | LLM response generation |
| **db/models.py** | SQLAlchemy + SQLite | Database models |
| **library/crud.py** | Custom | Library management CRUD |
| **config/settings.py** | Pydantic Settings | App configuration |

### 2.4 Data Layer

| Store | Công nghệ | Dữ liệu lưu |
|---|---|---|
| **Metadata DB** | SQLite | Paper info, tags, notes, status |
| **Full-text Index** | SQLite FTS5 | Full text content for BM25 |
| **Vector Store** | ChromaDB (local) | Embedding vectors + chunks |
| **File Storage** | Local filesystem | PDF copies (có tổ chức) |

---

## 3. Cấu Trúc Thư Mục Dự Án

```
researchmind/
│
├── src-tauri/                  # 🖥️ Tauri Desktop Shell (Rust)
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── src/
│       ├── main.rs             # Entry point
│       └── lib.rs              # Tauri commands
│
├── src/                        # ⚛️ React + TypeScript UI
│   ├── main.tsx
│   ├── App.tsx
│   ├── components/
│   │   ├── layout/             # Sidebar, Header, MainLayout
│   │   ├── library/            # Paper library list
│   │   ├── search/             # SearchBar, SearchResults
│   │   ├── chat/               # ChatPanel, ChatMessage, ChatInput
│   │   ├── settings/           # Settings panel
│   │   └── ui/                 # shadcn/ui components
│   ├── hooks/
│   │   ├── useLibrary.ts
│   │   ├── useSearch.ts
│   │   ├── useChat.ts
│   │   └── useSettings.ts
│   ├── lib/
│   │   ├── api.ts              # FastAPI client
│   │   └── utils.ts
│   └── styles/
│       └── globals.css
│
├── backend/                    # 🐍 Python FastAPI Backend
│   ├── requirements.txt
│   ├── main.py                 # FastAPI app
│   ├── ingestion/
│   │   ├── parser.py           # PyMuPDF extractor
│   │   ├── chunker.py          # Text splitting
│   │   └── embedder.py         # bge-m3 embedding
│   ├── search/
│   │   ├── bm25.py             # SQLite FTS5
│   │   ├── vector.py           # ChromaDB
│   │   └── hybrid.py           # Score fusion + reranker
│   ├── chat/
│   │   ├── retriever.py        # RAG retrieval
│   │   └── generator.py        # LLM (llama-server GGUF / Claude)
│   ├── db/
│   │   ├── models.py           # SQLAlchemy models
│   │   └── database.py         # Connection + session
│   ├── library/
│   │   └── crud.py             # Library CRUD
│   └── config/
│       └── settings.py         # Pydantic settings
│
├── data/                       # 📁 Local user data (gitignored)
│   ├── papers/                 # PDF copies
│   ├── chroma/                 # ChromaDB persistent storage
│   └── researchmind.db         # SQLite database
│
├── models/                     # 🤖 Downloaded models (gitignored)
│   └── bge-m3/                 # bge-m3 embedding model cache
│
├── scripts/                    # 🔧 Utility scripts
│   ├── download_models.py      # Download bge-m3
│   └── test_pipeline.py        # Test ingestion pipeline
│
├── package.json                # Frontend deps
├── tsconfig.json
├── vite.config.ts
├── index.html
└── README.md
```

---

## 4. Data Flow Diagrams

### 4.1 Import & Index PDF Flow

```
User kéo thả PDF vào app
       │
       ▼
Tauri IPC → POST /api/papers/import
       │
       ▼
backend/ingestion/parser.py:
  ├── PyMuPDF extract text
  ├── Extract metadata: title, author, year, DOI
  └── Detect language (VN/EN)
       │
       ▼
backend/ingestion/chunker.py:
  ├── Split thành chunks 512 tokens
  ├── Overlap 50 tokens
  ├── Sentence-aware (không cắt giữa câu)
  └── Gán metadata per chunk: page number, section header
       │
       ▼
backend/ingestion/embedder.py:
  ├── bge-m3 → embedding vector 1024 chiều
  ├── Dense + Sparse vector (cho hybrid search)
  └── Mỗi chunk = 1 vector
       │
       ├──► ChromaDB: lưu vectors + chunks
       │
       └──► SQLite FTS5: index full text cho BM25
            │
            ▼
       SQLite: lưu paper metadata, tags, status
       ChromaDB: lưu embeddings
            │
            ▼
Trả về: { paper_id, chunks_count, status: "indexed" }
```

### 4.2 Search Flow

```
User: "phương pháp đánh giá độ trễ mạng 5G"
       │
       ▼
POST /api/search
       │
       ▼
backend/search/hybrid.py:
  │
  ├── BM25 Search (SQLite FTS5):
  │   ├── Query: "phương pháp đánh giá độ trễ mạng 5G"
  │   ├── Tokenize tiếng Việt (ICU tokenizer)
  │   └── Top 20 results
  │
  ├── Vector Search (ChromaDB):
  │   ├── Embed query → bge-m3
  │   ├── Cosine similarity → Top 20
  │   └── Kết hợp dense + sparse score
  │
  └── Fusion (Reciprocal Rank Fusion):
      ├── BM25 rank + Vector rank
      ├── RRF score = Σ(1 / (k + rank_i))
      └── Top 10 final results
           │
           ▼
Trả về: [
  { chunk_text, paper_title, page, score, highlight },
  ...
]
```

### 4.3 Chat với Paper Flow (RAG Pipeline)

```
User chọn 3 paper + gửi câu hỏi
       │
       ▼
POST /api/chat
       │
       ▼
backend/chat/retriever.py:
  ├── Gọi hybrid search với filter = selected_papers
  ├── Lấy top-5 chunks từ 3 paper
  └── Cross-encoder re-rank (ms-marco)
       │
       ▼
backend/chat/generator.py:
  ├── Build context:
  │   """
  │   Context:
  │   [Paper 1] (trang 5): "5G network slicing enables..."
  │   [Paper 2] (trang 12): "Latency evaluation methods..."
  │   [Paper 3] (trang 8): "The simulation results show..."
  │
  │   Câu hỏi: phương pháp đánh giá độ trễ mạng 5G?
  │   """
  ├── Gửi đến llama-server (Qwen2.5 3B GGUF) hoặc Claude API
  └── Yêu cầu: trả lời CÓ TRÍCH DẪN [tên paper, trang]
       │
       ▼
backend/chat/generator.py (Citation Check):
  ├── Kiểm tra mọi claim có source không
  └── Nếu thiếu → từ chối trả lời
       │
       ▼
Trả về: {
  answer: "...",
  citations: [
    { paper: "5G-Net-2024.pdf", page: 5, text: "..." },
    ...
  ],
  model_used: "local/Qwen2.5-3B-Instruct-Q4_K_M.gguf"
}
```

### 4.4 Library Management Flow

```
User mở app → GET /api/papers
       │
       ▼
Backend:
  ├── Query SQLite: SELECT * FROM papers ORDER BY indexed_at DESC
  ├── JOIN file_stats (chunk count, status)
  └── Trả về list papers
       │
       ▼
UI:
  ├── Danh sách paper (thumbnail, title, author, year)
  ├── Filter: đã đọc / chưa đọc / tagged
  ├── Sort: ngày thêm / tên / tác giả
  └── Action: chat, delete, add note, export citation
```

---

## 5. Database Schema (SQLite)

### 5.1 papers — Paper Metadata

```sql
CREATE TABLE papers (
    id TEXT PRIMARY KEY,                -- UUID
    filename TEXT NOT NULL,
    title TEXT,
    authors TEXT,                       -- JSON array
    year INTEGER,
    doi TEXT,
    abstract TEXT,
    language TEXT DEFAULT 'unknown',    -- vi / en
    page_count INTEGER,
    file_size INTEGER,
    file_path TEXT NOT NULL,
    status TEXT DEFAULT 'pending',      -- pending / indexing / indexed / failed
    tags TEXT DEFAULT '[]',             -- JSON array of user tags
    notes TEXT DEFAULT '',              -- User's short notes
    read_status TEXT DEFAULT 'unread',  -- unread / reading / read
    starred INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    indexed_at TEXT,
    UNIQUE(file_path)
);
```

### 5.2 chunks — Text Chunks

```sql
CREATE TABLE chunks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    page_number INTEGER,
    section_header TEXT,
    token_count INTEGER,
    UNIQUE(paper_id, chunk_index)
);
```

### 5.3 chunks_fts — Full-Text Search (FTS5)

```sql
CREATE VIRTUAL TABLE chunks_fts USING fts5(
    content,
    content='chunks',
    content_rowid='id',
    tokenize='unicode61'
);
```

### 5.4 chat_history — Chat History

```sql
CREATE TABLE chat_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    context_papers TEXT,                -- JSON array of paper_ids used
    citations TEXT,                     -- JSON array of citations
    model_used TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);
```

### 5.5 settings — App Settings

```sql
CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

INSERT OR IGNORE INTO settings (key, value) VALUES
    ('papers_folder', ''),
    ('llm_mode', 'local'),             -- local / cloud
    ('llama_server_url', 'http://127.0.0.1:8080'),
    ('local_model', 'Qwen2.5-3B-Instruct-Q4_K_M.gguf'),
    ('claude_api_key', ''),
    ('embedding_model', 'bge-m3'),
    ('chunk_size', '512'),
    ('chunk_overlap', '50'),
    ('top_k_retrieval', '5'),
    ('hybrid_search_alpha', '0.3'),     -- 0=full vector, 1=full BM25
    ('theme', 'light'),
    ('language', 'vi');
```

### 5.6 ChromaDB Collections

ChromaDB lưu riêng biệt, không trong SQLite:

```
Collection: "paper_chunks"
  - id: chunk_id (str)
  - embedding: vector[1024] (bge-m3)
  - metadata: {
      paper_id, chunk_index, page_number,
      section_header, paper_title, year
    }
  - document: chunk_text
```

---

## 6. API Endpoints (FastAPI)

### 6.1 Paper Management

| Method | Endpoint | Chức năng |
|---|---|---|
| `POST` | `/api/papers/import` | Import 1 PDF (upload hoặc file path) |
| `POST` | `/api/papers/import/folder` | Import tất cả PDF từ folder |
| `GET` | `/api/papers` | Danh sách papers (có filter, sort, paginate) |
| `GET` | `/api/papers/{id}` | Chi tiết 1 paper |
| `DELETE` | `/api/papers/{id}` | Xóa paper + chunks + embeddings |
| `PATCH` | `/api/papers/{id}` | Cập nhật tags, notes, read_status, starred |
| `GET` | `/api/papers/{id}/chunks` | Xem chunks của paper |

### 6.2 Search

| Method | Endpoint | Chức năng |
|---|---|---|
| `POST` | `/api/search` | Hybrid search (BM25 + Vector) |
| `GET` | `/api/search/suggest` | Search suggestions |

### 6.3 Chat

| Method | Endpoint | Chức năng |
|---|---|---|
| `POST` | `/api/chat` | Chat với selected papers |
| `GET` | `/api/chat/history` | Chat history |
| `DELETE` | `/api/chat/history` | Xóa history |

### 6.4 System

| Method | Endpoint | Chức năng |
|---|---|---|
| `GET` | `/api/health` | Health check |
| `GET` | `/api/stats` | Thống kê (papers count, chunks, storage) |
| `GET` | `/api/settings` | Get settings |
| `PUT` | `/api/settings` | Update settings |
| `POST` | `/api/local/pull` | Pull GGUF model |

---

## 7. RAG Pipeline Chi Tiết

```
User Question
      │
      ▼
┌─────────────────────────────────────┐
│ 1. Query Processing                 │
│ ├── Language detection (VN/EN)     │
│ ├── Query expansion (đồng nghĩa)   │
│ └── Intent classification          │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│ 2. Hybrid Retrieval (song song)     │
│ ├── BM25 (SQLite FTS5) → top 20    │
│ └── Vector (ChromaDB) → top 20     │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│ 3. Reciprocal Rank Fusion          │
│ ├── k=60 cho RRF                   │
│ └── Merge 40 results → top 15     │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│ 4. Cross-encoder Re-ranking        │
│ ├── Model: cross-encoder/ms-marco  │
│ ├── Chấm điểm relevance 0-1        │
│ └── Top 5 chunks cuối cùng         │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│ 5. Context Building                │
│ ├── Ghép 5 chunks + metadata       │
│ ├── System prompt: "Trả lời bằng   │
│ │   tiếng Việt, có trích dẫn..."   │
│ └── Token budget: 4096 tokens      │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│ 6. LLM Generation                  │
│ ├── Local: llama-server (Qwen2.5 3B GGUF)  │
│ ├── Cloud: Claude Sonnet API       │
│ └── Streaming response             │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│ 7. Citation Verification           │
│ ├── Mọi claim phải có [tên paper]  │
│ ├── Nếu không → refuse             │
│ └── Highlight trong UI             │
└──────────────┬──────────────────────┘
               │
               ▼
         User Response
    (có trích dẫn, không hallucination)
```

---

## 8. Key Design Decisions

| Decision | Lý do |
|---|---|
| **Python (FastAPI) over Rust** | Ecosystem AI tốt nhất, nhanh để prototype, rewrite Rust sau nếu cần |
| **Tauri over Electron** | Nhẹ (RAM), Rust shell + React frontend |
| **ChromaDB over Qdrant** | Dễ setup nhất (pip install), persist local, không cần server |
| **bge-m3 over e5** | Đa ngôn ngữ (VNm English), CPU-friendly, context 8192 tokens |
| **SQLite FTS5 over Tantivy** | Zero dependency, đủ nhanh cho MVP |
| **Hybrid Search over pure vector** | BM25 bắt từ khóa chính xác, Vector hiểu ngữ nghĩa |
| **Local LLM (llama-server) first** | Privacy, offline, không tốn API phí |
| **Cloud LLM (Claude) option** | Khi user muốn chất lượng cao hơn, user tự trả tiền |
| **Cross-encoder re-rank** | Tăng accuracy 15-20% |
| **Citation verification** | Chống hallucination — yếu tố quan trọng với academic users |

---

## 9. Performance Targets

| Metric | Target |
|---|---|
| Import & Index 1 PDF (50 trang) | < 30 giây |
| Search (hybrid) | < 500ms |
| Chat response (local LLM) | < 5s |
| Chat response (Claude API) | < 3s |
| Library load (1000 papers) | < 200ms |
| RAM idle | < 200MB |
| RAM indexing | < 500MB |
| Disk usage per 100 PDFs | ~200MB (including embeddings) |
| Offline capability | 100% (trừ khi dùng Claude API) |

---

## 10. Error Handling

| Error | Handling |
|---|---|
| PDF corrupted / password | Skip, log error, thông báo user |
| llama-server not running | Fallback: search vẫn chạy, chat disabled |
| ChromaDB corrupted | Delete and rebuild from chunks |
| SQLite busy | Retry 3 lần, timeout 5s |
| Disk full | Warning, pause indexing |
| bge-m3 model not downloaded | Auto-download on first run |
| Claude API key invalid | Thông báo, fallback to local LLM |

---

## 11. Portability

```
Platform    | MVP (8 tuần) | Year 1 | Year 2
────────────┼──────────────┼────────┼───────
Windows     │     ✅       │   ✅   │   ✅
macOS       │     🔄       │   ✅   │   ✅
Linux       │     ❌       │   🔄   │   ✅
Web         │     ❌       │   ❌   │   🔄

✅ = Primary   🔄 = Secondary   ❌ = Not yet
```
