# Buổi 5 — Thứ 4, 24/06/2026

## Nội dung
- v0.5 Sprint 2: Tauri cold start + Import event-based update

## Đã làm
1. Xử lý Tauri cold start: skeleton UI xuất hiện ngay (<500ms) trước khi backend ready
2. Lazy connect backend: user thấy Library từ SQLite cache trước, sau đó mới kết nối FastAPI
3. Log Python spawn time để baseline
4. Import chuyển từ polling cứng sang event-based update
5. Import không chặn người dùng — cho phép thao tác khác trong lúc import chạy
6. Tách rõ trạng thái: "đã lưu", "đang index", "đang OCR", "đã sẵn sàng"

## Học được
- Tauri cold start bottleneck: Python spawn mất 3-8 giây
- Event-driven update pattern thay vì polling

## Kết quả đạt được
- Skeleton UI trong <500ms, Python cold start còn ≤4s
- Import không block UI

## Kế hoạch buổi sau
- Tối ưu Chat/Verify/Review speed: cache paper_ids, giảm retrieval latency

---
**Ký tên:** Rmah Viu
