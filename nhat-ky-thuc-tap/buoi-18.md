# Buổi 18 — Thứ 6, 24/07/2026

## Nội dung
- Performance profiling + optimization cuối cùng

## Đã làm
1. Profile memory usage: phát hiện memory leak trong ChromaDB client
2. Fix memory leak: đóng ChromaDB client sau mỗi request lớn
3. Profile CPU: tối ưu reranker threshold
4. Profile frontend: phát hiện re-render không cần thiết
5. Tối ưu React: React.memo, useMemo, useCallback cho component nặng
6. Tối ưu bundle size: dynamic import cho view ít dùng
7. Kiểm tra lại tất cả metrics target v0.5 vẫn đạt

## Học được
- Memory profiling pattern cho Python + React app
- React re-render optimization

## Kết quả đạt được
- Memory usage giảm 30%
- Bundle size giảm 20%
- Tất cả metrics target v0.5 đạt

## Kế hoạch buổi sau
- Build desktop app: Tauri bundle + PyInstaller

---
**Ký tên:** Rmah Viu
