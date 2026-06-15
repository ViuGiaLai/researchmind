# ResearchMind VN — 📋 Trạng Thái Dự Án

> **Cập nhật:** 15/06/2026
> **Mục tiêu:** Trợ lý nghiên cứu AI cho học giả Việt Nam — Local-first, 8 tuần MVP

---

## 📊 Tổng Quan

| Hạng mục | Trạng thái | Tiến độ |
|---|---|---|
| 📐 Plan & Spec | ✅ Viết lại theo hướng ResearchMind VN | 5/5 files |
| 🐍 Python Backend | 🔴 Chưa bắt đầu | 0% |
| 🖥️ React + Tauri Frontend | 🔴 Chưa bắt đầu | 0% |
| 📄 PDF Ingestion Pipeline | 🔴 Chưa bắt đầu | 0% |
| 🔍 Search Engine (Hybrid) | 🔴 Chưa bắt đầu | 0% |
| 💬 AI Chat (RAG) | 🔴 Chưa bắt đầu | 0% |
| 📚 Library Management | 🔴 Chưa bắt đầu | 0% |

---

## ✅ Phần 1: NHỮNG GÌ ĐÃ LÀM (Done)

### 1.1 Plan Files (5/5 — Đã viết lại theo ResearchMind VN)

| File | Mô tả | Trạng thái |
|---|---|---|
| `plan/ResearchMind_VN_Plan.md` | Product Plan đầy đủ 2025-2027 | ✅ Gốc |
| `plan/architecture.md` | Kiến trúc hệ thống (Python + Tauri + ChromaDB) | ✅ Viết lại |
| `plan/phase1-mvp-spec.md` | MVP Spec 4 tính năng cốt lõi (8 tuần) | ✅ Viết lại |
| `plan/roadmap.md` | Roadmap 12 tháng + pricing tiers | ✅ Viết lại |
| `have_done_plan/next-steps.md` | Bước tiếp theo chi tiết | ✅ Viết lại |
| `have_done_plan/tracking.md` | File này — trạng thái dự án | ✅ Viết lại |

### 1.2 Mã Nguồn Cũ (MemoryOS — sẽ không dùng lại)

> **Lưu ý:** Mã Rust crates cũ (memory-core, memory-indexer, memory-search, memory-ai, memory-graph, memory-security) và các Dependencies trong `Cargo.toml` sẽ **không được dùng lại**. Dự án mới dùng Python backend.

| Thành phần cũ | Kế thừa? | Lý do |
|---|---|---|
| Rust crates (6 crates) | ❌ Không | Chuyển sang Python |
| Tauri shell | ✅ Giữ | Vẫn dùng Tauri làm desktop shell |
| React UI components | 🟡 Một số | Cần sửa lại cho research domain |
| SQLite schema | 🟡 Tham khảo | Schema đơn giản hơn cho research |
| OCR pipeline | ❌ Không | Phase 2 — chưa cần |
| Encryption | ❌ Không | Chưa cần cho MVP research |

---

## 🔴 Phần 2: NHỮNG GÌ CẦN LÀM (To Do)

### 2.1 Tuần 1-2: Research (Không code)

| Task | Chi tiết | Deadline |
|---|---|---|
| Phỏng vấn 20 NCS/cao học | Facebook groups, inbox trực tiếp | Hết tuần 1 |
| Build CLI prototype Python | Import PDF → search đơn giản | Hết tuần 2 |
| Cho 3 người dùng thử CLI | Ghi lại feedback | Hết tuần 2 |

### 2.2 Tuần 3-4: Backend Core

| Task | File | Ưu tiên |
|---|---|---|
| Setup FastAPI + SQLite | `backend/main.py`, `backend/db/` | ⭐⭐⭐ |
| PDF Parser | `backend/ingestion/parser.py` | ⭐⭐⭐ |
| Chunker | `backend/ingestion/chunker.py` | ⭐⭐⭐ |
| Embedder (bge-m3) | `backend/ingestion/embedder.py` | ⭐⭐⭐ |
| BM25 Search | `backend/search/bm25.py` | ⭐⭐⭐ |
| Vector Search | `backend/search/vector.py` | ⭐⭐⭐ |
| Hybrid Search | `backend/search/hybrid.py` | ⭐⭐⭐ |
| Library CRUD | `backend/library/crud.py` | ⭐⭐⭐ |
| API Endpoints | `backend/main.py` | ⭐⭐⭐ |

### 2.3 Tuần 5-6: Frontend + Tauri

| Task | File | Ưu tiên |
|---|---|---|
| Setup React + shadcn/ui | `src/` | ⭐⭐⭐ |
| Tauri shell (Rust) | `src-tauri/` | ⭐⭐⭐ |
| Library UI | `src/components/library/` | ⭐⭐⭐ |
| Search UI | `src/components/search/` | ⭐⭐⭐ |
| Settings UI | `src/components/settings/` | ⭐⭐ |
| API client | `src/lib/api.ts` | ⭐⭐⭐ |

### 2.4 Tuần 7-8: AI Chat + Hoàn Thiện

| Task | File | Ưu tiên |
|---|---|---|
| RAG Retriever | `backend/chat/retriever.py` | ⭐⭐⭐ |
| RAG Generator (Ollama) | `backend/chat/generator.py` | ⭐⭐⭐ |
| Chat UI | `src/components/chat/` | ⭐⭐⭐ |
| Citation verification | `backend/chat/generator.py` | ⭐⭐⭐ |
| Bug fixes + Polish | App | ⭐⭐⭐ |
| User testing | 10 users | ⭐⭐⭐ |

---

## 🟡 Phần 3: LƯU Ý KỸ THUẬT

### 3.1 Python Backend

| Vấn đề | Giải pháp |
|---|---|
| bge-m3 model lớn (~2GB) | Download lần đầu, cache local |
| ChromaDB persist path | `data/chroma/` — gitignored |
| Ollama cần chạy riêng | Hướng dẫn user cài, auto-detect |
| Cross-encoder model | `cross-encoder/ms-marco-MiniLM-L-6-v2` — nhẹ, nhanh |
| API key Claude | User tự nhập trong Settings |

### 3.2 Frontend

| Vấn đề | Giải pháp |
|---|---|
| PDF preview | `react-pdf` library |
| Streaming chat | Server-Sent Events (SSE) |
| Vietnamese tokenizer | SQLite FTS5 unicode61 — đủ cho MVP |
| Highlight search results | Mark matched text |

### 3.3 Tauri

| Vấn đề | Giải pháp |
|---|---|
| Tauri chỉ làm shell | Rust code tối thiểu, Python xử lý chính |
| File dialog | `tauri-plugin-dialog` |
| Backend lifecycle | Tauri start/stop Python process |

---

## 📈 BIỂU ĐỒ TIẾN ĐỘ

``` 
Plan & Spec     ████████████████████████████████  100%  (6/6 files)
Research        ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░    0%  (chưa phỏng vấn)
Python Backend  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░    0%  (chưa bắt đầu)
React Frontend  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░    0%  (chưa bắt đầu)
AI Chat (RAG)   ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░    0%  (chưa bắt đầu)
Testing         ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░    0%  (chưa bắt đầu)

TỔNG THỂ: ████████░░░░░░░░░░░░░░░░░░░░░░░░░░  15%
```

---

## 📝 GHI CHÚ QUAN TRỌNG

### Đã hoàn thành (sau khi chuyển hướng):
- ✅ Viết lại toàn bộ 5 file plan theo ResearchMind VN
- ✅ Xác định rõ 4 tính năng MVP
- ✅ Tech stack chuyển từ Rust → Python + FastAPI
- ✅ Roadmap 8 tuần → 12 tháng chi tiết
- ✅ Pricing model (Free → Pro → Lab → Enterprise)

### Cần làm ngay (đầu tiên):
1. 🔴 **Phỏng vấn 5 NCS/cao học** — KHÔNG CODE
2. 🔴 **Build CLI prototype Python** — import PDF + search
3. 🔴 **Cài môi trường:** Python venv, Ollama, Node.js
4. 🟡 **Setup FastAPI backend** — health check + SQLite
5. 🟡 **PDF parsing** — PyMuPDF extract text

### Lưu ý:
- ⚠️ Dùng **PowerShell** (không WSL) trên Windows
- ⚠️ Code Rust cũ (memory-core, etc.) **không dùng lại** — chuyển hết sang Python
- ⚠️ Ollama cần chạy riêng: `ollama serve`
- ⚠️ bge-m3 cần Python 3.11+, RAM 8GB+

### Các lệnh thường dùng:

```powershell
# Backend
cd D:\all_my_project\memoryOS
.venv\Scripts\activate
cd backend
uvicorn main:app --reload --port 8765

# Frontend
cd apps\desktop
pnpm tauri dev

# Python tests
cd backend
pytest -v

# Ollama
ollama serve
ollama pull llama3.1:8b
```
