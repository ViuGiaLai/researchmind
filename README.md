# ResearchMind VN

> Trợ lý nghiên cứu AI Local-First cho học giả Việt Nam.
> Hiểu nhanh, phản biện sâu, viết review tự động — tất cả chạy trên máy bạn.

ResearchMind VN là hệ thống quản lý tri thức học thuật cá nhân, chạy hoàn toàn offline. Hỗ trợ import, search, chat RAG, verify, và literature review — không gửi dữ liệu ra ngoài.

**Version hiện tại:** v0.4 · **Kế tiếp:** [v0.5 — Speed Plan](VERSION/VERSION_v0.5.md)

---

## Tính năng chính

### Import & Index
- Kéo thả PDF/DOCX/EPUB/TXT/MD/HTML — tự động parse, chunk, embedding
- Import Queue: theo dõi trạng thái từng file (queued → parsing → indexing → OCR → summarizing → ready)
- Retry từng file, OCR thủ công cho PDF scan
- Zotero SQLite sync — nhập thư viện metadata có sẵn

### Semantic Search
- Hybrid search: BM25 (FTS5) + Vector (ChromaDB) + Cross-Encoder rerank
- Search theo collection/author/year/tag/read status/starred
- Filter + sort nâng cao, saved search

### Chat RAG & Phản biện
- Chat với 1 paper hoặc nhiều paper cùng lúc, scope theo collection
- **Streaming** real-time, provider chain tự động fallback
- **Multi-layer cache:** LLM cache, embedding cache, rerank cache, academic cache — giảm latency lặp lại
- **Critique:** AI đánh giá hạn chế, lỗ hổng phương pháp
- **Debate:** Tranh luận đa chiều giữa nhiều Persona AI
- **Verify:** Tra cứu DOI → OpenAlex/Crossref/Semantic Scholar, cache + refresh

### Literature Review Builder
- Chọn papers → Generate draft theo 7 section (Background → Future Directions)
- Chỉnh sửa inline, regenerate từng section riêng
- Comparison matrix giữa các papers
- Export: DOCX / HTML / Markdown

### Library & Collections
- Collections/Projects — nhóm paper theo chủ đề, luận văn
- Highlights, ghi chú, tags
- Preview panel: abstract, metadata, related papers
- Gợi ý đọc hàng ngày

---

## Công nghệ

| Layer | Công nghệ |
|---|---|
| Desktop Shell | **Tauri v2** (Rust) |
| Frontend | React 18, TypeScript, Tailwind CSS, shadcn/ui, Recharts |
| Backend | Python 3.11+, FastAPI, Pydantic v2, SQLAlchemy |
| Embedding | bge-m3 (Sentence-Transformers) |
| Vector DB | ChromaDB |
| Full-text | SQLite FTS5 |
| Rerank | Cross-Encoder (tắt mặc định) |
| OCR | RapidOCR (ONNX) |
| LLM Providers | NVIDIA NIM, FreeModel, Groq, Gemini, Ollama (local), Claude API |

---

## Kiến trúc

```text
Tauri App (React)
    │
    ▼
FastAPI Backend ────────────────────────────────────────┐
    │                                                    │
    ├── ingestion/ (parser, chunker, embedder, OCR)     ├── data/
    ├── search/ (hybrid, reranker, cache)                  ├── papers/
    ├── chat/ (generator, provider chain)                   ├── chroma/
    ├── routers/ (papers, chat, search, verify, review)     ├── models/
    ├── db/ (SQLAlchemy models, migrations)                 └── researchmind.db
    └── academic/ (OpenAlex, Crossref, S2 clients)
```

---

## Cài đặt

### Yêu cầu
- Node.js 22+, pnpm
- Python 3.11+, Rust Stable, Tauri CLI

### Clone & cài
```bash
git clone https://github.com/your-org/researchmind.git
cd researchmind
pnpm install
cd backend && pip install -r requirements.txt
```

### Chạy
```bash
pnpm tauri dev
```

---

## Roadmap

| Version | Trọng tâm | Trạng thái |
|---|---|---|
| **v0.1** | Import, Search, Chat cơ bản | ✅ |
| **v0.2** | Streaming, Cache, Retry, Provider chain | ✅ |
| **v0.3** | Verify (OpenAlex/Crossref/S2), Critique, Debate | ✅ |
| **v0.4** | Import Queue, OCR UX, Review Builder, Collections | ✅ |
| **v0.5** | Speed: virtualization, cold start, debounce, lazy load | 🔜 |

Xem chi tiết từng version tại [`VERSION/`](VERSION/).

---

## Bảo mật

- Local-First: toàn bộ dữ liệu trên máy người dùng
- Không gửi PDF ra ngoài
- Có thể chạy hoàn toàn offline (dùng Ollama local)
- LLM cloud providers là optional, user chọn

---

## Giấy phép

MIT License
