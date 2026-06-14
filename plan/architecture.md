# MemoryOS — Architecture

> **Kiến trúc tổng thể cho MemoryOS — Hệ điều hành trí nhớ cá nhân**
> **Desktop là Core Product. Mobile chỉ là thiết bị nhập liệu.**

---

## 1. Tổng Quan Kiến Trúc (Desktop Core)

```
┌─────────────────────────────────────────────────────────────┐
│                      Presentation Layer                      │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              React UI (Tauri Desktop)                  │  │
│  │  Search │ Chat │ Timeline │ Graph │ Preview │ Stats  │  │
│  └───────────────────────┬───────────────────────────────┘  │
│                          │ IPC (invoke/event)               │
├──────────────────────────┼──────────────────────────────────┤
│                      Application Layer                      │
│  ┌───────────────────────┴───────────────────────────────┐  │
│  │              Tauri Commands (Rust)                     │  │
│  │  folder │ scan │ search │ chat │ timeline │ graph     │  │
│  └───────────────────────┬───────────────────────────────┘  │
├──────────────────────────┼──────────────────────────────────┤
│                       Core Layer (Rust Crates)              │
│  ┌───────────────────────┴───────────────────────────────┐  │
│  │  ┌──────────────┐  ┌───────────────┐  ┌───────────┐  │  │
│  │  │ memory-core  │  │ memory-indexer│  │memory-    │  │  │
│  │  │ (Scanner,    │  │ (SQLite,      │  │search     │  │  │
│  │  │  Extractor)  │  │  Pipeline)    │  │(BM25,Vec) │  │  │
│  │  └──────────────┘  └───────────────┘  └───────────┘  │  │
│  │  ┌──────────────┐  ┌───────────────┐  ┌───────────┐  │  │
│  │  │ memory-ai    │  │ memory-graph  │  │memory-    │  │  │
│  │  │ (Ollama,     │  │ (Graph,       │  │security   │  │  │
│  │  │  Embedder)   │  │  Timeline)    │  │(Encrypt)  │  │  │
│  │  └──────────────┘  └───────────────┘  └───────────┘  │  │
│  └───────────────────────────────────────────────────────┘  │
├──────────────────────────┼──────────────────────────────────┤
│                      Data Layer                             │
│  ┌───────────────────────┴───────────────────────────────┐  │
│  │              Local Storage                             │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────────────────┐  │  │
│  │  │ SQLite   │ │ Vector   │ │ Local File System    │  │  │
│  │  │ (FTS5    │ │ Store    │ │ (Original files)     │  │  │
│  │  │  + Graph)│ │          │ │                      │  │  │
│  │  └──────────┘ └──────────┘ └──────────────────────┘  │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Cargo Workspace Structure

```
memoryos/
│
├── Cargo.toml                    # Workspace root
│
├── apps/
│   └── desktop/                  # 🖥️ Tauri Desktop App
│       ├── package.json
│       ├── tsconfig.json
│       ├── vite.config.ts
│       ├── index.html
│       ├── src/                  # React frontend
│       └── src-tauri/            # Tauri Rust backend
│           ├── Cargo.toml        # Deps: memory-core, memory-ai, ...
│           ├── tauri.conf.json
│           └── src/
│               ├── main.rs
│               ├── lib.rs
│               └── commands/     # IPC commands (folder, scan, search, chat, timeline, graph, stats)
│
├── crates/                       # 📦 Rust Workspace Crates
│   ├── memory-core/              # Core engine
│   │   ├── scanner.rs            #   Walk directories, hash files
│   │   └── extractor.rs          #   PDF, DOCX, TXT, MD extraction
│   │
│   ├── memory-indexer/           # Indexing
│   │   ├── db.rs                 #   SQLite schema + CRUD
│   │   └── pipeline.rs           #   Indexing pipeline
│   │
│   ├── memory-search/            # Search engine
│   │   ├── bm25.rs               #   BM25 full-text ranking
│   │   ├── vector.rs             #   Cosine similarity search
│   │   └── reranker.rs           #   Combine BM25 + vector scores
│   │
│   ├── memory-ai/                # AI + NLP
│   │   ├── ollama.rs             #   Ollama API client
│   │   ├── nlp.rs                #   Natural language parser
│   │   ├── embedder.rs           #   Embedding generation
│   │   └── chat.rs               #   Chat context manager
│   │
│   ├── memory-graph/             # Knowledge Graph + Timeline
│   │   ├── graph.rs              #   Node + Edge management
│   │   ├── timeline.rs           #   Timeline engine
│   │   └── relation.rs           #   Relation extraction
│   │
│   └── memory-security/          # Encryption
│       └── encrypt.rs            #   AES-256-GCM + Argon2id
│
├── scripts/
│   └── ocr_pipeline.py           # PaddleOCR Python script
│
├── docs/
├── tests/
│   ├── integration/
│   └── fixtures/
│
└── README.md
```

---

## 3. Extension Architecture (Year 1)

```
┌──────────────────────────────────────────────────────────────┐
│                    Desktop Core                               │
│  Tauri App (React + Rust)                                    │
│  Local HTTP API: localhost:9876                               │
└──────────┬───────────────────────────────────────────────────┘
           │ HTTP REST API (localhost only, CORS restricted)
           │
      ┌────┴────┬──────────┬──────────┐
      │         │          │          │
      ▼         ▼          ▼          ▼
┌────────┐ ┌────────┐ ┌────────┐ ┌──────────┐
│Browser │ │ VSCode │ │ Cursor │ │ Chrome   │
│Ext     │ │ Ext    │ │ Ext    │ │ History  │
└────────┘ └────────┘ └────────┘ └──────────┘

API Endpoints:
  GET  /api/search?q=...        → Search files
  GET  /api/files/:id           → Get file details
  GET  /api/stats               → Get index stats
  POST /api/import/chrome       → Import Chrome history
  POST /api/import/github       → Import Github repos
```

---

## 4. Mobile Companion Architecture (Year 2-3)

```
┌──────────────────────┐      ┌──────────────────────────┐
│   Mobile Companion   │      │   Desktop Core            │
│                      │      │                          │
│  📸 Camera → ảnh     │ ──►  │  OCR → Index → Search    │
│  🎤 Voice → audio   │ ──►  │  STT → Index → Search    │
│  📝 Note → text     │ ──►  │  Index → Search          │
│                      │      │                          │
│  (No local AI)       │      │  (All AI here)           │
│  (Simple upload)     │      │  (Local LLM, Embedding)  │
└──────────────────────┘      └──────────────────────────┘

Mobile chỉ là thiết bị NHẬP DỮ LIỆU NHANH.
Không xử lý AI trên mobile.
Dữ liệu sync qua local network hoặc encrypted cloud.
```

---

## 5. 5-Year Architecture Evolution

### Year 1: Desktop Only

```
[Desktop: Tauri + Rust + React]
    │
    ├── Core Engine
    ├── Search + AI
    ├── OCR
    └── Extensions (Browser, VSCode, Cursor)
```

### Year 2-3: Desktop + Mobile Companion

```
[Desktop Core] ◄── (local network / encrypted) ──── [Mobile Companion]
    │                                                   │
    ├── AI (local LLM)                                  ├── Camera
    ├── Search (full-text + vector)                     ├── Voice
    ├── Knowledge Graph                                 └── Quick Note
    └── Timeline
```

### Year 5: Multi-Platform

```
                    ┌──────────────┐
                    │  MemoryOS    │
                    │  Ecosystem   │
                    └──────┬───────┘
                           │
            ┌──────────────┼──────────────┐
            │              │              │
            ▼              ▼              ▼
     ┌──────────┐   ┌──────────┐   ┌──────────┐
     │ Desktop  │   │  Mobile  │   │   Web    │
     │ (Core)   │   │(Companion)│   │ (Light)  │
     └─────┬────┘   └──────────┘   └──────────┘
           │
     ┌─────┴─────┐
     │  Local AI │
     │  (Ollama) │
     └─────┬─────┘
           │
     ┌─────┴─────────────┐
     │ Encrypted Sync    │
     │ (Zero Knowledge)  │
     └───────────────────┘
```

---

## 6. Data Flow Diagrams

### 6.1 Indexing Flow

```
User chọn thư mục
       │
       ▼
memory-core/scanner.rs ──walkdir──► List files
       │
       ▼
Filter: extension (pdf, docx, txt, md, jpg, png), size (<100MB)
       │
       ▼
For each file:
  ├── SHA-256 hash → memory-core
  ├── Extract text → memory-core/extractor.rs
  │   ├── PDF  → pdf-extract
  │   ├── DOCX → docx-rs
  │   ├── TXT  → read
  │   ├── MD   → read
  │   └── JPG/PNG → OCR (scripts/ocr_pipeline.py)
  ├── Memory Graph → memory-graph/relation.rs
  │   ├── Extract topics
  │   ├── Create nodes
  │   └── Create edges
  ├── Timeline → memory-graph/timeline.rs
  │   └── Group by date
  ├── Store → memory-indexer/pipeline.rs
  │   ├── SQLite → metadata + content + graph + timeline
  │   └── FTS5 → full-text index
  └── Embed → memory-ai/embedder.rs
      ├── Chunk text (512 tokens)
      ├── Ollama API → embedding vector
      └── Store in embeddings table
       │
       ▼
Update stats + scan_log
```

### 6.2 Search Flow

```
User: "Tìm file PDF về Docker mà tôi đọc khoảng tháng trước"
       │
       ▼
memory-ai/nlp.rs:
  ├── Parse: keywords=["Docker"], type=PDF, time="tháng trước"
  └── Output: SearchQuery { text: "Docker", ext: "pdf", date_range: [...] }
       │
       ▼
memory-search/bm25.rs:
  ├── SQLite FTS5 query → 50 results
  └── BM25 score → ranked
       │
       ▼
memory-search/vector.rs:
  ├── Embed query → cosine similarity
  └── Top 50 results
       │
       ▼
memory-search/reranker.rs:
  ├── BM25 * 0.4 + Vector * 0.6
  └── Sort → Top 20
       │
       ▼
memory-graph/graph.rs:
  ├── Tìm nodes liên quan
  └── Gợi ý thêm
       │
       ▼
Trả về UI: SearchResult[]
```

### 6.3 AI Chat Flow

```
User: "Tóm tắt nội dung file docker-compose-guide.pdf"
       │
       ▼
memory-ai/chat.rs:
  ├── Tìm file_id từ search
  ├── Lấy nội dung từ file_contents
  ├── Tạo prompt:
  │   "Hãy tóm tắt nội dung sau: [content...]"
  └── Gửi đến Ollama API: POST /api/chat
       │
       ▼
Ollama (local):
  ├── Model: qwen2.5:7b
  ├── Context: file content
  └── Response: summary
       │
       ▼
Trả về UI: ChatResponse { message: "..." }
```

---

## 7. Security Architecture

```
┌─────────────────────┐
│   User Master Key   │ ← Từ password người dùng
└──────────┬──────────┘
           │ Argon2id (memory-hard KDF)
           ▼
┌─────────────────────┐
│   Derived Key       │ ← 256-bit key
└──────────┬──────────┘
           │ AES-256-GCM
           ▼
┌─────────────────────┐
│   Encrypted SQLite  │ ← Nonce + Tag per record
│   Database          │
└─────────────────────┘

Key Features:
- Argon2id: chống brute-force, memory-hard
- AES-256-GCM: authenticated encryption
- Mỗi record có nonce riêng
- Key không bao giờ được lưu, chỉ derive từ password
```

---

## 8. Components & Data Flow Map

```
Rust Crate              Tauri Command          React Component
─────────────────────────────────────────────────────────────────
memory-core             ─                     FolderPicker
(scanner)                                       ScanProgress

memory-indexer          start_scan()            ScanButton
(pipeline)              stop_scan()             PauseButton
                        delete_index()          DeleteButton

memory-search           search(query)           SearchBar
(bm25, vector,          get_preview(id)         SearchResults
 reranker)              get_suggestions()       SearchFilters

memory-ai               chat(message)           ChatPanel
(ollama, nlp,           get_chat_history()      ChatMessage
 embedder, chat)        clear_history()         ChatInput

memory-graph            get_timeline()          TimelineView
(graph, timeline,       get_graph()              GraphView
 relation)              get_node_details()      GraphNode

memory-security         encrypt_db()            Settings
(encrypt)               decrypt_db()            SecurityPanel

memory-indexer          get_stats()             StatsOverview
(db)                                            FileTypeChart
```

---

## 9. Key Design Decisions

| Decision | Lý do |
|---|---|
| **Rust over Python** | Hiệu năng, memory safety, build standalone |
| **Tauri over Electron** | Nhẹ (RAM), nhanh, Rust backend |
| **Cargo Workspace** | Modular, tái sử dụng, dễ test |
| **SQLite over PostgreSQL** | Local first, zero config, embedded |
| **FTS5 over Tantivy** | Zero dependency, đủ nhanh cho MVP |
| **Ollama over llama.cpp** | Dễ setup, REST API, nhiều model |
| **Local first** | Privacy, offline, trust |
| **Permission-based scanning** | Trust, legal compliance |
| **Incremental index** | Performance, không re-index mỗi lần |
| **AES-256-GCM** | Industry standard, authenticated encryption |
| **Graph tự xây trên SQLite** | Không cần Neo4j cho MVP |
| **Desktop là Core** | Dữ liệu giá trị nằm trên Desktop |

---

## 10. Performance Targets

| Metric | Target |
|---|---|
| Scan 10,000 files | < 5 phút |
| Full-text search | < 100ms |
| Semantic search | < 500ms |
| AI Chat response | < 3s (local LLM) |
| Timeline load (10K files) | < 200ms |
| Graph load (10K nodes) | < 1s |
| RAM idle | < 200MB |
| RAM indexing | < 500MB |

---

## 11. Portability

```
Platform    | Phase 1 | Year 1 | Year 2-3 | Year 5
────────────┼─────────┼────────┼──────────┼───────
Windows     │   ✅    │   ✅   │    ✅    │   ✅
macOS       │   🔄    │   ✅   │    ✅    │   ✅
Linux       │   🔄    │   ✅   │    ✅    │   ✅
Mobile      │   ❌    │   ❌   │    ✅    │   ✅
Web         │   ❌    │   ❌   │    ❌    │   ✅

✅ = Primary  🔄 = Secondary  ❌ = Not yet
```
