# ResearchMind VN — v0.3 Vision

> **Triết lý:** v0.1 = có feature · v0.2 = mượt + nhanh · v0.3 = AI trả lời ĐÚNG + có chứng cứ
>
> **Khác biệt cốt lõi:**
> - 99% app: `User → GPT → Answer` ❌
> - ResearchMind: `User → Data + Sources → LLM → Answer` ✅

---

## Mục lục

1. [Tổng quan v0.3](#1-tổng-quan-v03)
2. [Ba tầng tri thức](#2-ba-tầng-tri-thức)
3. [Tầng 1 — Knowledge của người dùng (Local RAG)](#3-tầng-1--knowledge-của-người-dùng-local-rag)
4. [Tầng 2 — Nguồn học thuật bên ngoài (Academic Knowledge)](#4-tầng-2--nguồn-học-thuật-bên-ngoài-academic-knowledge)
5. [Tầng 3 — AI Reasoning (LLM)](#5-tầng-3--ai-reasoning-llm)
6. [Core v0.3 — Chỉ 3 thứ phải làm](#6-core-v03--chỉ-3-thứ-phải-làm)
7. [Verify Mode — Flow chi tiết](#7-verify-mode--flow-chi-tiết)
8. [Ba chế độ chat](#8-ba-chế-độ-chat)
9. [UI cho v0.3](#9-ui-cho-v03)
10. [Sai lầm lớn nhất cần tránh](#10-sai-lầm-lớn-nhất-cần-tránh)
11. [Khi nào nên làm v0.3](#11-khi-nào-nên-làm-v03)
12. [Kết luận](#12-kết-luận)

---

## 1. Tổng quan v0.3

### Bản chất

```
v0.1 → có feature (30 endpoints, 7 providers, 6 formats)
v0.2 → mượt + nhanh (streaming, cache, retry)
v0.3 → "AI research thật" (verify + chứng cứ bên ngoài)
```

Product chuyển từ:

```
AI đọc PDF ❌
```

→

```
AI kiểm chứng + suy luận nghiên cứu ✅
```

### Có nên làm không?

| Câu hỏi | Trả lời |
|---------|---------|
| Có nên làm v0.3? | **✅ CÓ** |
| Có phải MVP không? | ❌ **KHÔNG** — làm sau v0.2 ổn định |
| Có làm full stack không? | ❌ **KHÔNG** — chỉ chọn cái đủ để khác biệt |
| Rủi ro? | Hệ thống khó, dễ fail UX nếu làm quá sớm |

### Decision

```
👉 v0.3 NÊN làm
👉 nhưng: làm nhỏ trước (OpenAlex + Crossref)
👉 KHÔNG build full system ngay
```

---

## 2. Ba tầng tri thức

Đây là kiến trúc quan trọng nhất của ResearchMind — phân biệt **3 tầng tri thức**:

```
┌─────────────────────────────────────────────────────────┐
│                    Tầng 3: AI Reasoning                  │
│                    (LLM viết báo cáo)                     │
│                                                          │
│  GPT · Claude · DeepSeek · Gemini · Ollama              │
│  → AI chỉ là người viết, KHÔNG phải nguồn sự thật       │
└──────────────────────────────────────────────────────────┘
                          ▲
                          │
┌─────────────────────────────────────────────────────────┐
│                Tầng 2: Academic Knowledge                 │
│              (Nguồn học thuật bên ngoài)                  │
│                                                          │
│  OpenAlex · Crossref · Semantic Scholar                 │
│  Retraction Watch · Unpaywall                           │
│  → Kiểm chứng + mở rộng kiến thức                       │
└──────────────────────────────────────────────────────────┘
                          ▲
                          │
┌─────────────────────────────────────────────────────────┐
│                  Tầng 1: Local Knowledge                  │
│              (Dữ liệu người dùng)                         │
│                                                          │
│  PDF · DOCX · TXT · MD · HTML · EPUB                    │
│  → Embedding → Vector Search → RAG                      │
└──────────────────────────────────────────────────────────┘
```

**Sai lầm lớn nhất:** Nhiều người chỉ có Tầng 3, bỏ qua Tầng 1 và Tầng 2:

```
User → GPT → Answer ❌  (không nguồn, không verify)
```

---

## 3. Tầng 1 — Knowledge của người dùng (Local RAG)

Đây là **80% use case hằng ngày**. Không cần internet.

### Nguồn

| Loại | Format | Parser |
|------|--------|--------|
| PDF | `.pdf` | PyMuPDF + OCR |
| Word | `.docx` `.doc` | python-docx |
| Text | `.txt` | UTF-8 |
| Markdown | `.md` | YAML frontmatter |
| HTML | `.html` `.htm` | lxml |
| EPUB | `.epub` | ebooklib |

### Flow hiện tại (v0.1)

```
User Documents
  → Chunk (512 tokens)
  → Embed (bge-m3)
  → ChromaDB (vector) + FTS5 (BM25)
  → RRF fusion + Cross-encoder rerank
  → LLM generate
  → Answer
```

### Ví dụ

```
User: "Trong 50 paper tôi đã đọc, paper nào dùng Transformer?"
→ Chỉ cần local RAG → answer trong 2-5s
```

### Trạng thái v0.1

| Thành phần | Trạng thái |
|------------|-----------|
| Import (6 formats) | ✅ Hoàn thành |
| Chunk + Embed | ✅ Hoàn thành |
| Hybrid Search (BM25 + Vector + RRF) | ✅ Hoàn thành |
| Cross-encoder rerank | ✅ Hoàn thành |
| RAG Chat | ✅ Hoàn thành |
| Streaming | 🔴 v0.2 |
| Cache | 🔴 v0.2 |

---

## 4. Tầng 2 — Nguồn học thuật bên ngoài (Academic Knowledge)

Đây là **CORE của v0.3** — thứ làm ResearchMind khác biệt hoàn toàn với các tool AI PDF khác.

### Tại sao cần Tầng 2?

LLM không phải nguồn sự thật. Khi user hỏi:

- *"Paper này có đáng tin không?"*
- *"Có bị retract chưa?"*
- *"Có nghiên cứu mới hơn không?"*
- *"Có ai phản bác paper này không?"*

→ Chỉ dùng LLM là **sai**. Cần nguồn dữ liệu học thuật thực tế.

### Các nguồn — Phân hạng

#### 🔴 Tier A — BẮT BUỘC (v0.3 core)

| Nguồn | Mô tả | API | Chi phí |
|-------|-------|-----|---------|
| **OpenAlex** | Citation count, papers liên quan, cited_by, references | REST API | Miễn phí |
| **Crossref** | Metadata chuẩn (DOI, tác giả, journal, năm) | REST API | Miễn phí |

#### 🟡 Tier B — NÊN LÀM (sau core)

| Nguồn | Mô tả | API | Chi phí |
|-------|-------|-----|---------|
| **Semantic Scholar** | Recommendation, citation graph, related papers | REST API | Miễn phí (rate limit) |

#### 🟢 Tier C — LÀM SAU

| Nguồn | Mô tả | API | Chi phí |
|-------|-------|-----|---------|
| **Retraction Watch** | Kiểm tra paper có bị retract không | API key | Có phí |
| **Unpaywall** | Tìm bản Open Access hợp pháp | REST API | Miễn phí |

### OpenAlex — Quan trọng nhất

**Theo mình là nguồn quan trọng nhất cho v0.3.**

Cho biết:

```
Paper A
  → OpenAlex

Cited by: 523 papers
Related works: 125 papers
Papers trích dẫn nó: 523
Papers mà nó trích dẫn: 47
```

#### API cần dùng

```text
GET https://api.openalex.org/works/doi/{doi}
  → citation_count
  → related_works
  → referenced_works

GET https://api.openalex.org/works?filter=cites:{paper_id}
  → danh sách paper trích dẫn paper này

GET https://api.openalex.org/works?filter=title.search:{query}
  → tìm paper theo title
```

### Crossref — Metadata + DOI check

Dùng để:

- **Validate paper**: DOI có tồn tại không?
- **Check metadata**: Tác giả, journal, năm có đúng không?
- **Lấy citation**: Crossref có citation count

#### API cần dùng

```text
GET https://api.crossref.org/works/{doi}
  → author, title, journal, year, citation_count

GET https://api.crossref.org/works?query={title}
  → tìm DOI từ title
```

---

## 5. Tầng 3 — AI Reasoning (LLM)

Đây chỉ là lớp suy luận. **AI không phải nguồn. AI chỉ là người viết báo cáo.**

```
User Question
  ↓
ResearchMind
  ├── PDF của user (Tầng 1)
  ├── OpenAlex (Tầng 2)
  ├── Crossref (Tầng 2)
  └── Semantic Scholar (Tầng 2)
  ↓
Đưa vào LLM
  ↓
Tổng hợp câu trả lời có dẫn chứng
```

### Providers (đã có từ v0.1)

| Provider | Vai trò |
|----------|---------|
| NVIDIA NIM | Cloud chính |
| FreeModel.dev | Cloud dự phòng |
| Groq | Cloud dự phòng |
| Gemini | Cloud dự phòng |
| Ollama | Local fallback |
| DeepSeek | Custom cloud |
| Claude | Custom cloud |

---

## 6. Core v0.3 — Chỉ 3 thứ phải làm

**KHÔNG làm full stack. CHỈ chọn cái "đủ để khác biệt".**

### ✅ 🥇 1. OpenAlex Integration

**Quan trọng nhất.** Chỉ cần 3 API:

```text
GET /works/{doi}           → citation count, related works
GET /works?filter=cites:   → papers trích dẫn nó
GET /works?search=         → tìm paper theo title
```

**File:** `backend/academic/openalex.py` (mới)

### ✅ 🥈 2. Crossref Integration

Dùng để:

- Validate DOI
- Check metadata
- Lấy thông tin journal

**File:** `backend/academic/crossref.py` (mới)

### ✅ 🥉 3. Verify Mode

Thêm chế độ chat mới — quan trọng nhất về mặt UX.

```
[💬 Chat thường]     ← v0.1 (local RAG)
[🔍 Verify nghiên cứu]  ← v0.3 (local + external)
```

**Flow Verify Mode:**

```
query
  → extract paper references từ context
  → tra OpenAlex cho mỗi paper
  → tra Crossref cho mỗi paper
  → combine external data + local context
  → LLM tổng hợp
  → answer có chứng cứ bên ngoài
```

### 🚫 KHÔNG làm ngay

| Tính năng | Lý do |
|-----------|-------|
| ❌ Semantic Scholar | Trùng OpenAlex, phức tạp hơn |
| ❌ Retraction Watch | Khó integrate, ít impact ban đầu |
| ❌ Full Deep Research | Dễ chậm + khó kiểm soát |

---

## 7. Verify Mode — Flow chi tiết

### Khi user hỏi: "Kết luận trong paper này có còn đúng không?"

ResearchMind **không trả lời ngay**. Nó làm:

```
1. Trích xuất claim chính từ paper
       ↓
2. Tìm DOI của paper
       ↓
3. Tra Crossref → verify metadata
       ↓
4. Tra OpenAlex → citation count + related works
       ↓
5. Tra OpenAlex → papers mới hơn citing paper này
       ↓
6. Tra OpenAlex → papers phản bác (nếu có)
       ↓
7. Đưa toàn bộ dữ liệu vào LLM
       ↓
8. LLM viết kết luận có chứng cứ
```

### Output

```
Kết luận này được hỗ trợ bởi 12 nghiên cứu
xuất bản từ 2022-2026.

Tuy nhiên có 3 nghiên cứu gần đây
cho thấy hiệu quả thấp hơn trong môi trường thực tế.

Nguồn:
- Paper A (2024) — ủng hộ
- Paper B (2025) — ủng hộ
- Paper C (2026) — phản bác ⚠️
```

### Luồng code (backend)

```python
@app.post("/api/verify")
async def verify_research(request: dict = Body(...)):
    # 1. Lấy context từ local RAG (Tầng 1)
    retrieval = await asyncio.to_thread(
        state.retriever.retrieve, query=message, paper_ids=paper_ids, top_k=5
    )

    # 2. Trích xuất DOI từ context
    dois = extract_dois(retrieval.context_text)

    # 3. Tra OpenAlex (Tầng 2)
    external_data = []
    for doi in dois:
        oa = await openalex_client.get_work(doi)
        cr = await crossref_client.get_work(doi)
        external_data.append({...})

    # 4. Combine + LLM
    combined_context = build_verify_context(retrieval.context_text, external_data)
    generation = await asyncio.to_thread(
        state.generator.generate, query=message, context_text=combined_context
    )

    return {"answer": ..., "citations": ..., "external_sources": external_data}
```

---

## 8. Ba chế độ chat

Giống ChatGPT hiện nay có: Chat thường · Search · Deep Research.

### Mode 1: Local Chat (nhanh) ✅ v0.1

```
Chỉ Tầng 1
→ ~1-3 giây
→ Không cần internet
```

### Mode 2: Verify Research 🆕 v0.3

```
Tầng 1 + OpenAlex + Crossref
→ ~3-8 giây
→ Cần internet
```

### Mode 3: Deep Research 🚫 Sau v0.3

```
Tầng 1 + OpenAlex + Crossref + Semantic Scholar + Retraction Check
→ ~10-30 giây
→ Cần internet
```

Thay vì mọi câu hỏi đều chạy tất cả nguồn — vừa tốn thời gian, vừa tốn quota API, vừa làm UX chậm.

---

## 9. UI cho v0.3

### Chat mode selector (đã có ở v0.1)

```
[💬 Chat thường]  [🔍 Verify nghiên cứu]
```

Hiện tại đã có mode selector: `chat` / `review` / `critique` / `debate`. Thêm `verify`.

### Verify mode — UI

```
┌─────────────────────────────────────────┐
│ 🔍 Verify Research Mode                  │
│                                          │
│ Paper này:                               │
│ ├── 📊 523 citations                     │
│ ├── 📄 3 papers phản bác gần đây        │
│ ├── 📚 12 papers ủng hộ                 │
│ └── ✅ Chưa bị retract                   │
│                                          │
│ → Kết luận:                              │
│   Kết luận vẫn đúng trong bối cảnh       │
│   hiện tại, nhưng cần thận trọng với     │
│   3 nghiên cứu gần đây phản bác...       │
│                                          │
│ 📚 Nguồn:                                │
│ ├── [Paper A] (OpenAlex)                 │
│ ├── [Paper B] (Local PDF)               │
│ └── [Paper C] (Crossref)                 │
└─────────────────────────────────────────┘
```

### Backend endpoints mới

```
POST /api/verify         → Verify research (local + OpenAlex + Crossref)
GET  /api/academic/doi   → Tra DOI qua Crossref
GET  /api/academic/paper → Tra paper qua OpenAlex
```

---

## 10. Sai lầm lớn nhất cần tránh

### ❌ Sai lầm 1: LLM là nguồn sự thật

```
User → GPT → Answer ❌
```

→ Không có nguồn. Không verify. Không citation.
→ Đây giống chatbot hơn là trợ lý nghiên cứu.

### ❌ Sai lầm 2: Gọi tất cả API mỗi lần chat

```
→ Chậm
→ Tốn quota
→ User không cần
```

**Giải pháp:** 3 chế độ rõ ràng (Local / Verify / Deep).

### ❌ Sai lầm 3: Làm full system ngay

```
→ Chậm product
→ Dễ fail UX
```

**Giải pháp:** Chỉ OpenAlex + Crossref, không làm Semantic Scholar hay Retraction Watch ngay.

---

## 11. Khi nào nên làm v0.3

### CHỈ làm khi đã có:

```
✅ Streaming mượt (v0.2)
✅ Tốc độ nhanh (v0.2)
✅ Retry + fallback ổn định (v0.2)
✅ Cache (v0.2)
✅ User dùng được
```

### Nếu chưa:

```
❌ Đừng đụng v0.3
```

### Luồng phát triển khuyến nghị

```
v0.1 → v0.2 → (v0.2 ổn) → v0.3
                       ↓
                  Nếu chưa ổn:
                  quay lại fix v0.2
```

---

## 12. Kết luận

### Tóm 1 câu

```
v0.2 = AI trả lời NHANH
v0.3 = AI trả lời ĐÚNG + có chứng cứ
```

### So sánh

| Tiêu chí | 99% app khác | ResearchMind v0.3 |
|----------|-------------|-------------------|
| Nguồn | LLM tự biên | OpenAlex + Crossref + PDF user |
| Verify | ❌ Không | ✅ Citation count, phản bác, retract |
| Chứng cứ | Có thể hallucinate | Luôn có DOI + link |
| Khác biệt | Chatbot | Research Assistant thật |

### Core v0.3 — Chỉ 3 thứ

```
1. OpenAlex Integration
2. Crossref Integration
3. Verify Mode (UI + flow)
```

### File structure cho v0.3

```
backend/
├── academic/                  # MỚI
│   ├── openalex.py           # OpenAlex API client
│   └── crossref.py           # Crossref API client
├── main.py                    # + /api/verify endpoint
└── chat/
    └── generator.py           # + verify prompt

frontend/
├── components/
│   └── chat/
│       └── ChatView.tsx       # + verify mode
└── lib/
    └── api.ts                # + verify API call
```

---

*Tạo bởi: opencode agent · 18/06/2026 · Dựa trên phân tích của Viu*
