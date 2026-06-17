# Buổi 2 — Thứ 4, 17/06/2026

## Nội dung
- Setup project backend FastAPI + database models + config
- Fix lỗi ChromaDB và onboarding, chuyển secret sang .env

## Đã làm
1. Tạo cấu trúc backend: FastAPI app, pydantic settings, CORS middleware
2. Thiết kế SQLAlchemy models: Paper, Chunk (FTS5), ChatHistory, Setting
3. Tạo ingestion pipeline: PDF parser (PyMuPDF → RapidOCR fallback), chunker (512 tokens), embedder (bge-m3)
4. Fix lỗi ChromaDB `clear_collection` — tạo lại collection ngay sau xoá
5. Fix luồng onboarding wizard không hiển thị do bug `finally` block trong `App.tsx`
6. Chuyển config sang `backend/.env`, xoá hardcoded Gemini key khỏi code

## Học được
- SQLAlchemy + SQLite FTS5 setup
- ChromaDB internal cache behavior
- Pydantic Settings + .env pattern

## Kết quả đạt được
- Backend core: models + database + ingestion pipeline hoạt động
- Code sạch, không còn secret hardcode

## Kế hoạch buổi sau
- Xây dựng search engine (BM25 + vector + hybrid)

---
**Ký tên:** Rmah Viu
