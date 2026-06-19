# Buổi 3 — Thứ 6, 19/06/2026

## Nội dung
- Hoàn thành v0.1 → v0.4: toàn bộ tính năng cốt lõi của ResearchMind VN

## Đã làm

### v0.1 — Core Features
1. Multi-format import: PDF/DOCX/EPUB/TXT/MD/HTML + folder drag-drop
2. NVIDIA NIM provider fix, async non-blocking ingestion
3. Library view + search view hoàn chỉnh

### v0.2 — Streaming & Cache
4. Streaming chat SSE: `Generator.stream_generate()` + `api.chatStream()`
5. LLM cache + Embedding cache (SQLite) + LRU query cache
6. Retry logic: `_call_with_retry()` provider chain fallback
7. Cross-encoder lazy load + auto unload after idle
8. Insight async processing, top_k reduction

### v0.3 — Verify & Phản biện
9. Academic clients: OpenAlex, Crossref, Semantic Scholar
10. Verify mode: tra DOI → 3 nguồn → synthesis
11. Critique: AI đánh giá hạn chế, lỗ hổng phương pháp
12. Debate: tranh luận đa chiều giữa các Persona AI
13. Background enrichment: tự động tra metadata sau import
14. Zotero SQLite sync: detect + import metadata

### v0.4 — Import Queue, OCR, Review Builder, Collections
15. ImportJob model + queue status (queued → parsing → indexing → OCR → ready)
16. OCR UX: progress, retry, is_scanned badge
17. Parallel PDF parsing + RapidOCR fallback
18. Literature Review Builder: draft 7 section, inline editor, matrix, export DOCX/HTML/MD
19. Collections/Projects CRUD + paper membership
20. Search filters nâng cao: author, year, tag, read status, sort, saved search
21. Verify polish: cache invalidation endpoint, refresh button, timing logs

## Học được
- Caching strategy cho RAG: LLM cache, embedding cache, academic cache, rerank cache
- Literature review generation: chunking strategy cho nhiều papers
- Tối ưu tốc độ: streaming, lazy load, parallel processing

## Kết quả đạt được
- **40+ API endpoints, 10+ routers, 10 frontend views**
- Toàn bộ luồng: Import → Index → Search → Chat → Verify → Review → Export
- TypeScript + Python build pass, không lỗi

## Kế hoạch buổi sau
- Bắt đầu v0.5: Speed optimization — search debounce, virtualization, cold start

---
**Ký tên:** Rmah Viu
