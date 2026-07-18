# Thanh toán và phát hành license

## Bảo mật khóa ký

- Không đưa RESEARCHMIND_LICENSE_PRIVATE_KEY vào repository, Vite env, GitHub Actions build desktop hoặc installer.
- Desktop chỉ chứa LICENSE_PUBLIC_KEY; public key có thể phân phối công khai.
- Private key chỉ tồn tại trong secret manager của máy quản trị hoặc payment backend.

## Paid beta bằng VietQR/chuyển khoản

Tạo cặp khóa một lần trên máy quản trị:

    python scripts/issue_license.py --generate-keypair

Sau khi xác nhận giao dịch, đặt private key trong biến môi trường của phiên quản trị và phát hành license:

    python scripts/issue_license.py --email customer@example.com --plan pro --days 365

Gửi token cho khách hàng. Khách hàng mở **Cài đặt → Bản quyền & gói sử dụng**, dán token và kích hoạt.

## Tích hợp PayOS hoặc cổng khác

Payment backend phải:

1. Nhận webhook qua HTTPS.
2. Xác minh chữ ký webhook theo tài liệu chính thức của nhà cung cấp.
3. Kiểm tra trạng thái thanh toán, số tiền, mã đơn và chống xử lý lặp.
4. Phát hành license bằng cùng định dạng với scripts/issue_license.py.
5. Gửi token qua email hoặc trang hoàn tất đơn hàng.
6. Lưu license ID, order ID, email, plan, hạn sử dụng và trạng thái hoàn tiền.

Không tin plan hoặc số tiền từ frontend. Không phát hành license trước khi webhook được xác minh.
