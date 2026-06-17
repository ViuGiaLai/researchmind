# Buổi 19 — Thứ 2, 27/07/2026

## Nội dung
- Bảo mật: chuyển secret sang .env, xoá khỏi lịch sử git

## Đã làm
1. Tạo `backend/.env` + `apps/desktop/.env` chứa toàn bộ cấu hình
2. Xoá hardcoded Gemini API key khỏi `settings.py`
3. Xoá API key cũ khỏi toàn bộ lịch sử git bằng `git filter-repo`
4. Force push lên GitHub
5. Tạo `.env.example` cho cả backend và frontend
6. Cập nhật `api.ts` đọc `VITE_BACKEND_URL` từ env thay vì hardcode
7. Viết nhật ký thực tập đầy đủ 21 buổi

## Học được
- Git filter-repo để xoá secret khỏi lịch sử
- Pydantic Settings + Vite env pattern

## Kết quả đạt được
- Code an toàn, không còn secret trong repo
- Sẵn sàng public/open source

## Kế hoạch buổi sau
- Build desktop app với PyInstaller + Tauri bundle

---
**Ký tên:** Rmah Viu
