# ResearchMind VN — Roadmap

> **Tầm nhìn:** *"Trợ lý nhớ mọi paper bạn đã đọc — chạy hoàn toàn trên máy bạn, không gửi dữ liệu ra ngoài."*

---

## 0. Trạng thái hiện tại — commit `32dd8ed` (18/06/2026)

```
Phase 0: Research ────── Tuần 1-2 ──── ✅ Đã hoàn thành (phỏng vấn, validate pain point)
     │
Phase 1: MVP ─────────── Tuần 3-8 ──── ✅ Đã hoàn thành (4+ tính năng cốt lõi)
     │                        └── v0.1: Multi-format import, NVIDIA fix, async, UI improvements
     │
Phase 2: Thu phí ──────── Tháng 3 ───── ⏳ Chưa bắt đầu
     │
Phase 3: Polish ───────── Tháng 4-6 ─── ⏳ Chưa bắt đầu
     │
Phase 4: Grow ─────────── Tháng 7-12 ── ⏳ Chưa bắt đầu
     │
Year 2: Mở rộng ───────── Năm 2 ─────── ⏳ Chưa bắt đầu
```

### v0.1 — Chi tiết (18/06/2026)

#### Backend
- **Multi-format import**: `extract_document()` dispatch tự động cho `.pdf`, `.docx`, `.doc`, `.txt`, `.md`, `.html`, `.htm`, `.epub`
- **NVIDIA NIM** hoạt động: thêm `nvidia_api_key`/`nvidia_model`/`nvidia_url` vào Generator()
- **Groq/Fix**: thêm `groq_api_key`/`groq_model` vào Settings model
- **Async non-blocking**: wrap `asyncio.to_thread()` cho Chat, Search, Review, Critique, Debate, Highlights, Import
- **Timing logs**: thêm `TIMING` log ở chat endpoint, generator providers, hybrid search
- **EPUB support**: thêm `ebooklib` parser
- **FreeModel URL**: sửa đúng `https://api.freemodel.dev/v1`

#### Frontend
- **MarkdownRenderer**: component render **bold**, *italic*, `code`, `# heading`, `- list`, `1. list`, `|table|`, code block, citation `[Source, trang X]`
- **ChatView**: dùng MarkdownRenderer thay `formatContent` cũ, fix StrictMode double-send (`cancelled` flag)
- **LibraryView narrow**: header ⚡ Phân tích AI + 💬 Hỏi AI + ⋮ menu, tab bar thành dropdown select
- **Tab drag**: kéo ngang preview tabs bằng `onMouseDown/Move/Up`
- **Splitter resize**: kéo thanh dọc giữa list và preview
- **ImportPanel**: format badges pill, accept tất cả định dạng
- **PDF inline**: xoá `filename` khỏi `FileResponse` → browser hiển thị inline

#### Config
- `.env`: thêm `GROQ_API_KEY`, `FREEMODEL_API_KEY`, `FREEMODEL_MODEL`, `NVIDIA_API_KEY`, `NVIDIA_MODEL`
- `LLM_MODE=cloud_free` (mặc định)
- `requirements.txt`: thêm `ebooklib==0.20`

---

## 1. Tổng Quan Lộ Trình

```
Phase 0: Research ─── Tuần 1-2 ─── Phỏng vấn, validate pain point
     │
Phase 1: MVP ─────── Tuần 3-8 ─── 4 tính năng cốt lõi, 10 users ✅
     │                    └── v0.1 — 18/06/2026 (multi-format import, NVIDIA fix, async, UI)
     │
Phase 2: Thu phí ─── Tháng 3 ────── Gói Pro 99k/tháng
     │
Phase 3: Polish ──── Tháng 4-6 ──── Zotero import, bug fixes, SEO
     │
Phase 4: Grow ────── Tháng 7-12 ─── B2B Lab, 200 users
     │
Year 2: Mở rộng ──── Năm 2 ──────── Đông Nam Á, OCR, mobile companion
```

---

## 2. Phase 0: Research + Validate (Tuần 1-2)

> **Nguyên tắc:** KHÔNG CODE. Chỉ nói chuyện với người dùng.

### Mục tiêu
- Phỏng vấn 20 nghiên cứu sinh / cao học
- Xác nhận pain point: "mất thời gian tìm lại paper đã đọc"
- Ghi lại đúng ngôn ngữ họ dùng để mô tả vấn đề

### Công việc chi tiết

| Ngày | Việc | Phương pháp |
|---|---|---|
| Tuần 1 | Vào 3 nhóm Facebook NCS Việt Nam | Đăng bài hỏi về pain point, không pitch |
| Tuần 1 | Inbox 20 NCS đang viết luận án | Xem profile, tìm người đang than về tài liệu |
| Tuần 2 | Phỏng vấn sâu 5 người | Hỏi: "Lần cuối bạn cần tìm lại nội dung trong paper đã đọc nhưng không nhớ tên — chuyện đó xảy ra bao lâu trước?" |
| Tuần 2 | Tổng hợp kết quả | Ghi lại câu trả lời nguyên văn |

### Output
- [ ] Danh sách 20 NCS/cao học đã phỏng vấn
- [ ] Báo cáo pain point (có quote nguyên văn)
- [ ] Xác nhận hướng đi hoặc pivot

---

## 3. Phase 1: MVP (Tuần 3-8)

> **Mục tiêu:** Build 4 tính năng cốt lõi, có 10 active users.

### 🎯 MỤC TIÊU DUY NHẤT

> **"Import PDF → hỏi bằng tiếng Việt → tìm đúng nội dung trong paper — dưới 1 giây."**

### 3.1 Tuần 3-4: Backend Core (Python + FastAPI)

| Task | Thời gian | Output |
|---|---|---|
| Setup FastAPI + SQLite | 1 ngày | Health check OK |
| PDF Parser (PyMuPDF) | 2 ngày | Extract text + metadata từ PDF |
| Chunker (512 tokens) | 1 ngày | Text chunks có page tracking |
| Embedder (bge-m3) | 2 ngày | Embedding vector 1024 chiều |
| BM25 Search (FTS5) | 1 ngày | Full-text search hoạt động |
| Vector Search (ChromaDB) | 2 ngày | Vector search hoạt động |
| Hybrid Search (RRF) | 1 ngày | Kết hợp BM25 + Vector |
| API Endpoints | 1 ngày | Import, Search, Library APIs |

### 3.2 Tuần 5-6: Frontend + Tauri

| Task | Thời gian | Output |
|---|---|---|
| Setup React + Tauri | 1 ngày | App chạy được |
| Library UI | 2 ngày | Danh sách paper, tag, filter |
| Search UI | 2 ngày | Search bar, kết quả, highlight |
| Settings UI | 1 ngày | Chọn folder, config model |
| API Client | 1 ngày | Kết nối React ↔ FastAPI |

### 3.3 Tuần 7-8: AI Chat + Hoàn Thiện

| Task | Thời gian | Output |
|---|---|---|
| RAG Retriever | 2 ngày | Retrieve chunks from selected papers |
| RAG Generator (Ollama) | 2 ngày | Chat với local LLM + citations |
| Chat UI | 2 ngày | ChatPanel, streaming |
| Citation verification | 1 ngày | Kiểm tra mọi claim có source |
| Bug fixes + Polish | 2 ngày | Error handling, UX |

### 3.4 User Testing

| Tuần | Số user | Hoạt động |
|---|---|---|
| Tuần 3-4 (CLI prototype) | 3 users | Validate core tech, cho họ thử CLI |
| Tuần 5-6 | 5 users | Cho dùng thử bản early UI |
| Tuần 7-8 | 10 users | Dùng thử miễn phí, feedback hàng tuần |

---

## 4. Phase 2: Thu Phí (Tháng 3)

### Mục tiêu
- [ ] Ra mắt gói Pro 99.000đ/tháng
- [ ] 10 paying users

### Công việc

| Task | Chi tiết |
|---|---|
| Pricing page | Free: 50 papers, Pro: unlimited |
| Payment integration | VietQR / chuyển khoản (thủ công ban đầu) |
| Pro features | Unlimited paper + chat + export citation |
| Onboarding email | Hướng dẫn cài đặt, tips sử dụng |
| Feedback loop | Hỏi 10 paying users: tại sao trả tiền? thiếu gì? |

### Nếu thất bại
- Không có 10 paying users → hỏi tại sao trước khi pivot
- Vấn đề thường gặp: chưa đủ giá trị, UX tệ, máy yếu không chạy được

---

## 5. Phase 3: Polish + Mở Rộng (Tháng 4-6)

### Mục tiêu
- [ ] 50 paying users
- [ ] Doanh thu ~7,95 triệu/tháng

### Tính năng mới

| Tính năng | Mức ưu tiên | Thời gian |
|---|---|---|
| Zotero import (CSV/BibTeX) | 🔴 Cao | 1 tuần |
| Export citation (APA/MLA/Vancouver) | 🔴 Cao | 3 ngày |
| Cải thiện tốc độ indexing | 🔴 Cao | 1 tuần |
| Batch import folder | 🟡 Trung bình | 2 ngày |
| Dark mode | 🟡 Trung bình | 1 ngày |
| Search filters (author, year, tags) | 🟡 Trung bình | 2 ngày |

### Marketing

| Kênh | Hoạt động |
|---|---|
| Facebook groups NCS | Share case study, tips |
| YouTube | Video hướng dẫn "cách quản lý 500 paper bằng AI" |
| Email | Newsletter tuần: research tips + tính năng mới |
| Trường ĐH | Tiếp cận lab nghiên cứu |

---

## 6. Phase 4: Grow + B2B (Tháng 7-12)

### Mục tiêu
- [ ] 200 users
- [ ] Doanh thu ~34,8 triệu/tháng
- [ ] 10 Lab accounts

### Tính năng mới

| Tính năng | Mức ưu tiên | Thời gian |
|---|---|---|
| Lab account (10 người) | 🔴 Cao | 2 tuần |
| Shared library | 🔴 Cao | 2 tuần |
| Admin dashboard | 🟡 Trung bình | 1 tuần |
| OCR cho PDF scan | 🟡 Trung bình | 2 tuần |
| Google Scholar integration | 🟢 Thấp | 1 tuần |
| Claude API key tích hợp sẵn | 🟢 Thấp | 3 ngày |

### Sales
- Tiếp cận trực tiếp các lab/khoa ở trường ĐH lớn
- Demo trực tiếp cho giảng viên hướng dẫn
- B2B: gói Lab 1.500.000đ/tháng

---

## 7. Year 2: Mở Rộng Khu Vực

### Mục tiêu
- [ ] 500 paying users
- [ ] Doanh thu ~95 triệu/tháng
- [ ] Mở rộng sang Philippines, Indonesia

### Tính năng mới

| Tính năng | Mô tả |
|---|---|
| English UI | Cho user quốc tế |
| Multi-language search | Hỗ trợ thêm tiếng Anh, Indonesia |
| OCR cho ảnh | Nhận dạng chữ trong ảnh scan, screenshot |
| Mobile companion | Camera chụp tài liệu → OCR → Desktop |
| Cloud sync (opt-in) | Encrypted sync giữa các máy |
| Plugin API | Cho phép tích hợp Zotero, Mendeley, EndNote |

---

## 8. Tech Stack

| Thành phần | Công nghệ | Lý do |
|---|---|---|
| **Backend** | Python + FastAPI | Nhanh để prototype, AI ecosystem tốt nhất |
| **Desktop Shell** | Tauri v2 | Nhẹ hơn Electron 10x |
| **Frontend** | React + TypeScript + shadcn/ui | Modern, dễ maintain |
| **PDF Extraction** | PyMuPDF | Nhanh nhất, handle được PDF scan |
| **Embedding** | bge-m3 (sentence-transformers) | Đa ngôn ngữ, CPU-friendly, context 8192 |
| **Vector DB** | ChromaDB | Dễ setup, persist local |
| **Full-text Search** | SQLite FTS5 | Zero dependency, đủ nhanh |
| **Local LLM** | Ollama + Llama 3.1 8B | Miễn phí, offline, đủ mạnh |
| **Cloud LLM** | Claude Sonnet API | Option khi user muốn chất lượng cao |
| **Re-ranking** | cross-encoder/ms-marco | Tăng accuracy 15-20% |
| **Metadata DB** | SQLite | Local first, zero config |

---

## 9. Mô Hình Kinh Doanh

| Gói | Giá/tháng | Giới hạn | Target |
|---|---|---|---|
| **Free** | 0đ | 50 paper, local LLM only, không chat | Thu hút user |
| **Pro** | 99.000đ | Unlimited paper, chat AI, export citation | NCS cá nhân |
| **Pro+** | 199.000đ | Pro + Claude API key tích hợp sẵn | NCS cần AI tốt hơn |
| **Lab** | 1.500.000đ | 10 người, shared library | Lab/khoa |
| **Enterprise** | Liên hệ | Unlimited, on-premise | Trường ĐH, viện |

### Dự báo Revenue (Conservative)

| Mốc | Paying users | Doanh thu/tháng | Điều kiện |
|---|---|---|---|
| Tháng 3 | 10 Pro | ~990.000đ | Product-market fit sơ bộ |
| Tháng 6 | 50 Pro + 2 Lab | ~7.950.000đ | Sustainable |
| Tháng 12 | 200 Pro + 10 Lab | ~34.800.000đ | Có thể thuê người |
| Năm 2 | 500 Pro + 30 Lab | ~95.000.000đ | Mở rộng ĐNA |

---

## 10. Rủi Ro & Giải Pháp

| # | Rủi ro | Mức độ | Giải pháp |
|---|---|---|---|
| 1 | NotebookLM cải thiện tiếng Việt | 🔴 Cao | Tập trung local-first + offline — Google sẽ không làm điều này vì ảnh hưởng cloud business |
| 2 | Máy user yếu, không chạy được local LLM | 🟡 TB | Cho dùng Claude API key. Free tier chỉ cần bge-m3 (chạy CPU yếu được) |
| 3 | NCS không sẵn sàng trả tiền | 🟡 TB | Pilot 30 ngày free → show ROI (tiết kiệm X giờ/tuần) |
| 4 | Một mình không build kịp | 🔴 Cao | Dùng Python để build nhanh. Giới hạn tính năng. Tìm co-founder |
| 5 | Hallucination | 🟡 TB | Citation verification bắt buộc. Mọi câu trả lời có nguồn |
| 6 | Bị Zotero ra tính năng tương tự | 🟢 Thấp | Zotero là reference manager, không phải AI research assistant |

---

## 11. Học Tập — Lộ Trình Kỹ Thuật

> **Nguyên tắc:** Học đúng thứ, đúng lúc. Không học Rust khi chưa cần.

| Thứ tự | Chủ đề | Thời gian | Tài liệu |
|---|---|---|---|
| 1 | Python + FastAPI | 2-3 tuần | FastAPI docs, Real Python |
| 2 | RAG từ đầu (không LangChain) | 2 tuần | Building RAG from scratch (YouTube), ChromaDB docs |
| 3 | Embedding & Semantic Search | 1-2 tuần | sentence-transformers docs, bge-m3 paper |
| 4 | SQLite FTS5 & BM25 | 1 tuần | SQLite FTS5 docs |
| 5 | React + TypeScript + Tauri | 3-4 tuần | React docs, Tauri v2 docs |
| 6 | Ollama + Local LLM | 1 tuần | Ollama GitHub |
| 7 | PDF parsing | 1 tuần | PyMuPDF docs |
| 8 | Re-ranking & Cross-encoder | 1 tuần | SBERT.net |
| 9 (sau MVP) | Rust cơ bản | 4-6 tuần | The Rust Book — chỉ học nếu cần rewrite |

---

## 12. Checklist Khởi Động

- [ ] Đã phỏng vấn 20 NCS/cao học?
- [ ] Đã cài Python 3.11+ (`python --version`)?
- [ ] Đã cài Node.js 20+ (`node --version`)?
- [ ] Đã cài pnpm (`pnpm --version`)?
- [ ] Đã cài Ollama (`ollama --version`)?
- [ ] Đã pull model: `ollama pull llama3.1:8b`?
- [ ] Đã cài Rust (cho Tauri): `rustc --version`?
- [ ] Đã build thử app: `cd apps/desktop && pnpm tauri dev`?

> **Bắt đầu:** Phỏng vấn 5 người trong tuần này trước khi viết 1 dòng code.
