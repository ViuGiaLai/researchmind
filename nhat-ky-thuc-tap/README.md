# Nhật ký thực tập — Rmah Viu

- **Nhóm:** 1 (T2 - T4 - T6, sáng 8h→11h30)
- **Mentor:** Anh Trương Công Hiến
- **Đợt:** 15/06/2026 → 01/08/2026 (7 tuần — 21 buổi)

---

## Tuần 1 — Research & Lập kế hoạch (15/06 → 20/06)

| Buổi | Ngày | Nội dung |
|------|------|----------|
| [1](buoi-1.md) | T2 15/06 | Lập kế hoạch dự án, viết plan, thiết kế kiến trúc, chọn công nghệ |
| [2](buoi-2.md) | T4 17/06 | Setup FastAPI backend, database models, ingestion pipeline, fix lỗi ChromaDB |
| [3](buoi-3.md) | T6 19/06 | Xây dựng search engine: BM25 FTS5 + ChromaDB vector + Hybrid RRF fusion |

## Tuần 2 — Backend: RAG & API (22/06 → 27/06)

| Buổi | Ngày | Nội dung |
|------|------|----------|
| [4](buoi-4.md) | T2 22/06 | RAG Retriever: query → hybrid search → context building |
| [5](buoi-5.md) | T4 24/06 | LLM Generator: tích hợp Ollama + Gemini + DeepSeek + Claude, streaming |
| [6](buoi-6.md) | T6 26/06 | Paper CRUD, import/export, Zotero, citations, API key validation |

## Tuần 3 — Backend: AI Features (29/06 → 04/07)

| Buổi | Ngày | Nội dung |
|------|------|----------|
| [7](buoi-7.md) | T2 29/06 | AI Review, Critique, Debate endpoints + prompt engineering |
| [8](buoi-8.md) | T4 01/07 | Insights APIs + Personal Brain + Daily Reader |
| [9](buoi-9.md) | T6 03/07 | System management APIs: settings, health, Ollama, data management |

## Tuần 4 — Frontend: Core UI (06/07 → 11/07)

| Buổi | Ngày | Nội dung |
|------|------|----------|
| [10](buoi-10.md) | T2 06/07 | Setup React + Tauri, sidebar, API client, routing |
| [11](buoi-11.md) | T4 08/07 | Library view + Import panel (PDF, BibTeX, Zotero) |
| [12](buoi-12.md) | T6 10/07 | Search view + Chat view cơ bản |

## Tuần 5 — Frontend: AI Views (13/07 → 18/07)

| Buổi | Ngày | Nội dung |
|------|------|----------|
| [13](buoi-13.md) | T2 13/07 | Chat view hoàn chỉnh: review/critique/debate modes, citations, export |
| [14](buoi-14.md) | T4 15/07 | Insights view + WOW analysis 5-step pipeline |
| [15](buoi-15.md) | T6 17/07 | Personal Brain + Daily Reader + Settings view |

## Tuần 6 — Polish & Fix bug (20/07 → 25/07)

| Buổi | Ngày | Nội dung |
|------|------|----------|
| [16](buoi-16.md) | T2 20/07 | Onboarding Wizard 5-step + hardware scan + Ollama pull |
| [17](buoi-17.md) | T4 22/07 | Testing toàn bộ luồng Import → Index → Search → Chat → Export |
| [18](buoi-18.md) | T6 24/07 | Fix bugs, UX improvements, performance optimization |

## Tuần 7 — Hoàn thiện & Báo cáo (27/07 → 01/08)

| Buổi | Ngày | Nội dung |
|------|------|----------|
| [19](buoi-19.md) | T2 27/07 | Bảo mật: .env, git filter-repo, xoá secret khỏi history |
| [20](buoi-20.md) | T4 29/07 | Build desktop app: PyInstaller + Tauri bundle |
| [21](buoi-21.md) | T6 31/07 | Tổng kết, báo cáo, kế hoạch Phase 2 |

---

## Tổng kết dự án sau 21 buổi

### ✅ Đã xây dựng
| Hạng mục | Chi tiết |
|----------|----------|
| **Backend** | FastAPI — 42 API endpoints |
| **Search** | BM25 FTS5 + ChromaDB vector + RRF fusion + Cross-encoder reranker |
| **RAG Chat** | 4 LLM providers (Ollama, Gemini, DeepSeek, Claude), streaming SSE |
| **AI Features** | Review, Critique, Debate, Research Gap, Conflict, Topic, Evolution |
| **Import** | PDF (drag-drop + folder), BibTeX, Zotero CSV, OCR fallback |
| **Export** | HTML, DOCX, PDF, Markdown (single paper + synthesis) |
| **Frontend** | React + Tauri — 8 views, 5-step onboarding wizard |
| **Citations** | APA 7th, IEEE, Vancouver, BibTeX, HTML |

### 🚀 Kế hoạch tiếp theo
- Phase 2: Thu phí (Stripe), key activation
- Phase 3: Inline PDF preview, performance
- Phase 4: Multi-user, cloud sync

### 📁 Cấu trúc file nhật ký
```
nhat-ky-thuc-tap/
├── README.md         ← Mục lục 21 buổi
├── mau-buoi.md       ← Template copy cho buổi mới
├── buoi-{1..21}.md   ← Nhật ký từng buổi
```
