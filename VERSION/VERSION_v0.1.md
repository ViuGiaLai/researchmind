# ResearchMind VN — v0.1 (18/06/2026)

> **Cập nhật đối chiếu code — 19/06/2026:** File này là changelog/lịch sử v0.1. Một số mô tả bên dưới đã lỗi thời so với code hiện tại. Trạng thái đúng hiện nay:
>
> - Frontend đang dùng **React 18.3.1**, không phải React 19.
> - `backend/main.py` đã được rút gọn thành app bootstrap + router registry; endpoint đã tách sang `backend/routers/*`.
> - Chat streaming và Verify streaming đã được code qua `api.chatStream()` / `api.verifyStream()` và `StreamingResponse`.
> - Retry provider đã có trong `chat/generator.py` qua `_call_with_retry()`.
> - Cache đã có: `LLMCache`, `EmbeddingCache`, LRU cache cho query embedding, cache academic external API.
> - Cross-encoder reranker hiện **tắt mặc định** qua `settings.enable_reranker = False`, không phải luôn chạy.
> - Wow Analysis **không có endpoint** `POST /api/insights/wow`; frontend `WowAnalysisView` tự điều phối các endpoint `review`, `critique`, `conflict`, `gap`, `debate`.
> - Không có `GET/POST /api/setup/*`; first-run setup đi qua `GET/PUT /api/settings`, `/api/detect-specs`, `/api/data/*`, `/api/ollama/*`.
> - OCR cơ bản bằng `rapidocr_onnxruntime` có trong parser PDF, nhưng chưa có hàng đợi OCR riêng hoặc UI retry OCR chuyên biệt.

> **Commit:** `32dd8ed` — `feat: multi-format import, NVIDIA fix, async non-blocking + UI improvements`
> **Plan cập nhật:** `0796276` — `docs: update plan with v0.1 status and changelog`
>
> **Tagline:** *"Trợ lý nhớ mọi paper bạn đã đọc — chạy hoàn toàn trên máy bạn, không gửi dữ liệu ra ngoài."*

---

## Mục lục

1. [Tổng quan dự án](#1-tổng-quan-dự-án)
2. [Cấu trúc thư mục](#2-cấu-trúc-thư-mục)
3. [Kiến trúc hệ thống](#3-kiến-trúc-hệ-thống)
4. [Tính năng đã hoàn thành](#4-tính-năng-đã-hoàn-thành)
5. [Chi tiết Backend](#5-chi-tiết-backend)
6. [Chi tiết Frontend](#6-chi-tiết-frontend)
7. [LLM Providers & Chain](#7-llm-providers--chain)
8. [Vấn đề cần giải quyết](#8-vấn-đề-cần-giải-quyết)
9. [Hướng dẫn chạy](#9-hướng-dẫn-chạy)
10. [Định hướng v0.2](#10-định-hướng-v02)

---

## 1. Tổng quan dự án

**ResearchMind VN** là trợ lý nghiên cứu AI dành cho học giả Việt Nam, với triết lý **Local-first** (chạy hoàn toàn trên máy người dùng, không gửi dữ liệu ra ngoài).

### Thông số kỹ thuật

| Thành phần | Công nghệ | Phiên bản |
|---|---|---|
| Desktop Shell | Tauri v2 | 2.x |
| Frontend | React + TypeScript | React 18.3.1 |
| Backend | Python + FastAPI | 3.12 |
| PDF Parser | PyMuPDF (fitz) + rapidocr_onnxruntime | 1.25.x / 1.4.x |
| Embedding Model | BAAI/bge-m3 (local, 1024 chiều) | sentence-transformers |
| Vector DB | ChromaDB (local) | 0.6.x |
| Full-text Search | SQLite FTS5 | Built-in |
| Re-ranker | cross-encoder/ms-marco-MiniLM-L-6-v2 | sentence-transformers |
| Local LLM | Ollama + qwen2.5:7b | Ollama |
| Cloud LLMs | NVIDIA, FreeModel.dev, Groq, Gemini, DeepSeek, Claude | API |
| Metadata DB | SQLite + SQLAlchemy | 2.0.x |

### LLM Chain (cloud_free mode)

```
NVIDIA NIM (moonshotai/kimi-k2.6) → FreeModel.dev (gpt-4o-mini)
  → Groq (llama-3.1-8b-instant) → Gemini (gemini-1.5-flash)
  → Ollama (qwen2.5:7b - local fallback cuối cùng)
```

Mỗi provider thử lần lượt, nếu lỗi (finish_reason="error") thì chuyển sang provider tiếp theo.

---

## 2. Cấu trúc thư mục

```
memoryOS/
├── apps/
│   └── desktop/                        # Tauri + React frontend
│       ├── src-tauri/                  # Rust shell (Tauri v2)
│       │   ├── src/lib.rs              # Spawn Python backend, window config
│       │   ├── Cargo.toml
│       │   └── tauri.conf.json
│       └── src/                        # React + TypeScript
│           ├── App.tsx                 # Root: tab routing, setup wizard
│           ├── main.tsx                # Entry point (StrictMode)
│           ├── lib/
│           │   ├── api.ts              # HTTP client → FastAPI
│           │   └── debateParser.ts     # Parse debate format
│           ├── components/
│           │   ├── chat/
│           │   │   ├── ChatView.tsx    # RAG chat + Markdown + citations + debate
│           │   │   ├── ChatInput.tsx   # Input box
│           │   │   ├── ChatMessage.tsx # Message bubble
│           │   │   ├── ChatPanel.tsx   # Panel wrapper
│           │   │   └── MarkdownRenderer.tsx  # Markdown → React (bold, code, table, ...)
│           │   ├── library/
│           │   │   └── LibraryView.tsx # Paper list, preview, splitter, narrow mode
│           │   ├── search/
│           │   │   ├── SearchView.tsx
│           │   │   └── SearchFilters.tsx
│           │   ├── import/
│           │   │   └── ImportPanel.tsx # PDF/BibTeX/Zotero import UI
│           │   ├── settings/
│           │   │   ├── SettingsView.tsx
│           │   │   └── SettingsPanel.tsx
│           │   ├── insights/
│           │   │   └── WowAnalysisView.tsx  # Multi-step paper analysis
│           │   ├── personal/
│           │   │   └── DailyReaderView.tsx  # Daily paper suggestions
│           │   ├── setup/
│           │   │   └── AISetupWizard.tsx    # First-run onboarding
│           │   ├── shared/
│           │   │   ├── Toast.tsx
│           │   │   └── Icons.tsx
│           │   └── timeline/
│           │       └── TimelineView.tsx
│           ├── hooks/
│           │   ├── useChat.ts
│           │   ├── useFolders.ts
│           │   ├── useOllamaConfig.ts
│           │   ├── useScan.ts
│           │   ├── useSearchFilters.ts
│           │   └── useTimeline.ts
│           └── styles/
│               ├── globals.css         # Global styles (5460+ lines)
│               ├── variables.css
│               ├── debate.css
│               ├── daily-reader.css
│               └── cite-panel.css
│
├── backend/                            # Python FastAPI
│   ├── main.py                         # FastAPI app bootstrap + router registry
│   ├── config/
│   │   └── settings.py                 # Pydantic Settings (.env + persisted)
│   ├── db/
│   │   ├── database.py                 # SQLAlchemy engine + session
│   │   └── models.py                   # Paper, Chunk, ChatHistory, Setting tables
│   ├── ingestion/
│   │   ├── parser.py                   # extract_document() cho PDF/DOCX/TXT/MD/HTML/EPUB
│   │   ├── chunker.py                  # Text chunking 512 tokens
│   │   └── embedder.py                 # bge-m3 embedding model + embedding cache
│   ├── search/
│   │   ├── bm25.py                     # SQLite FTS5 search
│   │   ├── vector.py                   # ChromaDB vector search
│   │   └── hybrid.py                   # RRF fusion + Cross-encoder reranker
│   ├── chat/
│   │   ├── generator.py                # LLM: NVIDIA, FreeModel, Groq, Gemini, Ollama...
│   │   └── retriever.py                # RAG context builder
│   ├── export.py                       # Export DOCX/HTML/Markdown
│   ├── zotero_import.py                # Zotero CSV + BibTeX import
│   └── zotero_utils.py                 # Zotero path utilities
│
├── plan/                               # Kế hoạch dự án
│   ├── ResearchMind_VN_Plan.md         # Product plan đầy đủ
│   ├── roadmap.md                      # Roadmap
│   ├── architecture.md                 # Kiến trúc hệ thống
│   ├── phase1-mvp-spec.md              # MVP spec
│   ├── HYBRID_MODEL.md                 # Hybrid search spec
│   └── ux_flow_onboarding.md           # UX flow
│
├── have_done_plan/                     # Theo dõi tiến độ
│   ├── tracking.md                     # Trạng thái tổng quan
│   ├── next-steps.md                   # Hướng dẫn setup
│   └── VERSION_v0.1.md                 # File này
│
├── scripts/                            # CI/CD scripts
├── docs/                               # Tài liệu
├── backend.spec                        # PyInstaller spec
├── Cargo.toml / Cargo.lock             # Rust workspace
└── .github/                            # GitHub Actions
```

---

## 3. Kiến trúc hệ thống

### Luồng Import tài liệu

```
User kéo thả file
  → Tauri Frontend (React)
    → POST /api/papers/import
      → extract_document(path)          # PyMuPDF / python-docx / lxml / ebooklib
      → chunk_text()                    # 512 tokens, overlap 50
      → embedder.embed()                # bge-m3 → vector 1024 chiều
      → ChromaDB.add_chunks()           # Lưu vector
      → BM25._rebuild_fts()             # Lưu full-text index
      → SQLite Paper row                # Metadata
```

### Luồng Chat với Paper

```
User gửi câu hỏi + chọn paper
  → POST /api/chat
    → retriever.retrieve(query, paper_ids, top_k=5)
      → BM25.search()                   # Full-text, top-20
      → Vector.search()                 # Embed query → cosine, top-20
      → RRF fuse                        # Kết hợp BM25 + Vector
      → Cross-encoder rerank            # ms-marco-MiniLM chấm điểm lại
      → Build context                   # Format chunks + metadata
    → generator.generate(query, context)
      → cloud_free chain:
          1. NVIDIA NIM (moonshotai/kimi-k2.6)     # ✅ Hoạt động (~5-12s)
          2. FreeModel.dev (gpt-4o-mini)            # ✅ Hoạt động (~5-11s)
          3. Groq (llama-3.1-8b-instant)            # ⚠️ 401 key
          4. Gemini (gemini-1.5-flash)              # ⚠️ Key sai format
          5. Ollama (qwen2.5:7b)                    # ✅ Local fallback
    → Save ChatHistory to SQLite
    → Return { answer, citations, model_used }
```

### Luồng streaming

Trạng thái hiện tại: Chat và Verify đã có streaming. Frontend gọi `api.chatStream()` khi `initialMode === "chat"` và gọi `api.verifyStream()` trong Verify Mode. Review/Critique/Debate vẫn dùng response non-stream.

---

## 4. Tính năng đã hoàn thành

### Backend

| # | Tính năng | Endpoint / Module | Chi tiết |
|---|---|---|---|
| 1 | **Import PDF** | `POST /api/papers/import` | PyMuPDF extract text + OCR fallback (rapidocr) |
| 2 | **Import DOCX** | `POST /api/papers/import` | python-docx, lấy title từ Heading đầu |
| 3 | **Import TXT** | `POST /api/papers/import` | UTF-8 decode, title = dòng đầu |
| 4 | **Import Markdown** | `POST /api/papers/import` | UTF-8, YAML frontmatter (title, authors) |
| 5 | **Import HTML** | `POST /api/papers/import` | lxml.html, xoá script/style |
| 6 | **Import EPUB** | `POST /api/papers/import` | ebooklib, DC metadata (title, creator) |
| 7 | **Import folder** | `POST /api/papers/import/folder` | Quét tất cả supported extensions |
| 8 | **Import BibTeX** | `POST /api/papers/import/bibtex` | Parse .bib → metadata |
| 9 | **Import Zotero CSV** | `POST /api/papers/import/zotero-csv` | CSV + tự động tìm PDF |
| 10 | **Import Zotero CSV + PDF** | `POST /api/papers/import/zotero-csv-pdf` | Tìm PDF từ Zotero storage |
| 11 | **Hybrid Search** | `POST /api/search` | BM25 + Vector + RRF + Cross-encoder |
| 12 | **Search suggestions** | `GET /api/search/suggest` | ILIKE trên title |
| 13 | **Chat với Paper** | `POST /api/chat` | RAG + Markdown response + citations |
| 14 | **Review tự động** | `POST /api/review` | Background, Methods, Findings, Gaps |
| 15 | **Phê bình** | `POST /api/critique` | Assumptions, weaknesses, reproducibility |
| 16 | **Tranh luận AI** | `POST /api/debate` | AI A vs AI B + kết luận + đề xuất |
| 17 | **Wow Analysis** | Frontend orchestration | `WowAnalysisView` chạy pipeline 5 bước bằng các endpoint sẵn có: review, critique, conflict, gap, debate |
| 18 | **Gap Analysis** | `POST /api/insights/gap` | Research gaps từ nhiều paper |
| 19 | **Conflict Detection** | `POST /api/insights/conflict` | Mâu thuẫn giữa các paper |
| 20 | **Topic Suggestion** | `POST /api/insights/topic` | Đề xuất chủ đề nghiên cứu |
| 21 | **Research Evolution** | `POST /api/insights/evolution` | Timeline tiến hóa nghiên cứu |
| 22 | **Highlights** | `GET /api/papers/{id}/highlights` | AI chọn đoạn quan trọng + phân loại |
| 23 | **Related Papers** | `GET /api/papers/{id}/related` | Dựa trên embedding similarity |
| 24 | **Daily Reader** | `GET /api/personal/daily-reader` | Gợi ý paper mỗi ngày |
| 25 | **Export Synthesis** | `POST /api/papers/export/synthesis` | Markdown → DOCX/HTML/Markdown |
| 26 | **Chat history** | `GET /api/chat/history` | Theo session |
| 27 | **Settings CRUD** | `GET/PUT /api/settings` | Persist settings to SQLite |
| 28 | **Stats** | `GET /api/stats` | Paper count, chunk count, model info |
| 29 | **Ollama management** | `GET/POST /api/ollama/*` | Pull model, health check, list models |
| 30 | **Setup wizard** | `GET/PUT /api/settings`, `/api/detect-specs`, `/api/data/*`, `/api/ollama/*` | First-run onboarding |

### Frontend

| # | Tính năng | Component | Chi tiết |
|---|---|---|---|
| 1 | **Tabs** | `App.tsx` | Wow, Library, Search, Chat, Insights, Brain, Daily, Settings |
| 2 | **Import Panel** | `ImportPanel.tsx` | 3 tabs: Tài liệu (PDF/DOCX/...), BibTeX, Zotero CSV |
| 3 | **Library** | `LibraryView.tsx` | Paper list, preview (info/AI/related/highlights/PDF), splitter, narrow mode |
| 4 | **Search** | `SearchView.tsx` | Semantic search + filters |
| 5 | **Chat** | `ChatView.tsx` | RAG chat, Markdown render, review/critique/debate modes, export |
| 6 | **MarkdownRenderer** | `MarkdownRenderer.tsx` | **bold**, *italic*, `code`, heading, table, list, citation |
| 7 | **Settings** | `SettingsView.tsx` | LLM mode selector, API keys (masked), model config |
| 8 | **Setup Wizard** | `AISetupWizard.tsx` | First-run: welcome → choose mode → configure → done |
| 9 | **Wow Analysis** | `WowAnalysisView.tsx` | Multi-step analysis with scroll + highlight |
| 10 | **Daily Reader** | `DailyReaderView.tsx` | Paper suggestions UI |
| 11 | **Narrow mode** | `LibraryView.tsx` | <480px responsive: icon buttons, dropdown, ⋮ menu |
| 12 | **PDF inline** | `LibraryView.tsx` | iframe xem PDF trực tiếp, không tải về |
| 13 | **Tab drag** | `LibraryView.tsx` | Kéo ngang preview tabs |
| 14 | **Splitter** | `LibraryView.tsx` | Kéo resize giữa list và preview panel |

---

## 5. Chi tiết Backend

### `main.py`

FastAPI app bootstrap với CORS, lifespan events, static mount và include router. Endpoint logic hiện nằm trong `backend/routers/*`, `export.py`, `zotero_import.py`.

**Key patterns:**
- `asyncio.to_thread()` cho blocking sync code (chat, search, review, critique, debate, highlights, import)
- `BackgroundTasks.add_task()` cho indexing sau import
- `env_only_keys` masking: API keys chỉ đọc từ .env, không lộ qua API
- Timing logs (`TIMING:`) cho debug performance

### `chat/generator.py` (832 dòng)

7 providers, mỗi provider có `_generate_<tên>()` và `_stream_<tên>()`:

| Provider | URL | Method | Key |
|---|---|---|---|
| DeepSeek | `https://api.deepseek.com/chat/completions` | `_generate_deepseek` | `deepseek_api_key` |
| Claude | `https://api.anthropic.com/v1/messages` | `_generate_claude` | `claude_api_key` |
| NVIDIA | `{nvidia_url}/chat/completions` | `_generate_nvidia` | `nvidia_api_key` |
| FreeModel | `{freemodel_url}/chat/completions` | `_generate_freemodel` | `freemodel_api_key` |
| Groq | `https://api.groq.com/openai/v1/chat/completions` | `_generate_groq` | `groq_api_key` |
| Gemini | `https://generativelanguage.googleapis.com/...` | `_generate_gemini` | `gemini_api_key` |
| Ollama | `{ollama_url}/api/chat` | `_generate_ollama` | (local, không cần key) |

**Finish reasons:**
- `"stop"` — thành công
- `"error"` — lỗi, chain chuyển provider tiếp theo
- `"no_key"` — chưa cấu hình key
- `"no_context"` — không có context để trả lời
- `"length"` — response bị cắt do max_tokens

### `ingestion/parser.py`

`extract_document(file_path)` → `ExtractedDocument | None`

- `.pdf`: PyMuPDF, garbled detection, OCR fallback (rapidocr)
- `.docx`/`.doc`: python-docx, style-based title detection
- `.txt`: UTF-8 decode
- `.md`: YAML frontmatter + strip markdown syntax
- `.html`/`.htm`: lxml.html, remove script/style
- `.epub`: ebooklib, DC metadata

### `search/hybrid.py`

```
search() → BM25 (top-10) + Vector (top-10) → RRF fuse → optional Cross-encoder rerank → top-k
```

Cross-encoder: `cross-encoder/ms-marco-MiniLM-L-6-v2`, lazy-loaded và chỉ chạy khi `settings.enable_reranker = true`.

### `config/settings.py`

Pydantic BaseSettings, load từ `.env` + persisted SQLite `Setting` table.

**Key settings:**
- `llm_mode`: `"cloud_free"` | `"cloud_custom"` | `"local"`
- `custom_cloud_provider`: `"deepseek"` | `"claude"` | `"gemini"`
- `model_tier_weak/medium/strong`: Ollama model names
- `free_cloud_daily_limit`: 10 (for cloud_free mode)
- API keys: claude, deepseek, gemini, groq, nvidia, freemodel

---

## 6. Chi tiết Frontend

### `LibraryView.tsx` (1036 dòng)

Component lớn nhất. Chia làm 3 phần:

| Phần | Chức năng |
|---|---|
| **Paper list** (trái) | Filter (all/starred/read/unread), sort (date/title), search, multi-select, bulk delete |
| **Preview panel** (phải) | 5 tabs: Info, AI, Related, Highlights, PDF |
| **Splitter** | Kéo resize, giới hạn 250-800px |

**Preview tabs:**
- `info`: Tóm tắt paper, metadata, star/read/delete buttons
- `ai`: Review, Phê bình, Tranh luận AI, Wow Analysis, Hỏi AI
- `related`: Papers liên quan (dựa trên embedding similarity)
- `highlights`: Đoạn quan trọng do AI chọn + phân loại
- `pdf`: Xem PDF inline (iframe)

**Narrow mode (< 480px):**
- Header: ⚡ Phân tích AI + 💬 Hỏi AI + ⋮ menu (Tranh luận, Chưa/Đã đọc, Yêu thích, Export)
- Tab bar: dropdown select (📋 Tóm tắt, ⚡ AI, 🔗 Liên quan, ✨ Highlights, 📄 PDF)

### `ChatView.tsx` (696 dòng)

**Modes:**
- `chat`: RAG chat
- `review`: Structured literature review
- `critique`: Critical analysis
- `debate`: AI vs AI debate

**Key features:**
- MarkdownRenderer cho response
- Citations panel (click source → scroll)
- Export: Markdown, HTML, DOCX
- Code highlight (`\`\`\`` blocks)
- StrictMode-safe auto-send (cancelled flag)

### `MarkdownRenderer.tsx`

Custom renderer, không dùng thư viện ngoài:

| Pattern | Output |
|---|---|
| `**bold**` | `<strong>` |
| `*italic*` | `<em>` |
| `` `code` `` | `<code>` |
| `# Heading` | `<h1>` to `<h6>` |
| `- list` | `<ul><li>` |
| `1. list` | `<ol><li>` |
| `\|table\|` | `<table>` |
| ` ``` ` block | `<pre><code>` |
| `[Source, trang X]` | `<cite>` (màu tím) |

---

## 7. LLM Providers & Chain

### cloud_free chain (mặc định)

```
Request → NVIDIA (1st) → nếu lỗi → FreeModel (2nd) → nếu lỗi → Groq (3rd)
  → nếu lỗi → Gemini (4th) → nếu lỗi → Ollama (fallback cuối)
```

### Trạng thái từng provider

| Provider | Model | Status | Latency | Ghi chú |
|---|---|---|---|---|
| **NVIDIA NIM** | `moonshotai/kimi-k2.6` | ✅ Hoạt động | ~5-12s | Key valid, model tồn tại |
| **FreeModel.dev** | `gpt-4o-mini` | ✅ Hoạt động | ~5-11s | Key valid, ổn định nhất |
| **Groq** | `llama-3.1-8b-instant` | ❌ 401 | — | Key gsk_... bị invalid, cần key mới |
| **Gemini** | `gemini-1.5-flash` | ❌ Sai format | — | Key OAuth token (AQ.Ab8...), cần key AIza... |
| **Ollama** | `qwen2.5:7b` | ✅ Local | ~2-5s | Cần GPU để nhanh hơn |
| **DeepSeek** | `deepseek-chat` | ✅ Hoạt động | (cloud_custom) |
| **Claude** | `claude-sonnet-4-20250514` | ✅ Hoạt động | (cloud_custom) |

### Key management

API keys được lưu trong `.env` và **không bao giờ** trả về qua API:
- Backend: `env_only_keys = {"claude_api_key", "deepseek_api_key", "gemini_api_key", "groq_api_key", "nvidia_api_key", "freemodel_api_key"}`
- Frontend: gửi `"***"` khi key rỗng → backend không ghi đè key thật
- Settings API: key luôn được mask thành `"***"` khi trả về

---

## 8. Vấn đề cần giải quyết

### 🔴 Cần action ngay

| # | Vấn đề | Nguyên nhân | Giải pháp |
|---|---|---|---|
| 1 | **Groq key 401** | Key `gsk_TIWorg0...` bị invalid | Copy key mới từ https://console.groq.com/keys |
| 2 | **Gemini key sai format** | Key là OAuth token, không phải Gemini API key | Lấy key AIza... từ https://aistudio.google.com/apikey |
| 3 | **Chat response chậm** (8-15s) | NVIDIA API latency + cross-encoder CPU | Timing log đã thêm → cần phân tích bottleneck |
| 4 | **Import folder không dùng được trên Tauri** | `webkitdirectory` không hoạt động trong Tauri webview | Cần dùng `invoke('select_folder')` Tauri command |

### 🟡 Nên cải thiện

| # | Vấn đề | Mô tả |
|---|---|---|
| 5 | **GPU chưa bật cho Ollama** | `OLLAMA_IGPU_ENABLE=1` chưa set → Intel Iris Xe không dùng |
| 6 | **insight endpoints chưa async** | Gap, conflict, topic, evolution chưa wrap `asyncio.to_thread` |
| 7 | **Cross-encoder chạy CPU** | ms-marco-MiniLM chạy CPU rất chậm (~1-2s cho 20 cặp) |
| 8 | **Streaming một phần** | Chat/Verify đã streaming; Review/Critique/Debate chưa streaming |
| 9 | **Retry provider đã có** | `_call_with_retry()` đã được code; vẫn cần cấu hình timeout chi tiết hơn |
| 10 | **Caching đã có một phần** | LLM, embedding, query embedding và academic cache đã có; rerank result cache chưa có |

### 🟢 Thấp

| # | Vấn đề | Mô tả |
|---|---|---|
| 11 | `plan/HYBRID_MODEL.md.copy` còn trên git | File thừa |
| 12 | `test_gemini.py` đã xoá | Không dùng nữa |
| 13 | Warning LF → CRLF khi git add | Chuyển đổi dòng, vô hại |

---

## 9. Hướng dẫn chạy

### Backend

```powershell
cd D:\all_my_project\memoryOS\backend
.venv\Scripts\Activate.ps1
uvicorn main:app --reload --port 8765
# → http://localhost:8765/docs (Swagger UI)
```

### Frontend (phát triển)

```powershell
cd D:\all_my_project\memoryOS\apps\desktop
pnpm install
pnpm tauri dev
```

### Frontend (web-only, không cần Tauri)

```powershell
cd D:\all_my_project\memoryOS\apps\desktop
pnpm dev
# → http://localhost:5173
```

### Test API bằng CLI

```powershell
cd D:\all_my_project\memoryOS\backend
python test_chat.py               # Test chat API
python test_freemodel.py          # Test FreeModel provider
```

---

## 10. Định hướng v0.2

### Mục tiêu chính

1. **Fix Groq + Gemini keys** → có thêm 2 provider dự phòng
2. **Tối ưu tốc độ chat** → < 5s cho response đầu tiên
3. **Streaming response** → user thấy AI gõ từng chữ, không đợi full response
4. **Retry logic** cho mỗi provider (thử lại 1 lần nếu lỗi tạm thời)

### Tính năng mới đề xuất

| Tính năng | Mức ưu tiên | Lý do |
|---|---|---|
| Streaming chat (SSE) | 🔴 Cao | UX tốt hơn, đỡ sốt ruột |
| Retry + timeout config | 🔴 Cao | Ổn định hơn khi API lỗi |
| Cache embedding/rerank | 🟡 TB | Giảm latency 50% |
| GPU acceleration (Ollama + cross-encoder) | 🟡 TB | Giảm latency 70% |
| Export citation (APA/MLA) | 🟢 Thấp | Phase 3 roadmap |
| Dark mode | 🟢 Thấp | UX |

### Kỹ thuật

| Task | Mô tả |
|---|---|
| `asyncio.to_thread` cho insight endpoints | Gap, conflict, topic, evolution |
| Streaming endpoint cho frontend | ChatView dùng `EventSource` hoặc fetch + reader |
| `functools.lru_cache` cho embed_query | Cache query embedding trong session |
| Lazy-load cross-encoder on demand | Chỉ load khi có request đầu tiên |
| Thêm heartbeat/health check cho providers | Phát hiện sớm API key invalid |

---

*Tạo bởi: opencode agent · 18/06/2026*
