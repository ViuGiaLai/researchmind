# ResearchMind VN — v0.5 Speed Plan

> **Ngày tạo:** 19/06/2026
> **Cập nhật:** 19/06/2026 — Bổ sung baseline metrics, điều chỉnh priority, thêm Tauri cold start, làm rõ định nghĩa done.
>
> **Mục tiêu:** Tăng tốc độ người dùng cảm nhận được trong mọi luồng chính.  
> v0.5 không ưu tiên thêm feature mới. Ưu tiên giảm thời gian chờ, giảm số lần click, giảm spinner, làm kết quả xuất hiện sớm hơn.

---

## 1. Đánh Giá Hiện Trạng

Code hiện tại đã có nhiều tối ưu nền:

| Nhóm | Trạng thái |
|---|---|
| Search hybrid | Có BM25 + vector + rerank cache |
| Chat | Có streaming và TTFT log |
| Verify | Có cache external academic và timing log |
| Import | Có job queue, retry, OCR status |
| Review | Có draft, section editor, export |
| Collections | Có collection/project và scope theo collection |
| Settings | Có model status và cache stats |

Tuy nhiên **chưa có baseline metrics**. Không có số → không biết cải thiện gì sau v0.5.  
Trước khi code Sprint 1, cần đo 5 baseline:

| Metric | Cách đo | Target v0.5 |
|---|---|---|
| Search latency (cached) | `console.time()` hoặc backend TIMING log | ≤ 200ms p50 |
| Search latency (fresh) | Backend TIMING log | ≤ 1.5s p50 |
| Library mount time (50 papers) | `performance.now()` ở mount | ≤ 300ms |
| TTFT chat | Frontend từ lúc gửi đến token đầu | ≤ 2s |
| Import throughput | Từ queued → ready | ≥ 3 files/phút |
| Verify end-to-end | Backend VERIFY_TIMING log | ≤ 6s (cache miss) / ≤ 0.5s (cache hit) |
| Python cold start | Backend startup log | ≤ 4s |

---

## 2. Các Điểm Nghẽn Tốc Độ Chính

### 2.1 Khởi động và vào màn hình đầu tiên

- App chờ health/setup/model status trước khi người dùng vào luồng chính.
- **Thiếu:** Xử lý Tauri cold start — Python backend spawn mất 3–8 giây, user thấy loading toàn màn hình.
- Một số tab nặng mount nhiều logic ngay khi mở.

### 2.2 Tìm kiếm và duyệt thư viện

- Search tải request đầy đủ, render list trực tiếp.
- Library có preview panel, related, highlights nặng.
- **Thiếu:** Virtualization cho list lớn (time bomb khi user có 200–500 papers).

### 2.3 Import và OCR

- Polling theo chu kỳ là chi phí nền lớn.
- Chưa tạo cảm giác "đang đi tới đâu" đủ tốt.

### 2.4 Chat / Verify / Review

- Streaming đã có từ v0.2 → token đầu đã xuất hiện sớm.
- Vấn đề thực tế: (1) cache theo paper_ids set để câu hỏi lặp trả lời trong <1s, (2) giảm retrieval latency trước generate.
- "Outline/skeleton" không phải vấn đề vì streaming đã cover perception gap.

### 2.5 Export và các tác vụ hậu kỳ

- Export đồng bộ ở phía người dùng.
- Chưa tái sử dụng dữ liệu đã có.

---

## 3. Cần Cải Thiện Những Gì

## 3.1 P0 - Giảm thời gian chờ người dùng thấy ngay

### A. Search phải phản hồi sớm hơn

- Debounce search suggestions rõ ràng, cancel request cũ.
- Render skeleton kết quả ngay lập tức thay vì chờ response.
- Cache query + filter + collection trong session.
- Ưu tiên trả top 3–5 trước, phần còn lại sau.

### B. Library phải mở nhanh hơn

- Chỉ tải phần cần cho list hiện tại.
- Trì hoãn related/highlights/preview cho đến khi chọn paper.
- Ghi nhớ page/filter/collection gần nhất.
- **Virtualize danh sách** — React Window hoặc TanStack Virtual.

### C. Import không chặn người dùng

- Hiển thị trạng thái theo event thay vì polling cứng.
- Tách rõ "đã lưu", "đang index", "đang OCR", "đã sẵn sàng".
- Cho phép tiếp tục làm việc trong lúc import chạy.

### D. Chat / Verify / Review phải có cảm giác "đã có phản hồi"

- Streaming sớm và ổn định (đã có từ v0.2, cần giữ vững).
- Cache theo paper_ids set để câu hỏi lặp trả lời trong <1s.
- Giảm retrieval latency trước generate.
- Review: section nào xong hiện ngay, không đợi toàn bộ draft.

## 3.2 P1 - Tối ưu đường đi thao tác

### A. Giảm số click

- Giữ last-open tab và last-used collection.
- Search/Library/Chat/Review có đường một click sang nhau.
- Từ preview paper có thể tạo review/verify/chat.

### B. Dọn màn hình khóa toàn trang

- Tab nặng dùng loading cục bộ, không khóa cả view.
- Chia nhỏ loading state theo panel.
- **Tauri cold start:** Show skeleton UI ngay trước khi backend ready.
- Lazy connect backend — user thấy Library từ SQLite cache trước, sau đó mới kết nối FastAPI.

### C. Cải thiện search filters

- Filter áp dụng nhanh tại client trước khi bắn request.
- Tránh request thừa khi đổi collection/author/year/tags.

### D. Cải thiện import/setup

- Tách detect setup, detect models, load model status ra background.

## 3.3 P2 - Tối ưu cảm nhận tốc độ cấp kiến trúc

### A. Memo hóa panel nặng

- Preview paper, Related papers, Highlights, Review section editors.

### B. Tối ưu request fan-out

- Khi mở paper, chỉ gọi API thật sự cần.
- Request không thiết yếu lazy load.

### C. Đồng bộ cache theo vòng đời dữ liệu

- Cache search/rerank, LLM, embedding, academic verification.
- Clear đúng lúc khi corpus thay đổi.

## 3.4 Ưu Tiên Bổ Sung Từ Audit Code Hiện Tại

Các điểm dưới đây không thay đổi mục tiêu chính của v0.5, nhưng nên đưa vào backlog ưu tiên vì có khả năng tạo khác biệt rõ với code hiện tại:

### A. Search Suggest SQL/cache

- `/api/search/suggest` không nên quét toàn bộ indexed papers rồi lọc trong Python khi thư viện lớn.
- Chuyển suggest sang SQL query có `LIMIT`, lọc title/tags ở database nếu có thể.
- Cache tags/title suggestions trong memory theo session hoặc theo corpus version.
- Clear cache suggest khi import/delete/update tags/title.

### B. Lazy warmup cross-encoder

- Không warmup cross-encoder ngay trong startup nếu làm tăng cold start hoặc chiếm RAM sớm.
- Lazy load cross-encoder ở lần search/rerank đầu tiên, hoặc warmup sau khi app đã vào UI và máy idle.
- Log riêng thời gian load cross-encoder để biết có phải bottleneck startup không.

### C. Lazy mount tab nặng

- Các tab nặng như Wow Analysis, Insights, Review Builder, Settings không nên mount hoặc chạy API phụ trước khi user mở tab.
- Chỉ mount tab khi active lần đầu, sau đó giữ state nếu cần.
- Tách loading theo panel/tab, tránh khóa toàn app vì dữ liệu của tab chưa dùng.

### D. Stream Review section

- Review builder hiện có thể generate nhiều section song song, nhưng UI nên nhận section nào xong thì hiển thị ngay.
- Dùng SSE/stream endpoint cho draft generation để emit từng section hoàn tất.
- Frontend cập nhật section editor theo event, không đợi toàn bộ draft xong mới render.

---

## 4. Thứ Tự Nên Làm

### Trước Sprint 1 — Baseline

1. Đo 5 baseline metrics (search latency p50/p95, TTFT, library mount, import throughput, verify e2e).
2. Xác nhận Saved Search đã implement chưa (v0.4 không có → bỏ khỏi v0.5).

### Sprint 1: Search và Library nhanh hơn

1. Debounce + cancel cho search suggestions.
2. Tối ưu `/api/search/suggest` bằng SQL `LIMIT` + cache tags/title.
3. Cache query/filter/result set theo session.
4. **Virtualize danh sách search và library (React Window)** — P2→P1.
5. Lazy load preview/related/highlights.

### Sprint 2: Import không chặn + Tauri cold start

1. Giảm polling thừa, chuyển sang event-based update.
2. Hiển thị tiến trình theo file rõ hơn.
3. Cho phép thao tác khác trong khi import chạy.
4. **Tauri cold start:** Skeleton UI + lazy connect backend.
5. Log Python spawn time.

### Sprint 3: Chat / Verify / Review phản hồi sớm

1. Streaming sớm và ổn định (giữ nguyên, đã có).
2. Cache theo paper_ids set / collection / query.
3. Giảm retrieval latency trước generate.
4. Reuse context thay vì dựng lại mỗi lần.
5. Review: stream từng section xong qua SSE/event, section nào xong hiện ngay.

### Sprint 4: Giảm thời gian vào app

1. Tách startup thành các mảnh nhẹ.
2. Không khóa app vì model status/stats.
3. Lazy mount tab nặng sau khi user mở tab.
4. Lazy warmup cross-encoder hoặc warmup sau khi app idle.
5. Log Python startup time và cross-encoder warmup time.

### Sprint 5: Quan sát tốc độ bằng số đo

1. Log search latency.
2. Log TTFT cho Chat/Verify/Review.
3. Log import throughput (queued → ready).
4. Log thời gian mở paper và render preview.
5. So sánh với baseline từ Trước Sprint 1.

---

## 5. Định Nghĩa v0.5 Done

v0.5 hoàn thành khi có **số đo cụ thể**, không phải cảm quan:

| Metric | Target |
|---|---|
| Search cache hit | ≤ 200ms |
| Search fresh query | ≤ 1.5s |
| Library mount (50 papers) | ≤ 300ms |
| TTFT chat | ≤ 2s |
| Import throughput | ≥ 3 files/phút |
| Verify cache hit | ≤ 0.5s |
| Verify cache miss | ≤ 6s |
| Python cold start | ≤ 4s |
| Virtualization | List 500 items không freeze |
| Skeleton UI | Xuất hiện trong < 500ms trước backend ready |

---

## 6. Ghi Chú Kỹ Thuật

- Ưu tiên trải nghiệm đọc và thao tác trước, không thêm feature mới.
- Giữ local-first và cache-first.
- Khi có mâu thuẫn giữa đẹp và nhanh, ưu tiên nhanh.
- **Virtualization implement ngay khi list còn nhỏ** — không đợi đến khi có 500 papers rồi mới fix.
- **Tauri cold start** là bottleneck lớn nhất khi mở app — ưu tiên ngang P1.
- Saved Search: v0.4 chưa implement → không optimize, không nhắc đến trong v0.5.
