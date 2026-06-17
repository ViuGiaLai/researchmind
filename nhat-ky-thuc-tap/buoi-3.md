# Buổi 3 — Thứ 6, 19/06/2026

## Nội dung
- Xây dựng search engine: BM25 (SQLite FTS5) + Vector (ChromaDB) + Hybrid (RRF fusion)

## Đã làm
1. Code `search/bm25.py` — SQLite FTS5 full-text search với unicode61 tokenizer hỗ trợ tiếng Việt
2. Code `search/vector.py` — ChromaDB PersistentClient, collection paper_chunks, cosine distance HNSW index
3. Code `search/hybrid.py` — Reciprocal Rank Fusion, normalize BM25 + Vector scores về 0-1, RRF k=60
4. Thêm cross-encoder reranker (`cross-encoder/ms-marco-MiniLM-L-6-v2`) để rerank kết quả fusion
5. Viết API `POST /api/search` + `GET /api/search/suggest`
6. Test search với PDF tiếng Việt, kiểm tra kết quả

## Học được
- Cách hoạt động của FTS5 với unicode61 tokenizer
- Reciprocal Rank Fusion algorithm
- Cross-encoder reranking cho search relevance

## Kết quả đạt được
- Search engine hoàn chỉnh: BM25 → Vector → RRF → Cross-encoder rerank
- Search ra kết quả chính xác hơn từng method riêng lẻ

## Kế hoạch buổi sau
- Xây dựng RAG pipeline: retriever + generator

---
**Ký tên:** Rmah Viu
