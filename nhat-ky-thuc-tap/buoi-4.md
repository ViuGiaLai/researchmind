# Buổi 4 — Thứ 2, 22/06/2026

## Nội dung
- v0.5 Sprint 1: Search & Library speed optimization

## Đã làm
1. Debounce + cancel cho search suggestions — tránh request thừa khi gõ nhanh
2. Cache query/filter/result set theo session — search lặp lại trả trong <200ms
3. Virtualize danh sách search và library bằng React Window
4. Lazy load preview, related papers, highlights — chỉ tải khi user click
5. Render skeleton results ngay lập tức thay vì chờ response
6. Giảm số request khi đổi collection/author/year/tags

## Học được
- React Window virtualization pattern cho list lớn
- Debounce pattern cho search input
- Session cache strategy

## Kết quả đạt được
- Search cache hit: ≤200ms
- Library mount 50 papers: ≤300ms
- List 500 items không freeze nhờ virtualization

## Kế hoạch buổi sau
- Xử lý Tauri cold start + Import event-based update

---
**Ký tên:** Rmah Viu
