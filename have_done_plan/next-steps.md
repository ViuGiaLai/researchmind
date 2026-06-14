# MemoryOS — 🚀 Các Bước Tiếp Theo

> **Mục tiêu ngắn hạn:** Chạy được `cargo check --workspace` + `pnpm tauri dev`

---

## 🥇 Bước 1: Kiểm Tra Build (LÀM NGAY)

> ✅ **Đã fix:** Thêm `"apps/desktop/src-tauri"` vào `workspace.members` trong root `Cargo.toml`

Chạy từ **PowerShell** (không phải WSL/bash):

```powershell
# 1. Kiểm tra Rust workspace có compile không
cd D:\all_my_project\memoryOS
cargo check --workspace

# Nếu có lỗi, sửa theo thông báo của compiler
# Các lỗi thường gặp:
# - Thiếu dependency → thêm vào Cargo.toml
# - Sai tên module → kiểm tra mod.rs / lib.rs
# - Sai kiểu dữ liệu → sửa type
```

**Expected output:** `Finished checking` (không có lỗi)

---

## 🥇 Bước 2: Cài Frontend & Chạy Thử

```bash
# 2. Cài dependencies
cd apps/desktop
pnpm install

# 3. Chạy thử (sẽ mở cửa sổ desktop)
pnpm tauri dev
```

**Expected:** Cửa sổ MemoryOS hiện ra với:
- Header: "🧠 MemoryOS"
- Search bar: '🔎 "Tìm file PDF về Docker tháng trước"...'
- Footer: "🔒 0 file được upload lên Internet"

---

## 🥇 Bước 3: Tạo UI Components Còn Thiếu

Sau khi app chạy được, tạo các component theo thứ tự:

### 3.1 FolderPicker + ScanProgress

```bash
# Tạo thư mục components
mkdir -p apps/desktop/src/components/folder
mkdir -p apps/desktop/src/components/scan

# File cần tạo:
apps/desktop/src/components/folder/FolderPicker.tsx
apps/desktop/src/components/folder/FolderList.tsx
apps/desktop/src/components/scan/ScanButton.tsx
apps/desktop/src/components/scan/ScanProgress.tsx
```

### 3.2 Tauri Commands Cho Scan

```bash
# File cần tạo trong src-tauri/src/commands/:
commands/scan.rs   → start_scan, stop_scan, get_scan_progress
commands/index.rs  → delete_index
commands/chat.rs   → chat, get_chat_history
```

### 3.3 AI Chat + Timeline + Graph

```bash
# Components:
src/components/chat/ChatPanel.tsx
src/components/timeline/TimelineView.tsx
src/components/graph/GraphView.tsx

# Commands:
commands/chat.rs      → chat()
commands/timeline.rs   → get_timeline()
commands/graph.rs     → get_graph()
```

---

## 🥈 Bước 4: Cài Tools Cần Thiết

```bash
# Rust
rustup update

# Node.js (kiểm tra)
node --version  # cần >= 20

# pnpm
npm install -g pnpm

# Ollama (cho AI)
winget install Ollama  # hoặc tải từ ollama.com
ollama pull qwen2.5:7b

# PaddleOCR (cho OCR)
pip install paddleocr
```

---

## 🥉 Bước 5: Chạy Unit Tests

```bash
# Test tất cả crates
cargo test --workspace

# Test riêng từng crate
cargo test -p memory-core
cargo test -p memory-security
cargo test -p memory-graph
cargo test -p memory-ai
cargo test -p memory-indexer
```

**Expected:** ~10 tests pass (hiện tại đã viết sẵn)

---

## 🎯 Checklist Hàng Ngày

- [ ] `cargo check --workspace` — không lỗi compile?
- [ ] Code xong 1 component?
- [ ] Code xong 1 command?
- [ ] Chạy thử app: `pnpm tauri dev`?
- [ ] Commit code?

---

## 📅 Lộ Trình 6 Tuần

| Tuần | Mục tiêu | Check |
|---|---|---|
| **Tuần 1** | ✅ Build được + App chạy | ☐ |
| **Tuần 2** | ✅ FolderPicker + Scan + Index hoạt động | ☐ |
| **Tuần 3** | ✅ Search + Filters + Preview | ☐ |
| **Tuần 4** | ✅ AI Chat hoạt động (Ollama) | ☐ |
| **Tuần 5** | ✅ Timeline + Graph UI | ☐ |
| **Tuần 6** | ✅ OCR + Hoàn thiện + Test | ☐ |

---

> **Mỗi ngày chỉ cần:** Chọn 1 component hoặc 1 command từ `tracking.md`, code nó, chạy thử, commit.
> 
> **Nguyên tắc:** Không cố làm tất cả cùng lúc. Version 0.1 chỉ có 1 mục tiêu:
> *"Tìm file PDF về Docker mà tôi đọc khoảng tháng trước" — trong dưới 1 giây.*
