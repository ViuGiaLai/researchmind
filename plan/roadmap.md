# MemoryOS — Roadmap Ưu Tiên

> **Tầm nhìn:** "MemoryOS không thay bạn suy nghĩ. MemoryOS giúp bạn không bao giờ đánh mất tri thức của chính mình."

---

## 🎯 Tại sao Desktop là Core Product?

Phần lớn dữ liệu giá trị nằm trên máy tính:
📄 PDF · 📘 Word · 📊 Excel · 📑 PowerPoint · 📝 Markdown · 💻 Source code
📁 Project · 🖼️ Ảnh · 🎥 Video · 🎵 Audio · 📚 Ebook · 📦 ZIP

Desktop cho phép:
- ✅ **Privacy First** — Không cần upload cloud
- ✅ **AI chạy local** — Ollama, llama.cpp, Qwen, Gemma
- ✅ **Hiệu năng cao** — Rust + Tauri
- ✅ **Offline First** — Không Internet vẫn dùng được

---

## 📋 Thứ tự ưu tiên tổng thể

```
Giai đoạn 0: Research (Tháng 1)
     │
Phase 1: MVP Desktop — Search + OCR + AI Chat + Timeline + Graph (Tháng 2-6)
     │
Year 1: Desktop Core → Extensions (Browser, VSCode, Cursor)
     │
Year 2-3: Mobile Companion (Camera, Voice, Quick Note) — chỉ là thiết bị nhập
     │
Year 5: Desktop + Mobile + Web + Encrypted Sync (Zero Knowledge)
```

---

## 🥇 Giai đoạn 0 — Research (Tháng 1)

### Mục tiêu
Không code. Chỉ nghiên cứu.

### Công việc

- [ ] **Phỏng vấn 50 người** (sinh viên, dev, designer, giáo viên, bác sĩ, nhân viên VP)
- [ ] Câu hỏi chính:
  - Bạn mất nhiều thời gian tìm gì nhất?
  - Bạn lưu ở đâu?
  - Bạn có bao nhiêu file?
  - Có bao giờ biết có file nhưng không tìm thấy không?
  - Có bao giờ nhớ nội dung nhưng quên tên file không?
- [ ] Xác định thư mục scan cụ thể
- [ ] Kiểm tra Rust toolchain trên Windows
- [ ] Vẽ wireframe UI search

### Output
- [ ] Báo cáo phỏng vấn
- [ ] Quyết định thư mục mặc định
- [ ] UI mockup

---

## 🥇 Phase 1 — MVP Desktop (Tháng 2-6)

### 🎯 Version 0.1 — MỤC TIÊU DUY NHẤT

> **Người dùng gõ:**
> *"Tìm file PDF về Docker mà tôi đọc khoảng tháng trước."*
> **và hệ thống tìm đúng trong dưới 1 giây.**

### Nguyên tắc
- ✅ Windows trước
- ✅ Local hoàn toàn
- ✅ Không cloud, không account, không login, không server

### MVP Features

```
MemoryOS Desktop v0.1
├── 🔍 Search (Natural Language)
├── 📄 PDF Reader
├── 👁️ OCR (PaddleOCR)
├── 🧠 Semantic Search (Vector)
├── 💬 AI Chat (Local LLM)
├── 📅 Timeline
├── 🕸️ Memory Graph
├── 🗄️ Local Database (SQLite)
├── 🔒 Encryption (AES-256-GCM)
└── ⚙️ Settings
```

### Kiến trúc MVP

```
React UI (TypeScript)
     │
Tauri Desktop Shell
     │
Rust Core Engine
     │
├── File Scanner
├── Text Extractor (PDF, DOCX, TXT, MD)
├── OCR Engine (PaddleOCR)
├── SQLite (metadata + FTS5)
├── Vector Store (local)
├── Embedding Engine
├── Search Engine (BM25 + Vector)
├── Re-ranker
├── Local LLM (Ollama)
├── Memory Graph Engine
└── Timeline Engine
```

### Bước 1: Setup Project (Tuần 1)

- [ ] Cài Rust: `rustup-init.exe`
- [ ] Cài Node.js 20+
- [ ] Cài pnpm: `npm install -g pnpm`
- [ ] Tạo Cargo workspace:

```
memoryos/
├── apps/
│   └── desktop/          # Tauri app
├── crates/
│   ├── memory-core/      # Core engine
│   ├── memory-indexer/   # File scanning + indexing
│   ├── memory-search/    # BM25 + Vector search
│   ├── memory-security/  # Encryption
│   ├── memory-ai/        # Ollama + NLP
│   └── memory-graph/     # Knowledge Graph
├── docs/
├── tests/
└── README.md
```

- [ ] Kiểm tra build được:
  ```bash
  cd apps/desktop
  pnpm tauri dev
  ```

### Bước 2: File Scanner (Tuần 1-2)

- [ ] Cho phép người dùng **chọn thư mục** (không tự quét)
- [ ] Filter extension: `.pdf`, `.docx`, `.txt`, `.md`, `.jpg`, `.png`
- [ ] Bỏ qua: file > 100MB, file hệ thống, file ẩn
- [ ] Hash SHA-256 để tránh trùng lặp
- [ ] Lưu metadata vào SQLite
- [ ] UI: FolderPicker, progress bar

### Bước 3: Text Extraction + OCR (Tuần 2-4)

- [ ] **PDF**: dùng `pdf-extract` crate
- [ ] **DOCX**: dùng `docx-rs` crate
- [ ] **TXT/MD**: đọc plain text
- [ ] **OCR**: tích hợp PaddleOCR (Python script)
- [ ] Lưu full text vào SQLite

### Bước 4: SQLite Schema (Tuần 3-4)

Xem chi tiết tại `plan/phase1-mvp-spec.md`

### Bước 5: Full-text Search (Tuần 4-5)

- [ ] Dùng SQLite FTS5
- [ ] BM25 ranking
- [ ] Tìm theo: tên file, nội dung
- [ ] Highlight kết quả

### Bước 6: Embedding + Semantic Search (Tuần 5-7)

- [ ] Model: `bge-small-en-v1.5`
- [ ] Chunk text → Embed → Store
- [ ] Cosine similarity search

### Bước 7: AI Chat + Natural Language (Tuần 7-9)

- [ ] Tích hợp Ollama API
- [ ] Model: Qwen2.5-7B hoặc Gemma-7B
- [ ] Natural language → Search query
- [ ] Chat UI: hỏi đáp về dữ liệu đã index

### Bước 8: Timeline (Tuần 8-9)

- [ ] Tự động tạo timeline theo thời gian
- [ ] Nhóm file theo: ngày, tuần, tháng, năm
- [ ] Hiển thị: "Tháng 5/2025 — 23 file, 3 project"

### Bước 9: Memory Graph (Tuần 9-10)

- [ ] Tự xây graph trên SQLite
- [ ] Node: file, topic, person, project
- [ ] Edge: related, contains, mentions
- [ ] AI tự nối các node

### Bước 10: Permission & Encryption (Tuần 8-10)

- [ ] UI chọn thư mục rõ ràng
- [ ] Hiển thị: "Đang index: 100 PDF, 53 DOCX"
- [ ] Nút: Stop, Pause, Delete Index, Delete All Memory
- [ ] AES-256-GCM cho database
- [ ] 5 cam kết trên UI

---

## 🥈 Year 1 — Mở rộng Desktop (Tháng 7-12)

```
MemoryOS Desktop
        │
        ├── 🌐 Browser Extension (Chrome)
        ├── 💻 VSCode Extension
        ├── 🖱️ Cursor Extension
        ├── 🔖 Chrome History Import
        ├── 🐙 Github Integration
        └── 🤖 Local AI (Nâng cấp)
```

- [ ] Browser Extension: đọc lịch sử, bookmark
- [ ] VSCode Extension: tìm code, project
- [ ] Chrome History: index lịch sử web
- [ ] Github: index repo, issues, PRs

---

## 🥉 Year 2-3 — Mobile Companion

```
Mobile chỉ là THIẾT BỊ NHẬP LIỆU, không phải trung tâm.

Desktop (Core)
     │
     └── Mobile Companion
          ├── 📸 Camera — Chụp tài liệu → OCR → Desktop
          ├── 🎤 Voice — Ghi âm → Speech-to-Text → Desktop
          ├── 📝 Quick Note — Note nhanh → Desktop
          └── 📋 Scan — Scan QR, barcode → Desktop
```

---

## 🌟 Year 5 — Đa nền tảng

```
                MemoryOS
                   │
        ┌──────────┼──────────┐
        │          │          │
     Desktop    Mobile      Web
        │
    🤖 Local AI
        │
    🔐 Encrypted Sync (Optional)
        │
    ☁️ Zero Knowledge Cloud
```

---

## 🛠 Tech Stack

| Thành phần | Công nghệ | Ghi chú |
|---|---|---|
| Core Engine | Rust | Hiệu năng cao, memory safe |
| Desktop Shell | Tauri | Nhẹ, nhanh, Rust backend |
| UI | React + TypeScript | Modern |
| Database | SQLite + FTS5 | Local, zero config |
| Vector Search | sqlite-vector | Semantic search |
| Embedding | bge-small-e5 | Chạy local |
| OCR | PaddleOCR | Có tiếng Việt |
| STT | faster-whisper | Local |
| Local LLM | Ollama (qwen2.5, gemma) | Natural language |
| Encryption | AES-256-GCM + Argon2id | Bảo vệ dữ liệu |
| Graph | SQLite tự xây | Knowledge Graph |
| Sync (sau) | E2EE + CRDT | Zero knowledge |

---

## ✅ Checklist Khởi Động

- [ ] Đã phỏng vấn 50 người?
- [ ] Đã cài Rust (`rustc --version`)?
- [ ] Đã cài Node.js 20+ (`node --version`)?
- [ ] Đã cài pnpm (`pnpm --version`)?
- [ ] Đã tạo Cargo workspace?
- [ ] Đã build thử (`cd apps/desktop && pnpm tauri dev`)?
- [ ] Đã cài Ollama (`ollama --version`)?
- [ ] Đã pull model nhỏ (`ollama pull qwen2.5:7b`)?
- [ ] Đã cài PaddleOCR?

> **Bắt đầu ngay với Bước 1 của Phase 1: Setup Project**
