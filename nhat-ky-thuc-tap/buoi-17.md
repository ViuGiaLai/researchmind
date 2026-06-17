# Buổi 17 — Thứ 4, 22/07/2026

## Nội dung
- Testing toàn bộ luồng Import → Index → Search → Chat → Export

## Đã làm
1. Test import PDF: file picker, drag-drop, folder import, BibTeX, Zotero CSV
2. Test indexing pipeline: parser → chunker → embedder → ChromaDB + FTS5
3. Test search: BM25, Vector, Hybrid, cross-encoder reranker
4. Test chat: 4 modes (chat/review/critique/debate), 4 providers (Ollama/Gemini/DeepSeek/Claude)
5. Test export: HTML, DOCX, PDF, Markdown cho single paper + synthesis
6. Test citation generation: APA, IEEE, Vancouver, BibTeX, HTML
7. Test settings: save/load, API key validation, disk space
8. Test data management: clear data, reset app, move storage

## Học được
- Testing patterns cho RAG pipeline
- Edge cases: PDF không text (OCR fallback), paper trùng

## Kết quả đạt được
- Phát hiện và fix nhiều bug nhỏ
- Toàn bộ luồng chính hoạt động ổn định

## Kế hoạch buổi sau
- Fix bugs từ testing + UX improvements

---
**Ký tên:** Rmah Viu
