# ResearchMind VN — Phase 1 MVP Specification

> **Mục tiêu:** *"Tìm lại paper đã đọc theo nội dung — trong dưới 1 giây, bằng tiếng Việt, hoàn toàn offline."*
> **Thời gian:** 8 tuần
> **Nền tảng:** Windows Desktop (Tauri + Python FastAPI + React)

---

## 1. Tổng Quan MVP — 4 Tính Năng Cốt Lõi

```
ResearchMind VN v0.1
│
├── 1️⃣ Import & Index PDF
│   ├── Kéo thả / chọn folder PDF
│   ├── Extract text (PyMuPDF)
│   ├── Chunk + Embed (bge-m3)
│   └── Lưu vào ChromaDB + SQLite FTS5
│
├── 2️⃣ Semantic Search
│   ├── Gõ câu hỏi tự nhiên bằng tiếng Việt
│   ├── Hybrid search (BM25 + Vector)
│   ├── Re-rank (cross-encoder)
│   └── Kết quả: đoạn văn + tên paper + trang
│
├── 3️⃣ Chat với Paper
│   ├── Chọn 1-5 paper để hỏi
│   ├── RAG pipeline: retrieve → generate
│   ├── Local LLM (Ollama / Llama 3.1 8B)
│   └── Cloud option (Claude Sonnet)
│
└── 4️⃣ Library quản lý
    ├── Danh sách paper đã import
    ├── Tag, ghi chú, đánh dấu đã đọc
    └── Sắp xếp theo ngày / tên / tác giả
```

### Tính năng KHÔNG làm trong MVP

| Tính năng | Lý do hoãn |
|---|---|
| Sync cloud / multi-device | Chưa cần — validate core trước |
| Mobile app | Desktop trước — nghiên cứu sinh làm việc trên laptop |
| Zotero / Mendeley import | Thêm sau khi có 20 user active |
| Collaboration / chia sẻ | Tính năng Lab (B2B) — Phase 2 |
| Knowledge Graph / Timeline | Không phải core value prop cho research |
| OCR / Image PDF processing | Phase 2 — dùng PaddleOCR sau |
| Word / Excel support | Phase 2 — PDF là ưu tiên số 1 |

---

## 2. User Flow Chi Tiết

### 2.1 Lần đầu mở app

```
Mở ResearchMind VN lần đầu
       │
       ▼
┌─────────────────────────────────────┐
│  Chào mừng bạn đến với              │
│  ResearchMind VN 🎓                 │
│                                     │
│  Trợ lý nghiên cứu AI —            │
│  chạy hoàn toàn trên máy bạn.       │
│                                     │
│  📁 Chọn thư mục chứa PDF           │
│  [Browse...]                        │
│                                     │
│  Hoặc kéo thả PDF vào đây           │
└─────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────┐
│  Đang index...                      │
│                                     │
│  📄 paper1.pdf      ✅ Done        │
│  📄 paper2.pdf      🔄 Indexing... │
│  📄 paper3.pdf      ⏳ Pending     │
│  📄 paper4.pdf      ⏳ Pending     │
│                                     │
│  Tiến độ: ████████░░ 80%           │
│  (12/15 paper — 3 file lỗi)        │
│                                     │
│  [⏸ Pause]  [✕ Stop]              │
└─────────────────────────────────────┘
       │
       ▼
Vào Library — danh sách paper đã index
```

### 2.2 Search flow

```
User ở màn hình Search
       │
       ▼
┌──────────────────────────────────────┐
│  🔍 "phương pháp đánh giá độ trễ     │
│     mạng 5G"                    [🔍] │
│                                      │
│  🎯 5 kết quả (0.35s)               │
│                                      │
│  ┌──────────────────────────────────┐│
│  │ 📄 5G-Network-Slicing-2024.pdf   ││
│  │ ⭐ 94% · Trang 5 · Tác giả:     ││
│  │ Nguyễn Văn A (2024)              ││
│  │ "5G network slicing enables      ││
│  │  virtual dedicated networks...   ││
│  │  độ trễ (latency) được đánh      ││
│  │  giá thông qua..."               ││
│  │ 🏷️ 5G · network · QoS           ││
│  └──────────────────────────────────┘│
│  ┌──────────────────────────────────┐│
│  │ 📄 LTE-Advanced-Protocols.pdf    ││
│  │ ⭐ 87% · Trang 12 · ...          ││
│  └──────────────────────────────────┘│
│  ┌──────────────────────────────────┐│
│  │ 📄 ...                           ││
│  └──────────────────────────────────┘│
│                                      │
│  [💬 Chat với 3 kết quả này]        │
└──────────────────────────────────────┘
```

### 2.3 Chat flow

```
User ở màn hình Chat
       │
       ▼
┌──────────────────────────────────────┐
│  💬 Chat với Paper                   │
├──────────────────────────────────────┤
│                                      │
│  👤 Bạn:                             │
│  So sánh phương pháp đánh giá độ     │
│  trễ trong 3 paper này              │
│                                      │
│  ┌──────────────────────────────────┐│
│  │ 🤖 ResearchMind:                 ││
│  │ Dựa trên 3 paper bạn chọn:       ││
│  │                                  ││
│  │ 1. **5G-Network-Slicing-2024**   ││
│  │    (Trang 5-8): Tác giả sử dụng  ││
│  │    phương pháp mô phỏng Monte    ││
│  │    Carlo để đánh giá độ trễ...   ││
│  │                                  ││
│  │ 2. **LTE-Advanced-Protocols**    ││
│  │    (Trang 12-15): Dùng mô hình   ││
│  │    Markov chain để phân tích...  ││
│  │                                  ││
│  │ 3. **6G-Network-Survey-2025**    ││
│  │    (Trang 22): So sánh 3 phương  ││
│  │    pháp và đề xuất hybrid...     ││
│  │                                  ││
│  │ 📚 Nguồn: 3 paper · 5 chunks     ││
│  │ 🤖 Model: Ollama (Llama 3.1 8B)  ││
│  └──────────────────────────────────┘│
│                                      │
│  ┌──────────────────────────────────┐│
│  │ Bạn có thể hỏi thêm...     [📎]  ││
│  └──────────────────────────────────┘│
└──────────────────────────────────────┘
```

### 2.4 Library flow

```
┌─────────────────────────────────────────────┐
│ 📚 Library                           [+ 📥] │
├─────────────────────────────────────────────┤
│  🔍 Lọc: [Tất cả] [Đã đọc] [Yêu thích]     │
│  Sắp xếp: [Ngày thêm ▼]                     │
│                                              │
│  📄 5G-Network-Slicing-2024.pdf              │
│     Nguyễn Văn A · 2024 · ✅ Đã đọc    ⭐   │
│     🏷️ 5G · network slicing · QoS          │
│     📝 "Bài này quan trọng cho chapter 3..." │
│     🔍 45 chunks · 💬 [Chat] [Xóa]         │
│                                              │
│  📄 LTE-Advanced-Protocols.pdf               │
│     Trần Thị B · 2023 · 📖 Đang đọc         │
│     🏷️ LTE · protocol · latency             │
│     🔍 32 chunks · 💬 [Chat] [Xóa]         │
│                                              │
│  📄 ...                                      │
│                                              │
│  📊 Tổng: 15 paper · 512 chunks · 245 MB    │
└─────────────────────────────────────────────┘
```

---

## 3. Backend API Design (FastAPI)

### 3.1 Paper Management

```python
@router.post("/papers/import")
async def import_paper(
    file: UploadFile = File(...),
    background_tasks: BackgroundTasks
) -> PaperImportResponse:
    """Import 1 PDF → extract → chunk → embed → store"""
    pass

@router.post("/papers/import/folder")
async def import_folder(
    folder_path: str = Body(...),
    background_tasks: BackgroundTasks
) -> FolderImportResponse:
    """Import tất cả PDF từ folder"""
    pass

@router.get("/papers")
async def list_papers(
    page: int = Query(1),
    limit: int = Query(20),
    status: str = Query(None),
    sort_by: str = Query("created_at"),
    order: str = Query("desc"),
) -> ListPapersResponse:
    """Danh sách papers với filter + sort + paginate"""
    pass

@router.get("/papers/{paper_id}")
async def get_paper(paper_id: str) -> PaperDetail:
    """Chi tiết 1 paper"""
    pass

@router.patch("/papers/{paper_id}")
async def update_paper(
    paper_id: str,
    update: PaperUpdate
) -> PaperDetail:
    """Cập nhật tags, notes, read_status, starred"""
    pass

@router.delete("/papers/{paper_id}")
async def delete_paper(
    paper_id: str
) -> DeleteResponse:
    """Xóa paper + chunks + embeddings"""
    pass
```

### 3.2 Search

```python
@router.post("/search")
async def search(
    query: SearchQuery
) -> SearchResponse:
    """
    Hybrid search (BM25 + Vector)
    - query.text: câu hỏi tự nhiên
    - query.filters: { paper_ids, date_range, tags }
    - query.top_k: mặc định 10
    """
    pass

@router.get("/search/suggest")
async def suggest(
    q: str = Query(...),
    limit: int = Query(5)
) -> List[str]:
    """Search suggestions"""
    pass
```

### 3.3 Chat

```python
@router.post("/chat")
async def chat(
    request: ChatRequest
) -> ChatResponse:
    """
    RAG Chat với selected papers
    - request.message: câu hỏi
    - request.paper_ids: [id1, id2, id3]
    - request.model: "local" | "claude"
    """
    pass

@router.post("/chat/stream")
async def chat_stream(
    request: ChatRequest
) -> StreamingResponse:
    """Streaming version của chat"""
    pass

@router.get("/chat/history")
async def get_chat_history(
    session_id: str = Query(None),
    limit: int = Query(50)
) -> List[ChatMessage]:
    """Lịch sử chat"""
    pass

@router.delete("/chat/history")
async def clear_chat_history() -> DeleteResponse:
    """Xóa lịch sử chat"""
    pass
```

### 3.4 System

```python
@router.get("/health")
async def health() -> HealthResponse:
    """Check: Ollama running? ChromaDB connected? SQLite OK?"""
    pass

@router.get("/stats")
async def get_stats() -> StatsResponse:
    """Thống kê: paper count, chunks, storage, model info"""
    pass

@router.get("/settings")
async def get_settings() -> SettingsResponse:
    """Get app settings"""
    pass

@router.put("/settings")
async def update_settings(settings: SettingsUpdate) -> SettingsResponse:
    """Update settings"""
    pass

@router.post("/ollama/pull")
async def pull_ollama_model(
    model_name: str = Body("llama3.1:8b")
) -> PullResponse:
    """Pull Ollama model (stream progress)"""
    pass
```

---

## 4. Database Schema

Xem chi tiết tại `plan/architecture.md` — Section 5.

**Tóm tắt:**

| Bảng | Mục đích | Công nghệ |
|---|---|---|
| `papers` | Paper metadata + tags + notes | SQLite |
| `chunks` | Text chunks with page numbers | SQLite |
| `chunks_fts` | Full-text search index | SQLite FTS5 |
| `chat_history` | Chat history with citations | SQLite |
| `settings` | App configuration | SQLite |
| `paper_chunks` (collection) | Embedding vectors | ChromaDB |

---

## 5. Python Backend Structure

### 5.1 File Tree

```
backend/
├── main.py                        # FastAPI app entry
├── requirements.txt               # Python dependencies
│
├── config/
│   └── settings.py                # Pydantic Settings
│       ├── OLLAMA_URL
│       ├── CHROMA_PERSIST_DIR
│       ├── SQLITE_PATH
│       ├── CHUNK_SIZE=512
│       └── CHUNK_OVERLAP=50
│
├── db/
│   ├── database.py                # SQLAlchemy engine + session
│   ├── models.py                  # SQLAlchemy models
│   └── migrations.py              # Auto-create tables
│
├── ingestion/
│   ├── parser.py                  # PyMuPDF text extraction
│   ├── chunker.py                 # Text chunking
│   └── embedder.py                # bge-m3 embedding
│
├── search/
│   ├── bm25.py                    # SQLite FTS5 query
│   ├── vector.py                  # ChromaDB query
│   └── hybrid.py                  # RRF fusion + cross-encoder
│
├── chat/
│   ├── retriever.py               # RAG retrieval pipeline
│   └── generator.py               # Ollama / Claude generation
│
├── library/
│   └── crud.py                    # Paper CRUD operations
│
└── schemas/
    ├── paper.py                   # Pydantic schemas for papers
    ├── search.py                  # Pydantic schemas for search
    └── chat.py                    # Pydantic schemas for chat
```

### 5.2 requirements.txt

```
# Web Framework
fastapi==0.115.*
uvicorn[standard]==0.32.*
python-multipart==0.0.*

# Database
sqlalchemy==2.0.*
aiosqlite==0.20.*

# PDF Processing
PyMuPDF==1.25.*
langchain-text-splitters==0.3.*

# AI / Embedding
sentence-transformers==3.3.*      # For bge-m3
chromadb==0.6.*                    # Vector store

# LLM
httpx==0.28.*                      # Ollama API client
anthropic==0.49.*                  # Claude API (optional)

# Utils
pydantic==2.*
pydantic-settings==2.*
python-dotenv==1.*
loguru==0.7.*
```

---

## 6. Cách Xây Dựng Theo Tuần

### Tuần 1-2: Research + Validate

| Ngày | Việc cần làm | Chi tiết |
|---|---|---|
| Tuần 1 | Phỏng vấn 20 NCS/cao học | Không code. Ghi lại đúng ngôn ngữ họ dùng |
| Tuần 2 | Build prototype CLI Python | Import PDF → search đơn giản → cho 3 người dùng thử |

### Tuần 3-4: Backend Core

| Task | File | Chi tiết |
|---|---|---|
| Setup FastAPI + SQLite | `backend/main.py`, `backend/db/` | Health check, auto-create tables |
| PDF Parser | `ingestion/parser.py` | PyMuPDF extract text + metadata |
| Chunker | `ingestion/chunker.py` | 512 tokens, overlap 50, page-aware |
| Embedder | `ingestion/embedder.py` | bge-m3 model load + inference |
| BM25 Search | `search/bm25.py` | SQLite FTS5 query, BM25 scoring |
| Vector Search | `search/vector.py` | ChromaDB query, cosine similarity |
| Hybrid Search | `search/hybrid.py` | RRF fusion + cross-encoder re-rank |
| Library CRUD | `library/crud.py` | Paper list, update, delete |
| API endpoints | `backend/main.py` | Import, search, library APIs |

### Tuần 5-6: Frontend + Tauri

| Task | File | Chi tiết |
|---|---|---|
| Setup React + shadcn/ui | `src/` | Tauri dev server |
| Tauri shell | `src-tauri/` | Minimal: open backend, file dialog |
| Library UI | `src/components/library/` | Paper list, filter, sort |
| Search UI | `src/components/search/` | SearchBar, SearchResults, highlight |
| Settings UI | `src/components/settings/` | Model config, folder picker |
| API client | `src/lib/api.ts` | FastAPI client (fetch/axios) |

### Tuần 7-8: AI Chat + Hoàn Thiện

| Task | File | Chi tiết |
|---|---|---|
| RAG Retriever | `chat/retriever.py` | Query → retrieval → context building |
| RAG Generator | `chat/generator.py` | Ollama / Claude API integration |
| Chat UI | `src/components/chat/` | ChatPanel, ChatMessage, ChatInput |
| Citation verification | `chat/generator.py` | Check mọi claim có source |
| Ollama integration test | Backend | Test với Ollama thật |
| Bug fixes + Polish | App | UX improvements, error handling |
| Testing | App | Test full flow: import → search → chat |

---

## 7. Testing Strategy

### Unit Tests (Python)

| Module | Test | Tool |
|---|---|---|
| `parser.py` | Extract text from PDF | pytest + sample PDFs |
| `chunker.py` | Chunk size, overlap, page tracking | pytest |
| `embedder.py` | Embedding dimension (1024) | pytest |
| `bm25.py` | Search accuracy | pytest |
| `hybrid.py` | RRF fusion correctness | pytest |

### Integration Tests

| Flow | Test |
|---|---|
| Import → Search | Import PDF → search bằng câu hỏi → verify kết quả |
| Import → Chat | Import 3 PDF → chat → verify citations |
| Library CRUD | Import → update → delete → verify |

### Manual Tests (với user thật)

| Test | Mục tiêu |
|---|---|
| 3 người dùng thử CLI prototype | Validate core value proposition |
| 10 user test MVP UI | Feedback hàng tuần, ghi lại vấn đề |

---

## 8. Error States & UX

| State | UI Message | Hành động |
|---|---|---|
| PDF đang import | 📄 Đang index... (progress bar) | Spinner + estimated time |
| PDF import thành công | ✅ Đã index | Chuyển sang Library |
| PDF lỗi (corrupted) | ⚠️ Không thể đọc file này | Skip, log chi tiết |
| Ollama không chạy | ⚠️ Ollama chưa được cài đặt | Hướng dẫn cài + nút retry |
| Search không có kết quả | 😕 Không tìm thấy kết quả. Thử từ khóa khác? | Suggest keywords |
| Chat lỗi | ⚠️ Lỗi kết nối Ollama. Kiểm tra Ollama có đang chạy? | Retry + hướng dẫn |
| API key Claude không hợp lệ | ⚠️ API key không đúng. Vào Settings để cập nhật. | Redirect to Settings |
| ChromaDB lỗi | ⚠️ Lỗi vector database | Rebuild + thông báo |

---

## 9. Performance Targets

| Metric | Target | Ghi chú |
|---|---|---|
| Import + Index 1 PDF (50 trang) | < 30 giây | Phụ thuộc CPU |
| Hybrid Search | < 500ms | 1000 papers |
| Chat response (Ollama) | < 5s | Llama 3.1 8B |
| Chat response (Claude) | < 3s | Phụ thuộc internet |
| Library load | < 200ms | 1000 papers |
| RAM idle | < 200MB | |
| RAM indexing | < 500MB | |
| Disk / 100 PDFs | ~200MB | + embeddings |

---

## 10. Deployment Package

```
ResearchMind VN Installer:
├── researchmind.exe          # Tauri desktop app
├── backend/                  # Python backend (embedded)
│   ├── main.exe (PyInstaller)
│   └── chroma/              # ChromaDB persistence
├── data/                     # User data folder
└── models/                   # bge-m3 model (downloaded on first run)
```

**Lưu ý:** Bản MVP đầu tiên có thể yêu cầu user:
1. Cài Python 3.11+
2. Cài Ollama (`winget install Ollama` hoặc ollama.com)
3. Pull model: `ollama pull llama3.1:8b`
4. Run app

**Mục tiêu Year 1:** PyInstaller bundle → single .exe installer (không cần cài gì thêm).
