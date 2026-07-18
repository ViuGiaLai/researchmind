# Deploy backend lên Render

`render.yaml` và `Dockerfile` trong thư mục gốc tạo một Render web service chạy FastAPI với Persistent Disk tại `/var/data`. Disk này giữ PDF, SQLite và Chroma qua các lần deploy. Đây là cấu hình MVP một instance, không phải kiến trúc đa người dùng.

## Biến môi trường bắt buộc

Trong Render Dashboard, điền giá trị thật cho:

```text
GEMINI_API_KEY=<key cua ban>
RESEARCHMIND_CORS_ORIGINS=tauri://localhost,http://tauri.localhost
FIREBASE_PROJECT_ID=<firebase-project-id>
```

Không tạo hay upload `.env` vào repository hoặc desktop installer. Render inject biến môi trường vào container khi chạy.

Trong Render, tải Firebase service-account JSON lên **Environment → Secret Files** với tên `firebase-service-account.json`. Biến `GOOGLE_APPLICATION_CREDENTIALS` trong `render.yaml` đã trỏ tới `/etc/secrets/firebase-service-account.json`; file này chỉ có trong container backend, không xuất hiện trong desktop.

## Giới hạn an toàn hiện tại

Backend hiện có một kho PDF, SQLite và Chroma chung. Chỉ deploy cấu hình này cho tài khoản của bạn hoặc private beta có kiểm soát. Không mở công khai cho nhiều người dùng trước khi có đăng nhập, quota/rate limit và tách dữ liệu theo `user_id`.

Các API thao tác máy cục bộ (mở thư mục, di chuyển/xóa/reset dữ liệu, Zotero và rebuild FTS) chỉ chấp nhận client loopback; chúng sẽ bị từ chối trên Render.

## Sau deploy

1. Lấy URL `https://<service>.onrender.com`.
2. Sao chép `apps/desktop/.env.production.example` thành `.env.production`, thay URL rồi build desktop. Chỉ URL public được đặt trong `VITE_*`; mọi key đặt ở đó sẽ lộ trong bundle.
3. Chỉ thêm origin desktop thực tế vào `RESEARCHMIND_CORS_ORIGINS`; không dùng `*`.
4. Kiểm thử nhập PDF, chat, khởi động lại service và xác nhận dữ liệu vẫn còn trên disk.
