# Buổi 2 — Thứ 4, 17/06/2026

## Nội dung
- Xây dựng backend core: database models, ingestion pipeline, search engine
- Fix lỗi ChromaDB, chuyển secret sang .env

## Đã làm
1. Thiết kế SQLAlchemy models: Paper, Chunk (FTS5), ChatHistory, Setting
2. Tạo ingestion pipeline: PDF parser (PyMuPDF → RapidOCR), chunker 512 tokens, embedder bge-m3
3. Xây dựng search engine: BM25 FTS5 + ChromaDB vector + Hybrid RRF fusion
4. Thêm cross-encoder reranker rerank kết quả
5. Code search API: `POST /api/search` + `GET /api/search/suggest`
6. Fix ChromaDB `clear_collection` — tạo lại collection ngay sau xoá
7. Chuyển config sang `.env`, xoá hardcoded API key
8. Tạo frontend UI: sidebar, API client (`api.ts`), App.tsx với các tabs

## Học được
- SQLAlchemy + SQLite FTS5 setup với unicode61 tokenizer tiếng Việt
- Reciprocal Rank Fusion algorithm cho hybrid search
- ChromaDB internal cache behavior

## Kết quả đạt được
- Backend core hoàn chỉnh: models → ingestion → search
- Frontend core: sidebar + routing + API client
- Code sạch, không còn secret hardcode

## Kế hoạch buổi sau
- Hoàn thiện tất cả tính năng: RAG chat, verify, review builder, collections

---
**Ký tên:** Rmah Viu
