# Phát hành ResearchMind VN Desktop

ResearchMind VN là ứng dụng desktop chạy backend tại máy người dùng, mặc định chỉ nghe ở `127.0.0.1`. Đây không phải cấu hình triển khai web nhiều người dùng.

## Nguyên tắc bảo mật khi phát hành

- Không đóng gói file `.env` hoặc bất kỳ API key dùng chung nào vào installer.
- Người dùng tự thêm API key trong Cài đặt. Khóa được lưu trong cơ sở dữ liệu dữ liệu-cục-bộ của chính tài khoản hệ điều hành để dùng lại sau khi mở ứng dụng; API không trả lại giá trị khóa.
- Chỉ gửi khóa tới nhà cung cấp AI mà người dùng chọn để thực hiện yêu cầu. Không gửi khóa tới frontend hay log chúng.
- Ký mã installer và phát hành checksum là bước bắt buộc trước khi phân phối công khai.

## Tạo bản phát hành

Quy trình GitHub Actions tạo gói Windows NSIS, macOS app và Linux deb khi đẩy tag dạng `v*`. Workflow chỉ đóng gói backend executable và frontend; nó không lấy hoặc sao chép `DOTENV`/`.env`.

Trước khi tạo tag, chạy từ thư mục dự án:

```powershell
cd backend
..\.venv\Scripts\python.exe -m pytest tests/test_prompt_flow.py tests/test_graphrag.py tests/test_security_and_verify.py -q
..\.venv\Scripts\python.exe -m compileall -q main.py chat routers graph research

cd ..\apps\desktop
pnpm exec tsc --noEmit
pnpm exec vitest run
pnpm run validate:locales
pnpm build
```

## Kiểm thử chấp nhận thủ công

Trên một máy sạch, cài installer rồi xác nhận:

1. Ứng dụng mở được, backend báo sẵn sàng và không xuất hiện cửa sổ console.
2. Có thể thêm API key của một tài khoản thử nghiệm, kiểm tra kết nối, khởi động lại ứng dụng và dùng lại được cấu hình.
3. Có thể nhập PDF, trò chuyện có trích dẫn, mở PDF và khởi động lại mà dữ liệu vẫn còn.
4. Không có API key trong thư mục cài đặt, log, installer, hay tệp phát hành.
5. CORS và CSP không cho trang web bên ngoài gọi backend cục bộ.

Nếu định cung cấp dịch vụ AI dùng chung hoặc quản lý tài khoản người dùng, cần một backend máy chủ có xác thực và kho bí mật riêng; không được chuyển API key nhà cung cấp sang installer desktop.
