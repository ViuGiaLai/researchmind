# ResearchMind VN — v0.2 Vision

> **Cập nhật đối chiếu code — 19/06/2026:** Phần dưới ban đầu là vision. Đối chiếu với code hiện tại cho thấy v0.2 đã được triển khai một phần lớn:
>
> - **Streaming Chat:** đã có backend `StreamingResponse`, `Generator.stream_generate()`, frontend `api.chatStream()` và ChatView append chunk.
> - **Streaming Verify:** đã có `api.verifyStream()` và `Generator.stream_generate_verify()`.
> - **Retry logic:** đã có `_call_with_retry()` trong `backend/chat/generator.py` và được dùng cho provider chain.
> - **Cache embedding:** đã có `EmbeddingCache` trong DB, cache trong `ingestion/embedder.py`, và LRU cache query embedding trong `search/hybrid.py`.
> - **Cache LLM:** đã có `LLMCache` và Settings UI/API để xem/xóa cache.
> - **Cross-encoder:** lazy-load + tự unload sau idle, nhưng `enable_reranker` đang mặc định `False`; chưa có cache rerank result theo `(query, chunk_ids)`.
> - **Provider chain:** cloud_free hiện thử NVIDIA Kimi → NVIDIA DeepSeek → FreeModel → Groq → Gemini → Ollama fallback.
> - **Còn chưa đủ:** đo time-to-first-token chưa rõ, timeout provider chưa cấu hình từ Settings, Review/Critique/Debate chưa streaming, rerank cache chưa có.

> **Triết lý:** v0.1 = có feature · v0.2 = làm cho nó MƯỢT + NHANH + GIỐNG ChatGPT
>
> **Nguyên tắc:** KHÔNG thêm feature mới. Hãy làm cái đang có "xịn hơn".

---

## Mục lục

1. [Tổng quan v0.2](#1-tổng-quan-v02)
2. [Priority 1 — Streaming Chat (SSE)](#2-priority-1--streaming-chat-sse)
3. [Priority 2 — Tăng tốc độ (latency < 5s)](#3-priority-2--tăng-tốc-độ-latency--5s)
4. [Priority 3 — Retry logic + Fallback ổn định](#4-priority-3--retry-logic--fallback-ổn-định)
5. [Priority 4 — Fix lỗi provider (Groq + Gemini)](#5-priority-4--fix-lỗi-provider-groq--gemini)
6. [Priority 5 — Cache (tăng tốc ngay)](#6-priority-5--cache-tăng-tốc-ngay)
7. [Bonus — GPU cho Ollama + Insight async](#7-bonus--gpu-cho-ollama--insight-async)
8. [Roadmap v0.2](#8-roadmap-v02)
9. [Những gì KHÔNG làm ở v0.2](#9-những-gì-không-làm-ở-v02)

---

## 1. Tổng quan v0.2

### Trạng thái hiện tại (v0.1)

```
Feature: dư thừa (30+ endpoints, 7 providers, 6 formats import)
Tốc độ: chậm (8-15s cho chat response)
UX: đã có streaming cho Chat/Verify, các mode phân tích vẫn non-stream
Ổn định: đã có retry 1 lần cho provider chain, vẫn cần timeout/config rõ hơn
```

### Mục tiêu v0.2

| Chỉ số | Hiện tại | Mục tiêu v0.2 |
|--------|----------|---------------|
| First token | Đã streaming nhưng chưa đo chuẩn | ≤ 2-3s |
| Full response | Phụ thuộc provider/model/cache | ≤ 5s |
| UX Chat | Streaming từng chunk cho Chat/Verify | Giữ ổn định, thêm cancel/retry |
| Provider fail | Retry 1 lần rồi fallback | Cấu hình timeout và log rõ hơn |
| Groq + Gemini | Phụ thuộc API key user/env | Cần validation tốt hơn trong setup |
| Cross-encoder | Optional, mặc định tắt | Cache rerank result nếu bật |
| Embedding query | Đã LRU cache 128 entries | Theo dõi hit-rate/cache invalidation |

### Câu quan trọng nhất

```
👉 ĐỪNG làm thêm
👉 Hãy làm cho cái đang có "xịn hơn"
```

---

## 2. Priority 1 — Streaming Chat (SSE)

> **Mức độ:** 🔴 BẮT BUỘC
>
> **Tác động:** Biến UX từ "phèn" → giống ChatGPT

### Hiện tại

- Frontend mặc định gọi streaming cho `initialMode === "chat"`.
- Backend `/api/chat` nhận `stream: true` và trả `text/event-stream`.
- `api.chatStream()` dùng `fetch()` + `ReadableStream`; ChatView append chunk vào message hiện tại.
- Review/Critique/Debate chưa streaming.

### Cần làm

#### Backend

| Task | File | Mô tả |
|---|---|---|
| 1.1 | `routers/chat.py` | ✅ `/api/chat` nhận `stream=True` và dùng `StreamingResponse` |
| 1.2 | `chat/generator.py` | ✅ `stream_generate()` và `_stream_chain()` đã có |
| 1.3 | `api.ts` | ✅ `chatStream()` đã có |
| 1.4 | `ChatView.tsx` | ✅ append chunk, cursor streaming, error handler |
| 1.5 | Timing | ⏳ Chưa có metric time-to-first-token rõ ràng |

#### Frontend

| Task | File | Mô tả |
|---|---|---|
| 1.6 | `api.ts` | Thêm `chatStream()` function dùng `fetch()` + `ReadableStream` |
| 1.7 | `ChatView.tsx` | Gọi `chatStream()` khi `stream=true`, append dần vào message |
| 1.8 | `ChatView.tsx` | Xử lý loading state khi streaming (cursor nhấp nháy) |
| 1.9 | `ChatView.tsx` | Scroll xuống khi chunk mới đến |

### Streaming protocol

```
Backend → text/event-stream (SSE)

data: {"chunk": "Xin"}
data: {"chunk": " chào"}
data: {"chunk": " bạn"}
data: {"done": true, "model_used": "nvidia/...", "citations": [...]}
```

Frontend đọc stream, ghép chunk → append vào message hiện tại.

---

## 3. Priority 2 — Tăng tốc độ (latency < 5s)

> **Mức độ:** 🔴 BẮT BUỘC
>
> **Mục tiêu:** `first token ≤ 2-3s`, `full response ≤ 5s`

### Bottleneck hiện tại

```
User query
  → (1) BM25 search: ~0.01s ✅
  → (2) Vector search (embed query): ~2s ❌ (CPU, chạy mỗi lần)
  → (3) RRF fuse: ~0.001s ✅
  → (4) Cross-encoder rerank: ~1.5s ❌ (CPU, chạy mỗi lần)
  → (5) NVIDIA API call: ~5-12s ❌ (network latency)
  → (6) Parse response: ~0.01s ✅
                          ──────────
  Total: ~8.5-15.5s
```

### Cần làm

| Task | Bottleneck | Giải pháp | Tiết kiệm |
|---|---|---|---|
| 2.1 | (2) Embed query | ✅ `functools.lru_cache(maxsize=128)` trong `HybridSearch` | ~2s |
| 2.2 | (4) Cross-encoder | ⏳ Chưa có cache rerank result theo (query_hash, chunk_ids) | ~1.5s |
| 2.3 | (4) Cross-encoder | ✅ BM25/Vector top_k giảm còn 10 trước fuse/rerank | ~0.7s |
| 2.4 | (5) Provider timeout | ⏳ Chưa expose timeout config trong Settings | — |
| 2.5 | (5) Provider chain | ✅ Streaming cho Chat/Verify | ~5-8s perceived latency |

#### Cache embedding

```python
# backend/chat/retriever.py
from functools import lru_cache

@lru_cache(maxsize=128)
def _cached_embed_query(self, query: str) -> list[float]:
    return self.embedder.embed_query(query)
```

#### Cache rerank

```python
# backend/search/hybrid.py
import hashlib, json

_rerank_cache: dict[str, list[dict]] = {}

def _rerank_cached(self, query: str, results: list[dict]) -> list[dict]:
    key = hashlib.md5(
        (query + json.dumps([r["chunk_id"] for r in results], sort_keys=True)).encode()
    ).hexdigest()
    if key in _rerank_cache:
        return _rerank_cache[key]
    reranked = self._rerank(query, results)
    _rerank_cache[key] = reranked
    return reranked
```

---

## 4. Priority 3 — Retry logic + Fallback ổn định

> **Mức độ:** 🟡 QUAN TRỌNG
>
> **Hiện tại:** provider fail → `finish_reason="error"` → skip luôn ❌
>
> **Cần:** retry 1 lần → vẫn fail → mới skip

### Cần làm

| Task | File | Mô tả |
|---|---|---|
| 3.1 | `generator.py` | ✅ `_call_with_retry(func, max_retries=1)` wrapper |
| 3.2 | `generator.py` | ✅ Áp dụng trong provider chain chính |
| 3.3 | `generator.py` | ✅ Có log retry/lỗi |
| 3.4 | Settings | ⏳ Chưa có timeout setting truyền từ UI |

### Retry pattern

```python
def _call_with_retry(self, fn, *args, max_retries=1, **kwargs):
    for attempt in range(max_retries + 1):
        try:
            result = fn(*args, **kwargs)
            if result.finish_reason != "error":
                return result
            logger.warning(f"Attempt {attempt+1} failed: {result.finish_reason}")
        except Exception as e:
            logger.warning(f"Attempt {attempt+1} exception: {e}")
            if attempt == max_retries:
                raise
    return fn(*args, **kwargs)  # final attempt
```

---

## 5. Priority 4 — Fix lỗi provider (Groq + Gemini)

> **Mức độ:** 🟡 QUAN TRỌNG
>
> **Hiện tại:** Groq 401, Gemini key sai format → 2/5 providers trong chain chết

### Groq

- **Vấn đề:** Key `gsk_TIWorg0...` bị invalid (401)
- **Cần:** Copy key mới từ https://console.groq.com/keys
- **Cập nhật:** `backend/.env` → `GROQ_API_KEY=key_mới`

### Gemini

- **Vấn đề:** Key đang là OAuth token (`AQ.Ab8RN6K...`), cần Gemini API key (`AIza...`)
- **Cần:** Lấy key từ https://aistudio.google.com/apikey
- **Cập nhật:** `backend/.env` → `GEMINI_API_KEY=AIza...`

---

## 6. Priority 5 — Cache (tăng tốc ngay)

> **Mức độ:** 🟢 NẾU CÒN TIME

### Cần làm

| Task | File | Mô tả |
|---|---|---|
| 5.1 | `search/hybrid.py` | ✅ Cache `embed_query()` với LRU cache 128 entries |
| 5.2 | `ingestion/embedder.py` | ✅ Cache embedding vectors trong SQLite |
| 5.3 | `chat/generator.py` | ✅ Cache LLM responses trong SQLite |
| 5.4 | `search/hybrid.py` | ⏳ Chưa cache `_rerank()` với MD5 hash key |
| 5.5 | `search/hybrid.py` | ⏳ Chưa có invalidation riêng cho rerank cache vì cache chưa tồn tại |

---

## 7. Bonus — GPU cho Ollama + Insight async

> **Mức độ:** 🟢 NẾU CÒN TIME

### GPU cho Ollama

```powershell
# Set env var trước khi chạy Ollama
$env:OLLAMA_IGPU_ENABLE=1
ollama serve

# Kiểm tra
ollama run qwen2.5:7b --verbose
# → nếu thấy "GPU" trong log là thành công
```

### Insight async

Các endpoint còn blocking:
- `POST /api/insights/gap`
- `POST /api/insights/conflict`
- `POST /api/insights/topic`
- `POST /api/insights/evolution`

Fix: wrap `retrieve` + `generate` trong `await asyncio.to_thread()` (giống đã làm cho chat/search/review/critique/debate/highlights)

---

## 8. Roadmap v0.2

### Thứ tự làm

```
Tuần 1: Streaming (SSE)
  ├── ✅ Backend: routers/chat.py + StreamingResponse
  └── ✅ Frontend: chatStream + ChatView streaming

Tuần 2: Speed + Cache
  ├── ✅ Cache embed_query
  ├── ⏳ Rerank cache chưa làm
  └── ⏳ Measure latency/TTFT chưa đủ

Tuần 3: Retry + Fix providers
  ├── ✅ _call_with_retry wrapper
  ├── ⏳ Groq/Gemini phụ thuộc key người dùng
  └── ⏳ Cần validation/onboarding tốt hơn

Tuần 4: Bonus + Polish
  ├── GPU cho Ollama
  ├── Insight async
  └── Test + bug fixes
```

### Priority matrix

| Task | Effort | Impact | Làm ngay |
|------|--------|--------|----------|
| Streaming | 4 ngày | 🔥 UX từ phèn → xịn | ✅ Chat/Verify |
| Cache embed | 0.5 ngày | 🔥 Tiết kiệm ~2s | ✅ |
| Cache rerank | 0.5 ngày | 🔥 Tiết kiệm ~1.5s | ⏳ |
| Retry logic | 1 ngày | 🟡 Ổn định hơn | ✅ |
| Fix Groq key | 5 phút | 🟡 Thêm 1 provider | Phụ thuộc key |
| Fix Gemini key | 5 phút | 🟡 Thêm 1 provider | Phụ thuộc key |
| GPU Ollama | 15 phút | 🟢 Speed x2-3 cho local | Còn time |
| Insight async | 1 ngày | 🟢 Không block | Còn time |

---

## 9. Những gì KHÔNG làm ở v0.2

| Tính năng | Lý do |
|-----------|-------|
| ❌ Thêm feature mới | Đã quá nhiều, cần tối ưu cái đang có |
| ❌ Knowledge Graph | Quá nặng, chưa cần |
| ❌ AI fancy stuff | Không giúp user |
| ❌ UI redesign lớn | Tốn thời gian, UX hiện tại ổn |
| ❌ Dark mode | Có thể nhưng không priority |
| ❌ Export citation | Phase 3 roadmap, chưa cần |
| ❌ Mobile app | Desktop trước đã |

---

## Tổng kết

```
v0.1 = có feature (30+ endpoints, 7 providers, 6 formats)
v0.2 = làm cho nó MƯỢT + NHANH + GIỐNG ChatGPT
                    │         │          └── Streaming
                    │         └── Cache + tốc độ
                    └── Retry + ổn định
```

> **Nếu làm đúng v0.2 → app sẽ vượt 90% tool AI PDF ngoài kia**

---

*Tạo bởi: Viu · 18/06/2026*
