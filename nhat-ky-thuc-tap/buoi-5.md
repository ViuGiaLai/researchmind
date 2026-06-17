# Buổi 5 — Thứ 4, 24/06/2026

## Nội dung
- Tích hợp LLM providers: Ollama, Gemini, DeepSeek, Claude + streaming

## Đã làm
1. Code `chat/generator.py` — class Generator quản lý 4 providers
2. Tích hợp **Ollama** — HTTP API `/api/chat`, hỗ trợ streaming SSE
3. Tích hợp **Gemini** — REST API `generateContent`, streaming via SSE
4. Tích hợp **DeepSeek** — OpenAI-compatible `/chat/completions`
5. Tích hợp **Claude** — Anthropic SDK `messages.create`
6. Fallback chain: Cloud → local Ollama nếu cloud fail
7. System prompt tiếng Việt + citation format `[Paper Name, trang X]`
8. Citation extraction bằng regex từ response

## Học được
- Cách tích hợp nhiều LLM providers với interface chung
- SSE streaming pattern cho real-time response
- Prompt engineering cho academic citation

## Kết quả đạt được
- Chat RAG hoàn chỉnh với 4 providers, streaming, citation extraction
- Fallback tự động khi cloud fail

## Kế hoạch buổi sau
- Xây dựng API endpoints: paper CRUD, import, export

---
**Ký tên:** Rmah Viu
