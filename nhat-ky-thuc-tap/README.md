# Nhật ký thực tập — Rmah Viu

- **Nhóm:** 1 (T2 - T4 - T6, sáng 8h→11h30)
- **Mentor:** Anh Trương Công Hiến
- **Đợt:** 15/06/2026 → 01/08/2026 (7 tuần — 21 buổi)

---

## Tuần 1 — Hoàn thành v0.1 → v0.4 (15/06 → 20/06)

> Dự án hoàn thành trước kế hoạch 6 tuần. Toàn bộ tính năng cốt lõi (import, search, chat RAG, verify, critique, debate, review builder, collections) đã có trong tuần đầu.

| Buổi | Ngày | Nội dung thực tế |
|------|------|------------------|
| [1](buoi-1.md) | T2 15/06 | Lập kế hoạch + khởi tạo dự án, backend, frontend, Tauri |
| [2](buoi-2.md) | T4 17/06 | Backend core: models, ingestion, search engine, hybrid search |
| [3](buoi-3.md) | T6 19/06 | Hoàn thành v0.1-v0.4: streaming, cache, verify, review builder, collections |

## Tuần 2 — v0.5: Speed Optimization (22/06 → 27/06)

| Buổi | Ngày | Nội dung |
|------|------|----------|
| [4](buoi-4.md) | T2 22/06 | Search & Library speed: debounce, cache, virtualization |
| [5](buoi-5.md) | T4 24/06 | Tauri cold start + Import event-based |
| [6](buoi-6.md) | T6 26/06 | Chat/Verify/Review speed: cache paper_ids, giảm retrieval latency |

## Tuần 3 — v0.5: Hoàn thiện tốc độ (29/06 → 04/07)

| Buổi | Ngày | Nội dung |
|------|------|----------|
| [7](buoi-7.md) | T2 29/06 | Giảm thời gian vào app: lazy load, skeleton UI |
| [8](buoi-8.md) | T4 01/07 | Baseline metrics logging: search/chat/import latency |
| [9](buoi-9.md) | T6 03/07 | Tổng kết v0.5, so sánh metrics, báo cáo tốc độ |

## Tuần 4 — Phase 2: Tính năng mới (06/07 → 11/07)

| Buổi | Ngày | Nội dung |
|------|------|----------|
| [10](buoi-10.md) | T2 06/07 | Lên kế hoạch Phase 2: nghiên cứu Stripe, key activation |
| [11](buoi-11.md) | T4 08/07 | Inline PDF preview + highlights UI |
| [12](buoi-12.md) | T6 10/07 | Multi-document comparison nâng cao |

## Tuần 5 — Hoàn thiện Phase 2 (13/07 → 18/07)

| Buổi | Ngày | Nội dung |
|------|------|----------|
| [13](buoi-13.md) | T2 13/07 | Thu phí: Stripe integration, key activation flow |
| [14](buoi-14.md) | T4 15/07 | Performance optimization: knowledge graph |
| [15](buoi-15.md) | T6 17/07 | UX nâng cao: onboarding cải tiến, tooltip, shortcut |

## Tuần 6 — Kiểm thử & Sửa lỗi (20/07 → 25/07)

| Buổi | Ngày | Nội dung |
|------|------|----------|
| [16](buoi-16.md) | T2 20/07 | Testing toàn bộ luồng Phase 1 + Phase 2 |
| [17](buoi-17.md) | T4 22/07 | Fix bugs, UX improvements |
| [18](buoi-18.md) | T6 24/07 | Performance profiling + optimization |

## Tuần 7 — Hoàn thiện & Báo cáo (27/07 → 01/08)

| Buổi | Ngày | Nội dung |
|------|------|----------|
| [19](buoi-19.md) | T2 27/07 | Build desktop app: Tauri bundle + PyInstaller |
| [20](buoi-20.md) | T4 29/07 | Viết báo cáo thực tập, chuẩn bị demo |
| [21](buoi-21.md) | T6 31/07 | Tổng kết, demo với mentor, kế hoạch phát triển |

---

## Tổng kết dự án sau 21 buổi

### ✅ Đã xây dựng (đến cuối tuần 1)
| Hạng mục | Chi tiết |
|----------|----------|
| **Backend** | FastAPI — 40+ API endpoints, 10+ routers |
| **Search** | BM25 FTS5 + ChromaDB vector + RRF fusion + Cross-encoder reranker |
| **RAG Chat** | 4 LLM providers, streaming SSE, cache LLM/embedding/academic |
| **AI Features** | Review, Critique, Debate, Verify (OpenAlex/Crossref/S2) |
| **Import** | PDF/DOCX/EPUB/MD/HTML/TXT, queue + retry, OCR |
| **Review Builder** | Draft 7 section, inline editor, matrix, export DOCX/HTML/MD |
| **Collections** | Project/collection CRUD, saved search, filter nâng cao |
| **Frontend** | React + Tauri v2 — 10 views, onboarding 5-step |

### 🚀 Kế hoạch tiếp theo (tuần 2-7)
- v0.5: Speed optimization (virtualization, cold start, cache, lazy load)
- Phase 2: Knowledge Graph, inline PDF preview, thu phí
- Kiểm thử, build desktop, báo cáo

### 📁 Cấu trúc file nhật ký
```
nhat-ky-thuc-tap/
├── README.md         ← Mục lục 21 buổi
├── mau-buoi.md       ← Template copy cho buổi mới
├── buoi-{1..21}.md   ← Nhật ký từng buổi
```
