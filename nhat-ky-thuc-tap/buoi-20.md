# Buổi 20 — Thứ 4, 29/07/2026

## Nội dung
- Build desktop app: Tauri bundle + PyInstaller backend

## Đã làm
1. Cấu hình Tauri build: Windows MSI installer, app icon
2. Bundle Python backend với PyInstaller thành single .exe
3. Tích hợp: Tauri spawn Python .exe thay vì chạy uvicorn riêng
4. Test bản build trên máy sạch (không có Python)
5. Fix lỗi đường dẫn, port conflict khi bundle
6. Optimize dung lượng: loại bỏ file không cần thiết khỏi bundle
7. Tạo installer với NSIS hoặc Inno Setup

## Học được
- PyInstaller build process cho FastAPI app
- Tauri production build + bundling
- Windows installer creation

## Kết quả đạt được
- ResearchMind VN chạy được như desktop app độc lập
- File cài đặt ~50-100MB (tuỳ model embedding có bundle hay không)

## Kế hoạch buổi sau
- Tổng kết đợt thực tập, viết báo cáo

---
**Ký tên:** Rmah Viu
