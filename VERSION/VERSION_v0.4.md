# ResearchMind VN — v0.4 Improvement Plan

> **Ngày tạo:** 19/06/2026
>
> **Mục tiêu:** Hoàn thiện các phần v0.1-v0.3 còn thiếu hoặc mới code một phần, tập trung vào độ tin cậy khi dùng thật: import chắc chắn, Verify có chứng cứ, review/export dùng được cho luận văn, OCR rõ ràng, và đo được hiệu năng.

---

## 1. Tổng Quan Đối Chiếu

### Những phần đã có trong code hiện tại

| Nhóm | Trạng thái |
|---|---|
| Multi-format import | Đã có PDF/DOCX/DOC/TXT/MD/HTML/EPUB |
| OCR cơ bản | Đã có RapidOCR fallback trong PDF parser |
| Chat streaming | Đã có cho Chat |
| Verify streaming | Đã có cho Verify |
| Provider retry | Đã có `_call_with_retry()` |
| LLM cache | Đã có `LLMCache` |
| Embedding cache | Đã có `EmbeddingCache` + query LRU cache |
| Academic Verify | Đã có OpenAlex + Crossref + Semantic Scholar |
| Literature matrix | Đã có bước so sánh trong Insights |
| Export | Đã có HTML/DOCX/synthesis export |

### Những phần còn thiếu hoặc chưa đủ tốt

| Nhóm | Thiếu sót cần đưa vào v0.4 |
|---|---|
| Import UX | Chưa có import queue/history rõ ràng, retry từng file, log lỗi thân thiện |
| OCR UX | Chưa có chế độ OCR thủ công, progress OCR, retry OCR, lưu trạng thái scanned |
| Verify | Chưa có refresh/invalidate academic cache từ UI, chưa benchmark latency/cache |
| Literature Review Builder | Mới có matrix, chưa có workspace chỉnh sửa và xuất review hoàn chỉnh |
| Rerank cache | Chưa cache kết quả rerank theo query/chunk ids |
| Latency metrics | Chưa có time-to-first-token, provider latency, cache hit rate |
| Collections/projects | Library chưa có project/collection cho luận văn/chủ đề |
| Search | Filter/sort nâng cao còn hạn chế; chưa có saved search |
| Robust JSON parsing | Compare/highlights phụ thuộc JSON từ LLM, fallback còn mỏng |

---

## 2. Mục Tiêu v0.4

### Mục tiêu sản phẩm

Người dùng có thể:

1. Import nhiều tài liệu và biết chính xác tài liệu nào đã sẵn sàng.
2. OCR tài liệu scan mà không phải đoán lỗi.
3. Verify claim/paper với nguồn ngoài và refresh metadata khi cần.
4. Tạo Literature Review có thể chỉnh sửa và export ra DOCX/HTML/Markdown.
5. Quản lý tài liệu theo project/collection thay vì một thư viện phẳng.

### Mục tiêu kỹ thuật

| Chỉ số | Target |
|---|---|
| Import status | 100% file có trạng thái rõ: queued/parsing/indexing/ocr/summarizing/ready/failed |
| Retry import | Retry từng file không cần import lại cả batch |
| Verify degraded mode | Không crash khi OpenAlex/Crossref/S2 fail |
| Cache benchmark | Request DOI cache hit có log latency |
| Chat first token | Ghi log TTFT cho từng provider |
| JSON parse fallback | Không để UI trống nếu LLM trả JSON lỗi |

---

## 3. Phase 1 — Import Queue & OCR UX

### 3.1 Import Queue

**Cần code:**

| File | Việc |
|---|---|
| `backend/db/models.py` | Thêm bảng `ImportJob` hoặc `ProcessingJob` |
| `backend/routers/papers.py` | Ghi job status khi import/index/summary/enrich |
| `backend/routers/system.py` hoặc `papers.py` | Endpoint `GET /api/jobs` và `POST /api/jobs/{id}/retry` |
| `apps/desktop/src/components/import/ImportPanel.tsx` | Hiển thị queue/history, retry từng file |

**Trạng thái đề xuất:**

```text
queued → saved → parsing → indexing → summarizing → enriching → ready
                                      ↘ failed
                                      ↘ needs_ocr
```

### 3.2 OCR Mode

Hiện tại parser tự OCR khi trang scan có text ngắn. v0.4 cần biến OCR thành tính năng người dùng hiểu được.

**Cần code:**

| File | Việc |
|---|---|
| `backend/ingestion/parser.py` | Trả metadata OCR: pages_ocr_count, pages_failed_ocr |
| `backend/routers/papers.py` | Nếu parse text quá ít, set status `needs_ocr` thay vì failed mơ hồ |
| `apps/desktop/src/components/library/LibraryView.tsx` | Badge “PDF scan”, nút “Chạy OCR lại” |
| `apps/desktop/src/components/import/ImportPanel.tsx` | Progress OCR theo file |

**Không làm ở v0.4:** OCR layout/table phức tạp. Chỉ cần text layer đủ cho search/chat.

---

## 4. Phase 2 — Verify Polish

### 4.1 Cache Refresh

v0.3 spec có `cache_invalidate_doi()` nhưng chưa có endpoint/UI.

**Cần code:**

| File | Việc |
|---|---|
| `backend/routers/academic.py` | Thêm `DELETE /api/academic/cache/{doi}` |
| `apps/desktop/src/lib/api.ts` | Thêm `invalidateAcademicCache(doi)` |
| `VerifyPanel.tsx` | Nút refresh metadata cho từng DOI |

### 4.2 Verify Benchmark & Status

**Cần log:**

```text
VERIFY_TIMING retrieve=... doi_extract=... openalex=... crossref=... s2=... generate=... total=...
VERIFY_CACHE doi=... oa=hit/miss cr=hit/miss
```

**Mục tiêu UI:**

- Hiển thị “verified by OpenAlex/Crossref/Semantic Scholar”.
- Hiển thị “external data unavailable” mà không làm người dùng nghĩ app lỗi.
- Cho biết nguồn nào hit cache.

---

## 5. Phase 3 — Literature Review Builder

Hiện tại `InsightsView` đã có Literature Matrix. v0.4 cần nâng lên thành workflow “chọn paper → tạo review → chỉnh sửa → export”.

### 5.1 Backend

**Endpoint đề xuất:**

| Endpoint | Mục đích |
|---|---|
| `POST /api/review/builder/draft` | Tạo draft literature review theo section |
| `POST /api/review/builder/matrix` | Tạo/refresh matrix |
| `POST /api/review/builder/export` | Export DOCX/HTML/Markdown |

**Section chuẩn:**

```text
Background
Related Work
Methodology Comparison
Findings
Limitations
Research Gaps
Future Directions
Bibliography
```

### 5.2 Frontend

**Component đề xuất:**

```text
components/review/
├── ReviewBuilderView.tsx
├── ReviewSectionEditor.tsx
├── ReviewMatrixTable.tsx
└── ReviewExportPanel.tsx
```

**UX cần có:**

- Chọn project/papers.
- Generate từng section riêng.
- User chỉnh sửa text.
- Re-generate section riêng, không mất toàn bộ draft.
- Export DOCX/HTML/Markdown.

---

## 6. Phase 4 — Library Projects & Saved Search

### 6.1 Collections / Projects

Người dùng làm luận văn thường có nhiều chủ đề. Thư viện phẳng sẽ nhanh rối.

**Cần code:**

| File | Việc |
|---|---|
| `backend/db/models.py` | Thêm `Collection`, `CollectionPaper` |
| `backend/routers/papers.py` hoặc `routers/collections.py` | CRUD collection |
| `LibraryView.tsx` | Sidebar collection/project |
| `ChatView.tsx` | Scope: current papers / collection / whole library / external |

### 6.2 Search Filters

**Cần thêm:**

- Filter theo author.
- Filter theo year range.
- Filter theo tag/read status/starred.
- Sort theo year, imported date, title.
- Saved search.

---

## 7. Phase 5 — Performance & Reliability

### 7.1 Rerank Cache

v0.2 đã nêu nhưng chưa code.

**Cần code trong `backend/search/hybrid.py`:**

```text
key = hash(query + ordered chunk_ids)
value = reranked scores/order
invalidate when indexed corpus changes
```

Chỉ cần in-memory LRU trước, chưa cần SQLite.

### 7.2 Provider Timeout & TTFT

**Cần code:**

| File | Việc |
|---|---|
| `backend/config/settings.py` | Thêm timeout per provider hoặc global |
| `backend/chat/generator.py` | Dùng timeout setting cho HTTP calls |
| `backend/routers/chat.py` | Log time-to-first-token khi streaming |
| `SettingsView.tsx` | Hiển thị provider latency/status |

### 7.3 Robust LLM JSON

Các chỗ cần cứng hơn:

- `backend/routers/insights.py` compare JSON parsing.
- `backend/routers/papers.py` highlights JSON parsing.

**Yêu cầu:** Nếu JSON fail, vẫn trả markdown/text fallback để UI không trống.

---

## 8. Thứ Tự Làm Khuyến Nghị

```text
Sprint 1: Import Queue + OCR status
  ├── Job model/status endpoints
  ├── ImportPanel queue UI
  └── Library retry/needs_ocr badges

Sprint 2: Verify Polish
  ├── Academic cache invalidation endpoint
  ├── VerifyPanel refresh/cache status
  └── VERIFY_TIMING logs

Sprint 3: Literature Review Builder
  ├── Review draft endpoint
  ├── Section editor UI
  └── Export workflow

Sprint 4: Collections + Search Filters
  ├── Collection model/API
  ├── Library collection UI
  └── Saved search/filter UI

Sprint 5: Performance hardening
  ├── Rerank LRU cache
  ├── Provider timeout settings
  └── JSON fallback paths
```

---

## 9. Định Nghĩa v0.4 Done

v0.4 hoàn thành khi:

- Import batch 20 file có status rõ cho từng file.
- File scan được báo `needs_ocr` hoặc OCR progress, không fail mơ hồ.
- User có thể retry import/OCR từng file.
- VerifyPanel có nút refresh DOI và không crash khi external API fail.
- Log Verify timing/cache hit xuất hiện ở backend.
- Review Builder tạo được draft theo section và export DOCX/HTML/Markdown.
- Library có ít nhất collection/project cơ bản.
- TypeScript build và Python compile pass.

---

## 10. Ghi Chú Kỹ Thuật

- Giữ local-first: cache và job state nằm trong SQLite local.
- Không thêm cloud sync/team collaboration ở v0.4.
- Không redesign UI lớn; chỉ thêm workflow rõ ràng cho các tính năng đã có.
- Ưu tiên thông báo lỗi và trạng thái xử lý hơn thêm AI mode mới.

