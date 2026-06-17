# Buổi 18 — Thứ 6, 24/07/2026

## Nội dung
- Fix bugs + UX improvements + performance optimization

## Đã làm
1. Fix lỗi ChromaDB collection stale cache sau clear data
2. Fix onboarding retry logic — loading screen biến mất sớm
3. Fix embedding model lazy-load blocking first search query
4. Cải thiện error messages khi backend không kết nối được
5. Tối ưu chunking: sentence-aware, paragraph-aware, section header detection
6. Tối ưu hybrid search: normalize scores trước RRF fusion
7. Tối ưu citation extraction regex
8. Thêm loading states + error boundary cho các views

## Học được
- Debug ChromaDB internal caching
- Performance optimization cho embedding và search pipeline

## Kết quả đạt được
- App ổn định hơn, ít lỗi, UX mượt hơn

## Kế hoạch buổi sau
- Chuyển config sang .env + bảo mật

---
**Ký tên:** Rmah Viu
