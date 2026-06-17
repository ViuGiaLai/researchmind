# Buổi 4 — Thứ 2, 22/06/2026

## Nội dung
- Xây dựng RAG pipeline: Retriever query expansion + context building

## Đã làm
1. Code `chat/retriever.py` — retrieval pipeline: query → hybrid search → build context
2. Format context: mỗi chunk có dạng `[Paper Title] (trang X) ... nội dung ...`
3. Xử lý fallback: nếu không đủ kết quả, thử search không reranker
4. Tích hợp retriever vào `POST /api/chat`
5. Test với câu hỏi thực tế, kiểm tra context trả về

## Học được
- Cách build context cho LLM từ chunk search results
- Query expansion strategies

## Kết quả đạt được
- Retriever hoạt động, context đầy đủ thông tin paper + page number

## Kế hoạch buổi sau
- Tích hợp LLM: generator hỗ trợ Ollama + Gemini + DeepSeek + Claude

---
**Ký tên:** Rmah Viu
