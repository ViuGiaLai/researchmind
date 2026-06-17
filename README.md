# ResearchMind VN

> ResearchMind không chỉ giúp bạn đọc PDF. Nó giúp bạn hiểu nhanh, phản biện sâu và khám phá những ý tưởng nghiên cứu mới từ toàn bộ thư viện tài liệu của bạn.

ResearchMind VN là hệ thống trợ lý nghiên cứu AI Local-First dành cho sinh viên cao học, nghiên cứu sinh và giảng viên Việt Nam. Toàn bộ dữ liệu được lưu trữ và xử lý cục bộ trên máy tính nhằm đảm bảo quyền riêng tư và bảo mật tuyệt đối.

## Tính năng chính

### 📥 Import & Indexing PDF
* Kéo và thả file PDF để AI phân tích tức thì.
* Tự động trích xuất cấu trúc văn bản khoa học.
* Lập chỉ mục thông minh đảm bảo bảo mật 100% cục bộ trên ổ đĩa của bạn.

### 🔍 Tìm kiếm ngữ nghĩa (Semantic Search)
* Tìm kiếm ý tưởng bằng ngôn ngữ tự nhiên (tiếng Việt & tiếng Anh).
* Truy hồi chính xác thuật ngữ khoa học và nội dung theo ngữ cảnh.
* Định vị chính xác số trang và trích dẫn nguồn.

### 💬 Trò chuyện RAG & Phản biện học thuật (Chat AI & Critique)
* Đặt câu hỏi trực tiếp trên một hoặc nhóm nhiều bài báo cùng lúc.
* **Tóm tắt nhanh:** Trích xuất nhanh Background, Methods, Findings của tài liệu.
* **Phản biện khoa học:** AI đánh giá điểm hạn chế, lỗ hổng phương pháp và giả thiết chưa hợp lý.
* **Tranh luận học thuật:** Giả lập tranh luận đa chiều giữa các Persona AI nhằm gợi mở hướng nghiên cứu mới.

### 📚 Quản lý thư viện tri thức cá nhân
* Ghi chú và phân loại tài liệu bằng thẻ tags trực quan.
* Nhập nhanh thư viện siêu dữ liệu từ Zotero.
* **Xây dựng liên kết:** Khám phá sự liên kết tri thức chéo giữa các bài nghiên cứu.
* **Gợi ý đọc mỗi ngày:** Gợi ý paper đáng đọc nhất mỗi ngày kèm tóm tắt nội dung sẵn có.

---

# Kiến trúc hệ thống

## Luồng Import PDF

User Upload PDF

↓

Tauri UI (React)

↓

FastAPI Backend

↓

PyMuPDF Parser

↓

Chunking (512 tokens)

↓

bge-m3 Embedder

↓

├── SQLite (Metadata)

├── SQLite FTS5 (Full-text Search)

└── ChromaDB (Vector Database)

## Luồng Chat với Paper (RAG)

User Question

↓

Query Processing

↓

Hybrid Search

├── BM25 (SQLite FTS5)

└── Vector Search (ChromaDB)

↓

Cross-Encoder Re-ranker

↓

LLM (Qwen / Claude / Ollama)

↓

Answer + Citation

↓

User

---

# Công nghệ sử dụng

## Frontend

* React 19
* TypeScript
* Tailwind CSS
* shadcn/ui
* Tauri v2

## Backend

* Python 3.11+
* FastAPI
* Pydantic

## AI & Search

* PyMuPDF
* bge-m3
* ChromaDB
* SQLite FTS5
* Cross Encoder Re-ranker
* Ollama
* Claude API (Optional)

---

# Cấu trúc thư mục

```text
researchmind/
├── apps/
│   └── desktop/
│       ├── src/
│       └── src-tauri/
│
├── backend/
│   ├── ingestion/
│   ├── search/
│   ├── chat/
│   └── db/
│
├── data/
│   ├── papers/
│   ├── chroma/
│   └── researchmind.db
│
├── models/
│
└── docs/
```

---

# Cài đặt

## Yêu cầu

* Node.js 22+
* pnpm
* Python 3.11+
* Rust Stable
* Tauri CLI

## Clone dự án

```bash
git clone https://github.com/your-org/researchmind-vn.git

cd researchmind-vn
```

## Cài đặt Frontend

```bash
pnpm install
```

## Cài đặt Backend

```bash
cd backend

pip install -r requirements.txt
```

## Chạy Development

```bash
pnpm tauri dev
```

---

# Hybrid Search

ResearchMind sử dụng chiến lược tìm kiếm kết hợp:

```text
Final Score =
α × BM25 Score
+
(1 - α) × Vector Similarity
```

Ưu điểm:

* Hiểu ngữ nghĩa câu hỏi
* Tìm chính xác từ khóa kỹ thuật
* Tăng độ chính xác retrieval
* Hoạt động tốt với tiếng Việt

---

# Bảo mật

ResearchMind được thiết kế theo triết lý Local-First:

* Dữ liệu mặc định lưu trên máy người dùng
* Không gửi PDF lên server
* Không chia sẻ dữ liệu nghiên cứu với bên thứ ba
* Có thể hoạt động hoàn toàn offline

---

# Roadmap

## MVP

* [x] Import PDF
* [x] Semantic Search
* [x] Chat với Paper
* [x] Library Management

## Giai đoạn tiếp theo

* [ ] Zotero Integration
* [ ] OCR cho PDF Scan
* [ ] Multi-document Comparison
* [ ] Knowledge Graph
* [ ] Team Collaboration
* [ ] Cloud Sync

---

# Đối tượng sử dụng

* Nghiên cứu sinh
* Sinh viên cao học
* Giảng viên đại học
* Nhóm nghiên cứu
* Viện nghiên cứu

---

# Giấy phép

MIT License

Copyright (c) ResearchMind VN

---

# Tóm tắt Đề tài & Định hướng Phát triển

| TÊN ĐỀ TÀI | LÝ DO CHỌN | NGÔN NGỮ THỰC HIỆN | SINH VIÊN CÓ Ý KIẾN, YÊU CẦU THÊM |
| :--- | :--- | :--- | :--- |
| **ResearchMind VN**<br>*(Trợ lý nghiên cứu AI Local-first cho học giả Việt Nam)* | - Học viên cao học & NCS phải đọc hàng trăm tài liệu mỗi năm nhưng gặp khó khăn khi tìm kiếm ngữ nghĩa, kết nối ý tưởng chéo và tóm tắt luận điểm.<br>- Các công cụ cloud (NotebookLM, Notion AI) dễ lộ dữ liệu nghiên cứu nhạy cảm, hỗ trợ tiếng Việt kém hoặc chi phí cao.<br>- **Giải pháp**: Xây dựng trợ lý AI chạy offline hoàn toàn (Local-first), bảo mật dữ liệu tuyệt đối và tối ưu cho tiếng Việt. | - **Python**: Backend & Core AI Pipeline (*FastAPI, PyMuPDF, ChromaDB, SQLite, Sentence-Transformers*).<br>- **Rust**: Desktop Shell (*Tauri v2* giúp app siêu nhẹ).<br>- **TypeScript/JavaScript**: Frontend UI (*React 19, Tailwind CSS, shadcn/ui*). | - Định hướng sản phẩm không chỉ là "nhớ + search + chat" mà phải tập trung vào **"giúp hiểu + giúp nghĩ + giúp viết"**.<br>- **Yêu cầu thêm các tính năng đột phá (Killer Features)**:<br>  1. *Auto Literature Review Builder*: Tự động tổng hợp tài liệu (Background, Methods, Gaps, Insights) giúp tiết kiệm 50-70% thời gian đọc.<br>  2. *AI Phản biện (Critical Thinking)*: Đánh giá điểm hạn chế, lỗ hổng phương pháp của bài báo.<br>  3. *Debate Mode (AI vs AI)*: Tranh luận đa chiều giữa các Persona AI để gợi mở hướng đi mới.<br>  4. *Xuất báo cáo đa định dạng*: Cho phép xuất kết quả ra Word (`.docx`), Web (`.html`), Markdown (`.md`).<br>  5. *Tích hợp thêm*: Zotero Import và OCR cho PDF scan ở các giai đoạn tiếp theo. |
