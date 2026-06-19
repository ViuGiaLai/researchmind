# ResearchMind VN
*Trợ lý nghiên cứu AI — Local-first — Tiếng Việt*

**Product Plan đầy đủ · 2025–2027**

| 100k+ | $0 | 8 tuần |
|---|---|---|
| Nghiên cứu sinh & cao học VN | Đối thủ local-first tiếng Việt | Từ 0 đến MVP có user |

---

## 0. Trạng thái hiện tại — Phiên bản v0.1 (18/06/2026)

> **Commit:** `32dd8ed` —`feat: multi-format import, NVIDIA fix, async non-blocking + UI improvements`

### ✅ Đã hoàn thành (so với MVP plan)

#### Backend Core
| Tính năng | Trạng thái | Ghi chú |
|---|---|---|
| PDF Import & Index | ✅ Hoàn thành | PyMuPDF + OCR (rapidocr), chunk 512 tokens, embed bge-m3 |
| Multi-format import (DOCX, TXT, MD, HTML, EPUB) | ✅ Hoàn thành (v0.1) | `extract_document()` dispatch theo extension |
| Zotero Import (CSV + BibTeX) | ✅ Hoàn thành | Cả metadata lẫn tìm PDF tự động |
| Semantic Search (Hybrid BM25 + Vector) | ✅ Hoàn thành | RRF fusion + Cross-encoder reranker |
| Chat với Paper (RAG) | ✅ Hoàn thành | Retrieve top-5 chunks → LLM generate + citations |
| Cloud LLM chain (NVIDIA → FreeModel → Groq → Gemini → Ollama) | ✅ Hoàn thành (v0.1) | `cloud_free` mode, fallback tự động |
| Local LLM (Ollama) với 3 tier (weak/medium/strong) | ✅ Hoàn thành | qwen2.5:7b mặc định |
| Daily Reader (gợi ý paper mỗi ngày) | ✅ Hoàn thành | LLM chọn paper theo lịch sử |
| Insight features (gap analysis, conflict, topic, evolution) | ✅ Hoàn thành | LLM phân tích đa paper |
| Highlights tự động | ✅ Hoàn thành | LLM chọn đoạn quan trọng + phân loại |
| Async non-blocking (asyncio.to_thread) | ✅ Hoàn thành (v0.1) | Chat, Search, Review, Critique, Debate, Highlights, Import |
| Timing logs cho debug | ✅ Hoàn thành (v0.1) | TIMING log ở chat, generator, hybrid search |
| PDF inline view (iframe) | ✅ Hoàn thành | Không tải về, xem trực tiếp |

#### Frontend (Tauri + React + TypeScript)
| Tính năng | Trạng thái | Ghi chú |
|---|---|---|
| Library (danh sách paper, filter, sort) | ✅ Hoàn thành | Splitter resize, narrow mode responsive |
| Chat UI (Markdown, streaming, citations) | ✅ Hoàn thành | MarkdownRenderer custom (bold, code, table, list, heading) |
| Search UI | ✅ Hoàn thành | Hybrid search + filters |
| Settings (LLM mode, API keys, model selection) | ✅ Hoàn thành | env_only_keys masking |
| Wow Analysis UI | ✅ Hoàn thành | Multi-step (summary, findings, debate, questions) |
| Import Panel (PDF + BibTeX + Zotero) | ✅ Hoàn thành | Drag-drop, folder import, format badges |
| MarkdownRenderer | ✅ Hoàn thành (v0.1) | Bold, italic, code, heading, table, list, citation |
| Narrow mode responsive (< 480px) | ✅ Hoàn thành (v0.1) | Icon buttons, ⋮ menu, tab select |
| Preview panel tabs (Info, AI, Related, Highlights, PDF) | ✅ Hoàn thành | Kéo ngang tabs, splitter |

#### LLM Providers
| Provider | Trạng thái | Ghi chú |
|---|---|---|
| **NVIDIA NIM** (moonshotai/kimi-k2.6) | ✅ Hoàn thành (v0.1) | Chạy đầu tiên trong cloud_free chain |
| **FreeModel.dev** (gpt-4o-mini) | ✅ Hoàn thành | Hoạt động tốt, latency 5-11s |
| **Groq** (llama-3.3-70b-versatile) | ⚠️ Có vấn đề | Key 401 — cần key mới |
| **Gemini** (gemini-1.5-flash) | ⚠️ Có vấn đề | Key sai format (OAuth token, cần AIza...) |
| **Ollama** (qwen2.5:7b) | ✅ Hoàn thành | Local fallback cuối cùng |
| **DeepSeek** | ✅ Hoàn thành | cloud_custom mode |
| **Claude** | ✅ Hoàn thành | cloud_custom mode |

### 🔧 Cần cải thiện

| Vấn đề | Mức độ | Giải pháp |
|---|---|---|
| Groq key 401 | 🔴 Cao | Copy key mới từ https://console.groq.com/keys |
| Gemini key sai format | 🔴 Cao | Lấy key dạng AIza... từ https://aistudio.google.com/apikey |
| Chat response chậm (NVIDIA ~8-15s) | 🟡 TB | Timing log đã thêm, cần theo dõi. Có thể giảm top_k_retrieval |
| Intel Iris Xe GPU chưa bật cho Ollama | 🟢 Thấp | Set OLLAMA_IGPU_ENABLE=1 |
| insight endpoints chưa wrap asyncio.to_thread | 🟢 Thấp | Gap, conflict, topic, evolution |

### 📋 So với MVP gốc (Phase 1)

| MVP Feature | Plan | Actual | Vượt/Thiếu |
|---|---|---|---|
| Import & Index PDF | 🔴 MUST | ✅ PDF + DOCX + TXT + MD + HTML + EPUB | **Vượt** (thêm 5 format) |
| Semantic Search | 🔴 MUST | ✅ Hybrid + Reranker | Đúng plan |
| Chat với Paper | 🔴 MUST | ✅ RAG + 7 providers + citations | **Vượt** (nhiều provider) |
| Library quản lý | 🟡 SHOULD | ✅ List + filter + sort + preview | Đúng plan |
| Zotero import | ❌ Không làm MVP | ✅ CSV + BibTeX + auto PDF | **Vượt** |
| Cloud LLM option | 🟡 SHOULD | ✅ 6 cloud providers | **Vượt** |
| Insight features | ❌ Không làm MVP | ✅ Gap, conflict, topic, evolution - Wow Analysis | **Vượt** |

---

## 1. Tầm nhìn & Định vị

> **Tagline:** "Trợ lý nhớ mọi paper bạn đã đọc — chạy hoàn toàn trên máy bạn, không gửi dữ liệu ra ngoài."

### Vấn đề cốt lõi

Nghiên cứu sinh Việt Nam đọc hàng trăm paper mỗi năm nhưng không có công cụ nào giúp họ:

- Tìm lại paper theo nội dung ngữ nghĩa ("paper nào nói về transformer attention trước 2021")
- Kết nối ý tưởng giữa nhiều paper khác nhau
- Tóm tắt và so sánh luận điểm giữa các tài liệu
- Làm tất cả bằng tiếng Việt, offline, không lo lộ dữ liệu nghiên cứu nhạy cảm

### Khác biệt với đối thủ

| Tiêu chí | ResearchMind | NotebookLM | Zotero | Notion AI |
|---|---|---|---|---|
| Tiếng Việt tốt | ✅ Có | ⚠️ Yếu | ❌ Không | ⚠️ Trung bình |
| Local-first / Offline | ✅ Hoàn toàn | ❌ Cloud | ✅ Có | ❌ Cloud |
| AI semantic search | ✅ Có | ✅ Có | ❌ Không | ✅ Có |
| Tóm tắt đa paper | ✅ Có | ⚠️ Giới hạn | ❌ Không | ⚠️ Thủ công |
| Giá/tháng (VN) | 99k–299k | Miễn phí* | Miễn phí | 400k+ |
| Bảo mật dữ liệu | ✅ Tuyệt đối | ❌ Google đọc | ✅ Có | ❌ Notion đọc |

---

## 2. Người dùng mục tiêu

### Phân khúc chính — Tier 1 (năm đầu)

| Nhóm | Pain point cụ thể | Sẵn sàng trả tiền |
|---|---|---|
| Nghiên cứu sinh Tiến sĩ | Đọc 200–500 paper/năm, không nhớ nội dung sau 2 tháng, viết literature review mất 3–4 tuần | Cao — có học bổng, ngân sách đề tài NAFOSTED |
| Sinh viên Cao học | Luận văn yêu cầu 50–100 tài liệu, không biết đã đọc paper nào rồi, trùng lặp ghi chú | Trung bình — 99k–199k/tháng chấp nhận được |
| Giảng viên trẻ (<40 tuổi) | Theo dõi research mới, chuẩn bị bài giảng, viết bài báo ISI — quản lý tài liệu rất kém | Cao — có thu nhập ổn định, cần hiệu quả |

### Cách tiếp cận 10 user đầu tiên

1. Tuần 1: Vào 3 nhóm Facebook của nghiên cứu sinh VN (NCS Việt Nam, PhD Vietnam Network) — đăng bài hỏi về pain point, không pitch sản phẩm
2. Tuần 2: Inbox trực tiếp 20 NCS đang viết luận án (xem profile, tìm người đang than về tài liệu)
3. Tuần 3: Nhờ giảng viên hướng dẫn (nếu bạn đang là SV) giới thiệu 3–5 NCS trong lab
4. Tuần 4: Cho dùng thử miễn phí 30 ngày đổi lấy 30 phút phỏng vấn và feedback hàng tuần

---

## 3. Tính năng MVP — 8 tuần

> **Nguyên tắc:** Chỉ build 4 tính năng cốt lõi. Không thêm bất cứ thứ gì khác cho đến khi có 20 user dùng hàng ngày.

| # | Tính năng | Mô tả chi tiết | Độ ưu tiên |
|---|---|---|---|
| 1 | Import & Index PDF | Kéo thả PDF vào app → tự động extract text, chunk, tạo embedding vector. Hỗ trợ tiếng Việt và tiếng Anh. Index xong trong <30 giây/paper. | 🔴 MUST |
| 2 | Semantic Search | Gõ câu hỏi tự nhiên → trả về đoạn văn liên quan từ nhiều paper + tên paper + trang. Ví dụ: "phương pháp đánh giá độ trễ mạng 5G" | 🔴 MUST |
| 3 | Chat với Paper | Chọn 1–5 paper → hỏi AI tóm tắt, so sánh, giải thích. AI trả lời có trích dẫn nguồn cụ thể (tên paper, trang). Không hallucinate. | 🔴 MUST |
| 4 | Library quản lý | Xem danh sách paper đã import, tag, ghi chú ngắn, đánh dấu đã đọc / chưa đọc, sắp xếp theo ngày / chủ đề. | 🟡 SHOULD |

### Tính năng KHÔNG làm trong MVP

- Sync cloud — thêm sau khi có revenue
- Mobile app — desktop trước
- Zotero import — thêm sau khi validate core
- Collaboration / chia sẻ với người khác
- Knowledge graph / timeline

---

## 4. Tech Stack — Lựa chọn & Lý do

> **Triết lý:** Không dùng Rust ngay. Validate bằng Python trước — nhanh hơn 10x. Rewrite sau khi biết cần optimize phần nào.

### 4.1 Ngôn ngữ & Framework

| Layer | Công nghệ | Phiên bản | Lý do chọn |
|---|---|---|---|
| Backend / Core | Python | 3.11+ | Ecosystem AI tốt nhất, nhanh để prototype, thư viện ML đầy đủ |
| Desktop Shell | Tauri v2 | 2.x | Nhẹ hơn Electron 10x, dùng Rust cho shell nhưng logic vẫn là Python |
| Frontend UI | React + TypeScript | React 19 | Ecosystem lớn, dễ tìm help, component library phong phú |
| UI Component | shadcn/ui + Tailwind | Latest | Đẹp, nhẹ, không vendor lock-in, dễ customize |
| Backend API | FastAPI | 0.110+ | Async, type-safe, auto docs, nhanh nhất trong Python web framework |

### 4.2 AI & Search Pipeline

| Chức năng | Thư viện / Model | Phương án dự phòng | Ghi chú |
|---|---|---|---|
| PDF Extraction | PyMuPDF (fitz) | pdfplumber | Nhanh nhất, xử lý được PDF scan |
| Text Chunking | LangChain TextSplitter | Tự viết | Chunk 512 tokens, overlap 50 tokens |
| Embedding Model | bge-m3 (local) | e5-mistral-7b | Đa ngôn ngữ, hỗ trợ tiếng Việt tốt, chạy CPU được |
| Vector Database | ChromaDB (local) | Qdrant local | Dễ nhất để bắt đầu, không cần server, persist local |
| Full-text Search | SQLite FTS5 | Whoosh | Kết hợp với vector search để tăng độ chính xác |
| LLM (Chat) | Ollama + Llama 3.1 8B | Gemma 2 9B | Chạy local hoàn toàn, không cần internet, 8B đủ mạnh |
| LLM (Cloud option) | Claude Sonnet API | GPT-4o mini | Dùng khi user muốn kết quả tốt hơn, user tự trả tiền API key |
| Re-ranking | cross-encoder/ms-marco | Cohere Rerank | Tăng độ chính xác kết quả search lên 15–20% |
| Metadata Storage | SQLite | DuckDB | Lưu tên paper, tác giả, năm, tag, ghi chú người dùng |

---

## 5. Thuật toán cốt lõi — giải thích chi tiết

### 5.1 Hybrid Search (BM25 + Vector)

Đây là thuật toán quan trọng nhất — quyết định chất lượng search của toàn bộ sản phẩm.

| Phương pháp | Mạnh | Yếu |
|---|---|---|
| BM25 (Full-text) | Tìm từ khóa chính xác, tên tác giả, thuật ngữ kỹ thuật | Không hiểu ngữ nghĩa — "xe hơi" khác "ô tô" |
| Vector Search | Hiểu ngữ nghĩa, đồng nghĩa, câu hỏi tự nhiên | Chậm với corpus lớn, đôi khi trả kết quả không liên quan |
| Hybrid (kết hợp) | Tốt nhất của cả hai — vừa chính xác vừa hiểu ngữ nghĩa | Cần tune weight giữa 2 phương pháp |

**Công thức Hybrid Score:**

```
final_score = α × bm25_score + (1-α) × vector_score
# α = 0.3 (vector mạnh hơn cho câu hỏi tự nhiên)
# α = 0.7 (BM25 mạnh hơn cho từ khóa kỹ thuật)
```

### 5.2 Chunking Strategy

Cách chia nhỏ văn bản quyết định trực tiếp chất lượng retrieval:

- Chunk size: 512 tokens (~400 từ) — đủ ngữ cảnh nhưng không quá dài
- Overlap: 50 tokens — tránh cắt đứt ý giữa chừng
- Sentence-aware: không cắt giữa câu, ưu tiên cắt ở paragraph
- Metadata per chunk: tên paper, số trang, section header — để trích dẫn chính xác

### 5.3 RAG Pipeline (Retrieval-Augmented Generation)

| Bước | Tên | Mô tả |
|---|---|---|
| 1 | Query Processing | Nhận câu hỏi từ user → phát hiện ngôn ngữ (VN/EN) → query expansion (thêm từ đồng nghĩa) |
| 2 | Hybrid Retrieval | Chạy song song BM25 và Vector Search → lấy top-20 kết quả từ mỗi loại |
| 3 | Re-ranking | Dùng Cross-Encoder model chấm điểm lại 40 kết quả → chọn top-5 tốt nhất |
| 4 | Context Building | Ghép 5 chunk tốt nhất vào prompt, kèm metadata (tên paper, trang) |
| 5 | LLM Generation | Local LLM (Ollama) hoặc Claude API tạo câu trả lời có trích dẫn |
| 6 | Citation Check | Kiểm tra mọi claim trong câu trả lời đều có nguồn → tránh hallucination |

### 5.4 Embedding Model — Tại sao chọn bge-m3

- Hỗ trợ 100+ ngôn ngữ bao gồm tiếng Việt — đây là yếu tố quan trọng nhất
- Dense + Sparse + ColBERT trong một model — không cần 3 model riêng
- Chạy được trên CPU (không cần GPU) — phù hợp máy tính phổ thông của sinh viên
- Context length 8192 tokens — xử lý được đoạn văn dài
- Open source, MIT license — dùng miễn phí cho mọi mục đích

---

## 6. Kiến trúc hệ thống

### Luồng xử lý khi Import PDF

| Bước | Module | Chi tiết |
|---|---|---|
| 1 | File Watcher | User kéo thả PDF → Tauri gọi Python backend qua IPC |
| 2 | PDF Parser | PyMuPDF extract text + metadata (title, author, year, DOI) |
| 3 | Language Detect | langdetect xác định ngôn ngữ → chọn chunking strategy phù hợp |
| 4 | Chunker | Chia thành chunks 512 tokens, lưu mapping chunk↔page |
| 5 | Embedder | bge-m3 tạo vector 1024 chiều cho mỗi chunk → lưu vào ChromaDB |
| 6 | FTS Indexer | SQLite FTS5 index toàn bộ text cho BM25 search |
| 7 | Metadata Store | SQLite lưu paper info, tags, trạng thái đọc |

### Cấu trúc thư mục dự án

```
researchmind/
├── src-tauri/          # Tauri shell (Rust)
├── src/                # React + TypeScript UI
│   ├── components/     # UI components
│   ├── pages/          # Search, Library, Chat, Settings
│   └── hooks/          # useSearch, useLibrary
├── backend/            # Python FastAPI
│   ├── ingestion/      # PDF parse, chunk, embed
│   │   ├── parser.py   # PyMuPDF wrapper
│   │   ├── chunker.py  # Text splitting
│   │   └── embedder.py # bge-m3 inference
│   ├── search/         # Hybrid search engine
│   │   ├── bm25.py     # SQLite FTS5
│   │   ├── vector.py   # ChromaDB queries
│   │   └── hybrid.py   # Score fusion + reranker
│   ├── chat/           # RAG pipeline
│   │   ├── retriever.py
│   │   └── generator.py # Ollama / Claude API
│   └── db/             # SQLite models
├── data/               # Local user data (gitignored)
│   ├── papers/         # PDF copies
│   ├── chroma/         # Vector DB
│   └── researchmind.db # SQLite
└── models/             # Downloaded AI models (gitignored)
```

---

## 7. Roadmap thực tế — 12 tháng

| Giai đoạn | Thời gian | Việc cần làm | Mục tiêu |
|---|---|---|---|
| Phase 0: Research | Tuần 1–2 | Phỏng vấn 20 NCS/cao học. Không code. Ghi lại đúng ngôn ngữ họ dùng để mô tả vấn đề. | Validate pain point |
| Phase 1: Prototype | Tuần 3–4 | Build bằng Python thuần + CLI. Import PDF, search đơn giản bằng ChromaDB. Cho 3 người dùng thử. | Validate core tech |
| Phase 2: MVP UI | Tuần 5–8 | Tauri + React UI. 4 tính năng cốt lõi. 10 user thử nghiệm, họp feedback hàng tuần. | 10 active users |
| Phase 3: Charge $ | Tháng 3 | Ra gói Pro 99k/tháng. Mục tiêu 10 paying users. Nếu thất bại → hỏi tại sao trước khi pivot. | Revenue đầu tiên |
| Phase 4: Polish | Tháng 4–6 | Sửa bugs theo feedback. Thêm Zotero import. Cải thiện tốc độ indexing. SEO / content marketing. | 50 paying users |
| Phase 5: Grow | Tháng 7–12 | Tiếp cận lab/khoa ở các trường ĐH lớn. B2B: bán gói Lab 10 người. Thêm tính năng collaboration. | 200 users / B2B |

---

## 8. Mô hình kiếm tiền

| Gói | Giá/tháng | Giới hạn | Target |
|---|---|---|---|
| Free | 0đ | 50 paper, local LLM only, không chat | Thu hút user, build trust |
| Pro | 99.000đ | Không giới hạn paper, chat AI, export citation | Nghiên cứu sinh cá nhân |
| Pro+ | 199.000đ | Pro + Claude API key tích hợp sẵn (không cần tự mua) | Nghiên cứu sinh muốn AI tốt hơn |
| Lab | 1.500.000đ | 10 người, shared library, quản lý tài liệu nhóm | Lab nghiên cứu, khoa |
| Enterprise | Liên hệ | Unlimited, on-premise, SLA, training | Trường ĐH, viện nghiên cứu |

### Dự báo revenue — conservative

| Mốc | Số paying users | Doanh thu/tháng | Điều kiện |
|---|---|---|---|
| Tháng 3 | 10 Pro | ~990k | Chứng minh có người trả tiền |
| Tháng 6 | 50 Pro + 2 Lab | ~7,95 triệu | Product-market fit sơ bộ |
| Tháng 12 | 200 Pro + 10 Lab | ~34,8 triệu | Sustainable, có thể thuê người |
| Năm 2 | 500 Pro + 30 Lab | ~95 triệu | Expand sang ĐNA (Philippines, Indonesia) |

---

## 9. Rủi ro & Giải pháp

| | Rủi ro | Mức độ | Giải pháp |
|---|---|---|---|
| 1 | NotebookLM cải thiện tiếng Việt | 🔴 Cao | Tập trung local-first + offline — đây là thứ Google sẽ không làm vì ảnh hưởng business model cloud của họ |
| 2 | Máy tính user yếu, không chạy được Local LLM | 🟡 Trung bình | Cho phép dùng Claude/OpenAI API key của user. Free tier chỉ cần bge-m3 embedding (chạy được trên CPU yếu) |
| 3 | NCS không sẵn sàng trả tiền | 🟡 Trung bình | Pilot miễn phí 30 ngày → show ROI rõ ràng (tiết kiệm X giờ/tuần). Nếu thấy giá trị, họ sẽ trả |
| 4 | Một mình không build kịp | 🔴 Cao | Dùng Python để build nhanh. Tìm 1 co-founder (UI/UX hoặc ML). Mở rộng tính năng chậm — tập trung quality |
| 5 | Hallucination — AI đưa thông tin sai | 🟡 Trung bình | Mọi câu trả lời phải có citation cụ thể (tên paper + trang). User tự verify. Không cho AI trả lời không có source |

---

## 10. Lộ trình học kỹ thuật — theo thứ tự ưu tiên

> **Nguyên tắc:** Học đúng thứ, đúng lúc. Không học Rust khi chưa cần. Không học Knowledge Graph khi chưa có user.

| Thứ tự | Chủ đề | Thời gian học | Tài liệu cụ thể |
|---|---|---|---|
| 1 ⭐ | Python nâng cao + FastAPI | 2–3 tuần | FastAPI docs chính thức, Real Python, Pydantic docs |
| 2 ⭐ | RAG từ đầu (không dùng LangChain) | 2 tuần | Building RAG from scratch (YouTube), ChromaDB docs |
| 3 ⭐ | Embedding & Semantic Search | 1–2 tuần | Sentence-transformers docs, BEIR benchmark paper, bge-m3 paper |
| 4 ⭐ | SQLite FTS5 & BM25 | 1 tuần | SQLite FTS5 docs, Robertson BM25 paper (đọc phần chính) |
| 5 | React + TypeScript + Tauri | 3–4 tuần | React docs beta, Total TypeScript, Tauri v2 docs |
| 6 | Ollama + Local LLM | 1 tuần | Ollama GitHub, Llama 3 model card, LM Studio để test |
| 7 | PDF parsing & OCR | 1 tuần | PyMuPDF docs, PaddleOCR GitHub |
| 8 | Re-ranking & Cross-Encoder | 1 tuần | Sentence-transformers cross-encoder docs, SBERT.net |
| 9 (sau MVP) | Rust cơ bản | 4–6 tuần | The Rust Book, Rustlings exercises — chỉ học khi cần rewrite |
| 10 (sau MVP) | Cryptography & Security | 2 tuần | OWASP Top 10, AES-256 implementation, Argon2 docs |

---

## Kết luận — Bước tiếp theo

> **Tuần này:** KHÔNG CODE. Gặp 5 nghiên cứu sinh hoặc sinh viên cao học. Hỏi đúng 1 câu: *"Lần cuối bạn cần tìm lại nội dung trong paper đã đọc nhưng không nhớ tên — chuyện đó xảy ra bao lâu trước?"* Ghi lại câu trả lời nguyên văn.

> **Tuần 2–4:** Build prototype CLI bằng Python thuần. Import 1 folder PDF. Search bằng câu hỏi tự nhiên. Demo cho 3 người. Không cần UI đẹp.

> **Tháng 2:** Nếu 3 người đó dùng lại tự nguyện ít nhất 3 lần → tiếp tục build. Nếu không → hỏi tại sao trước khi quyết định pivot hay persist.

---

*Sản phẩm tốt không bắt đầu từ code. Nó bắt đầu từ việc ngồi cùng người dùng và lắng nghe.*
