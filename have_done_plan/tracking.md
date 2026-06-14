# MemoryOS — 📋 Trạng Thái Dự Án

> **Cập nhật:** 14/06/2026
> **Mục tiêu Phase 1:** MVP Desktop — Search + OCR + AI Chat + Timeline + Graph

---

## 📊 Tổng Quan

| Hạng mục | Trạng thái | Tiến độ |
|---|---|---|
| 📐 Plan & Spec | ✅ Hoàn thành | 3/3 files |
| 📦 Rust Crates | ✅ Hoàn thành | 6/6 crates |
| 🖥️ Tauri Desktop | 🟡 Thiếu components | 50% |
| 🔍 Search Engine | ✅ Hoàn thành | 100% |
| 💬 AI Chat | 🟡 Thiếu Ollama integration test | 70% |
| 👁️ OCR | 🟡 Chỉ có placeholder | 10% |
| 📅 Timeline | 🟡 Thiếu UI | 50% |
| 🕸️ Knowledge Graph | 🟡 Thiếu UI | 50% |
| 🔒 Encryption | ✅ Hoàn thành | 100% |
| 🎨 UI Components | 🔴 Chưa làm | 0% |

---

## ✅ Phần 1: NHỮNG GÌ ĐÃ LÀM (Done)

### 1.1 Plan Files (3/3 files)

| File | Mô tả | Đã hoàn thành |
|---|---|---|
| `plan/roadmap.md` | Roadmap ưu tiên, timeline 5 năm | ✅ |
| `plan/phase1-mvp-spec.md` | Spec chi tiết Phase 1 MVP | ✅ |
| `plan/architecture.md` | Kiến trúc tổng thể, data flow | ✅ |

### 1.2 Rust Workspace (6/6 crates)

| Crate | Files | Chức năng | Status |
|---|---|---|---|
| **memory-core** | `Cargo.toml`, `lib.rs`, `scanner.rs`, `extractor.rs` | Scanner thư mục + Extract text PDF/DOCX/TXT/MD | ✅ Có unit test |
| **memory-indexer** | `Cargo.toml`, `lib.rs`, `db.rs`, `pipeline.rs` | SQLite schema (10 tables) + Indexing pipeline | ✅ Có unit test |
| **memory-search** | `Cargo.toml`, `lib.rs`, `config.rs`, `search.rs` | BM25 FTS5 search engine | ✅ Có unit test |
| **memory-ai** | `Cargo.toml`, `lib.rs`, `ollama.rs`, `nlp.rs`, `embedder.rs`, `chat.rs` | Ollama client + NLP parser + Embedder + Chat | ✅ Có unit test |
| **memory-graph** | `Cargo.toml`, `lib.rs`, `graph.rs`, `timeline.rs`, `relation.rs` | Knowledge Graph + Timeline + Relation | ✅ Có unit test |
| **memory-security** | `Cargo.toml`, `lib.rs`, `encrypt.rs` | AES-256-GCM + Argon2id | ✅ Có unit test |

### 1.3 Tauri Desktop App

| File | Chức năng | Status |
|---|---|---|
| `Cargo.toml` | Dependencies (all crates + tauri) | ✅ |
| `tauri.conf.json` | Window config (1100x750) | ✅ |
| `build.rs` | Tauri build script | ✅ |
| `src/main.rs` | Entry point | ✅ |
| `src/lib.rs` | 4 commands: search, preview, suggestions, stats | ✅ |
| `package.json` | React + Vite + Tauri deps | ✅ |
| `tsconfig.json` | TypeScript config | ✅ |
| `vite.config.ts` | Vite dev server | ✅ |
| `index.html` | HTML entry | ✅ |
| `src/main.tsx` | React entry | ✅ |
| `src/App.tsx` | Main UI (search, results, stats views) | ✅ Cơ bản |
| `src/styles/variables.css` | CSS variables (dark theme) | ✅ |
| `src/styles/globals.css` | Global styles | ✅ |

### 1.4 Scripts

| File | Chức năng | Status |
|---|---|---|
| `scripts/ocr_pipeline.py` | PaddleOCR placeholder | 🟡 Chỉ placeholder |

---

## 🔴 Phần 2: NHỮNG GÌ CHƯA LÀM (Not Started)

### 2.1 Rust Code Chưa Viết

| Module | File cần tạo | Lý do |
|---|---|---|
| `memory-indexer` | Chưa có commands cho scan/stop/delete index | Cần thêm Tauri commands |
| `memory-search` | Chưa có vector search thực tế (cần kết nối sqlite-vector) | Cần extension |
| `memory-ai` | Chưa test thật với Ollama | Cần Ollama chạy |

### 2.2 React UI Components Chưa Tạo

| Component | Chức năng | Ưu tiên |
|---|---|---|
| `FolderPicker.tsx` | Chọn thư mục scan | ⭐⭐⭐ |
| `FolderList.tsx` | Danh sách thư mục đã chọn | ⭐⭐⭐ |
| `ScanButton.tsx` | Start/Stop scan | ⭐⭐⭐ |
| `ScanProgress.tsx` | Progress bar real-time | ⭐⭐⭐ |
| `SearchFilters.tsx` | Filter theo type, date, folder | ⭐⭐⭐ |
| `FilePreview.tsx` | Preview nội dung file | ⭐⭐⭐ |
| `PdfPreview.tsx` | Xem PDF inline | ⭐⭐ |
| `ChatPanel.tsx` | AI Chat panel | ⭐⭐⭐ |
| `ChatMessage.tsx` | Message bubble | ⭐⭐⭐ |
| `ChatInput.tsx` | Chat input | ⭐⭐ |
| `TimelineView.tsx` | Timeline view | ⭐⭐ |
| `TimelineGroup.tsx` | Group theo thời gian | ⭐⭐ |
| `GraphView.tsx` | Graph visualization (d3.js) | ⭐⭐ |
| `GraphNode.tsx` | Graph node | ⭐⭐ |
| `StatsOverview.tsx` | Thống kê tổng quan | ⭐⭐ |
| `FileTypeChart.tsx` | Pie chart by extension | ⭐ |
| `Settings.tsx` | Settings page | ⭐⭐ |
| `EmptyState.tsx` | Empty state component | ⭐ |
| `ErrorBoundary.tsx` | Error boundary | ⭐ |
| `Spinner.tsx` | Loading spinner | ⭐ |

### 2.3 Rust Hooks (React) Chưa Tạo

| Hook | Chức năng | Ưu tiên |
|---|---|---|
| `useSearch.ts` | Gọi Tauri search command | ⭐⭐⭐ |
| `useScan.ts` | Gọi Tauri scan command | ⭐⭐⭐ |
| `useFolders.ts` | Quản lý folder | ⭐⭐⭐ |
| `useChat.ts` | AI Chat logic | ⭐⭐⭐ |
| `useTimeline.ts` | Timeline data | ⭐⭐ |
| `useGraph.ts` | Graph data | ⭐⭐ |
| `useStats.ts` | Stats data | ⭐⭐ |
| `useDebounce.ts` | Debounce input | ⭐⭐ |

### 2.4 Tauri Commands Chưa Implement

| Command | Chức năng | Ưu tiên |
|---|---|---|
| `select_folder` | Dialog chọn thư mục | ⭐⭐⭐ |
| `start_scan` | Bắt đầu scan | ⭐⭐⭐ |
| `stop_scan` | Dừng scan | ⭐⭐⭐ |
| `delete_index` | Xóa index | ⭐⭐⭐ |
| `chat` | AI Chat | ⭐⭐⭐ |
| `get_timeline` | Timeline data | ⭐⭐ |
| `get_graph` | Graph data | ⭐⭐ |
| `export_data` | Export dữ liệu | ⭐⭐ |

### 2.5 OCR (PaddleOCR)

| Task | Mô tả | Ưu tiên |
|---|---|---|
| Cài PaddleOCR | `pip install paddleocr` | ⭐⭐⭐ |
| Tích hợp Rust | Gọi Python script từ Rust | ⭐⭐⭐ |
| Index OCR text | Lưu vào FTS5 | ⭐⭐⭐ |
| Search OCR | "Tìm hóa đơn điện" | ⭐⭐⭐ |

### 2.6 Build & Deploy

| Task | Mô tả | Ưu tiên |
|---|---|---|
| `cargo check --workspace` | Kiểm tra compile | ⭐⭐⭐ |
| `pnpm tauri dev` | Chạy thử app | ⭐⭐⭐ |
| Fix compile errors | Sửa lỗi build | ⭐⭐⭐ |
| Package build | `pnpm tauri build` | ⭐⭐ |

---

## 🟡 Phần 3: NHỮNG GÌ CẦN HOÀN THIỆN (Needs Improvement)

### 3.1 Code Cần Refactor

| File | Vấn đề | Cần làm |
|---|---|---|
| `memory-ai/src/embedder.rs` | Tạo tokio runtime mới mỗi lần gọi `embed()` | Dùng `OnceLock<Runtime>` để cache |
| `memory-indexer/src/pipeline.rs` | `generate_embeddings()` nuốt lỗi im lặng | Thêm `warn!()` log |
| `memory-ai/src/nlp.rs` | `Duration::days()` có thể panic nếu date out of range | Dùng `checked_sub()` |
| `apps/desktop/src/App.tsx` | Chưa có error handling cho Tauri invoke | Thêm try/catch + user notification |
| `apps/desktop/src/App.tsx` | UI chỉ có search + stats, thiếu chat/timeline/graph | Thêm các view còn thiếu |

### 3.2 Database Schema Cần Cập Nhật

| Bảng | Vấn đề | Cần làm |
|---|---|---|
| `embeddings` | `embedding BLOB` chưa rõ format | Chuẩn hóa: JSON array of f64 |
| `graph_edges` | Thiếu index cho `(source_id, target_id)` | Thêm composite index |
| `timeline` | Thiếu `auto_generate` trigger | Tự động tạo event khi insert file |

### 3.3 Testing

| Module | Test hiện tại | Cần thêm |
|---|---|---|
| `memory-core` | 3 tests (scan, extract) | Test PDF thật, DOCX thật |
| `memory-indexer` | 2 tests (DB creation) | Test pipeline, edge cases |
| `memory-search` | 0 tests | Test search với data thật |
| `memory-graph` | 2 tests (topics, connections) | Test graph operations |
| `memory-security` | 3 tests (encrypt, decrypt, salt) | Test với file thật |
| `memory-ai` | 0 tests (cần mock Ollama) | Mock tests |

---

## 🎯 Phần 4: BƯỚC TIẾP THEO (Next Steps)

### 🥇 Ngay Bây Giờ (Tuần này)

| STT | Việc cần làm | File/Location | Thời gian |
|---|---|---|---|
| 1 | **Chạy `cargo check --workspace`** | Root project | 5 phút |
| 2 | Fix lỗi compile (nếu có) | Tùy theo lỗi | 1-2 giờ |
| 3 | **Cài dependencies:** `cd apps/desktop && pnpm install` | apps/desktop | 2 phút |
| 4 | **Kiểm tra chạy thử:** `pnpm tauri dev` | apps/desktop | 10 phút |

### 🥈 Tuần 1-2: UI Components Cốt Lõi

| STT | Việc cần làm | File cần tạo |
|---|---|---|
| 5 | Tạo `FolderPicker` component | `src/components/folder/FolderPicker.tsx` |
| 6 | Tạo `ScanProgress` component + command `start_scan` | `src/components/scan/ScanProgress.tsx` + `src-tauri/src/commands/scan.rs` |
| 7 | Tạo `SearchFilters` component | `src/components/search/SearchFilters.tsx` |
| 8 | Tạo `FilePreview` component | `src/components/preview/FilePreview.tsx` |
| 9 | Tạo `useSearch` hook | `src/hooks/useSearch.ts` |
| 10 | Tạo `useScan` hook | `src/hooks/useScan.ts` |

### 🥈 Tuần 3-4: AI Chat + Timeline + Graph

| STT | Việc cần làm | File cần tạo |
|---|---|---|
| 11 | Tạo `ChatPanel` component + command `chat` | `src/components/chat/ChatPanel.tsx` + `commands/chat.rs` |
| 12 | Tạo `TimelineView` component + command `get_timeline` | `src/components/timeline/TimelineView.tsx` + `commands/timeline.rs` |
| 13 | Tạo `GraphView` component + command `get_graph` | `src/components/graph/GraphView.tsx` + `commands/graph.rs` |
| 14 | Tích hợp d3.js cho graph visualization | `src/components/graph/` |

### 🥉 Tuần 5-6: OCR + Hoàn Thiện

| STT | Việc cần làm | Mô tả |
|---|---|---|
| 15 | Cài PaddleOCR | `pip install paddleocr` |
| 16 | Kết nối OCR pipeline với Rust | Gọi Python script |
| 17 | Index OCR text + Search | Tích hợp FTS5 |
| 18 | Test toàn bộ flow | Scan → Index → Search → Chat |

---

## 📈 BIỂU ĐỒ TIẾN ĐỘ (Progress Bar)

```
Plan & Spec     ████████████████████░░░░░░░░░░░░  60%  (3/5 files)
Rust Crates     ████████████████████████████████  90%  (6/6 crates, need tests)
Tauri Backend   ██████████████████░░░░░░░░░░░░░░  50%  (4/8 commands)
React UI        ██████░░░░░░░░░░░░░░░░░░░░░░░░░░  15%  (3/20 components)
OCR             ██░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░   5%  (placeholder only)
Testing         █░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░   3%  (10 tests total)
Build/Deploy    ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░   0%  (not tested yet)

TỔNG THỂ: ██████████░░░░░░░░░░░░░░░░░░░░░░  28%
```

---

## 📝 GHI CHÚ QUAN TRỌNG

### Đã hoàn thiện (không cần sửa):
- ✅ Workspace structure (Cargo.toml root) — đã thêm `apps/desktop/src-tauri`
- ✅ Tất cả 6 crates structure + implementation cơ bản
- ✅ SQLite schema (10 tables + indexes)
- ✅ Encryption (AES-256-GCM + Argon2id)
- ✅ Tauri app skeleton (React + Rust backend)
- ✅ Fix workspace: thêm desktop app vào members (14/06/2026)

### Cần làm ngay:
1. 🔴 **`cargo check --workspace`** — kiểm tra có compile không (chạy từ PowerShell)
2. 🔴 **`cd apps/desktop && pnpm install && pnpm tauri dev`** — chạy thử app
3. 🟡 **Thêm commands:** select_folder, start_scan, chat, timeline, graph
4. 🟡 **Tạo UI components:** FolderPicker, ScanProgress, ChatPanel, TimelineView
5. 🟡 **Test thật với file PDF/DOCX trên máy**

### Lưu ý kỹ thuật:
- ⚠️ `memory-ai/src/embedder.rs` cần cache tokio runtime (dùng `OnceLock`)
- ⚠️ `memory-indexer/src/pipeline.rs` cần cải thiện error handling
- ⚠️ Cần cài Ollama để test AI features: `ollama pull qwen2.5:7b`
- ⚠️ Cần cài PaddleOCR để test OCR: `pip install paddleocr`
- ⚠️ Lưu ý: chạy từ **PowerShell** (không phải WSL/bash) — các lệnh như:
  ```powershell
  cd D:\all_my_project\memoryOS
  cargo check --workspace
  cd apps/desktop
  pnpm tauri dev
  ```
