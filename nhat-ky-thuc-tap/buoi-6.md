# Buổi 6 — Thứ 6, 26/06/2026

## Nội dung
- v0.5 Sprint 3: Chat/Verify/Review speed optimization

## Đã làm
1. Cache theo paper_ids set — câu hỏi lặp trả lời trong <1s
2. Giảm retrieval latency trước generate — cache chunk IDs theo query
3. Review: section nào xong hiện ngay, không đợi toàn bộ draft
4. Reuse context thay vì dựng lại mỗi lần chat
5. Streaming giữ vững ổn định (đã có từ v0.2)
6. TTFT chat: giữ ≤2s

## Học được
- Cache invalidation strategy cho RAG context
- Incremental rendering pattern cho review sections

## Kết quả đạt được
- Chat TTFT: ≤2s
- Verify cache hit: ≤0.5s, cache miss: ≤6s
- Review section render ngay khi generate xong

## Kế hoạch buổi sau
- Giảm thời gian vào app: lazy load panel nặng

---
**Ký tên:** Rmah Viu
