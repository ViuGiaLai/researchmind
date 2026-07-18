Với ResearchMind local-first, mình đề xuất thứ tự này:

  1. Chốt mô hình sản phẩm

  - Dữ liệu nghiên cứu luôn local theo từng máy.
  - Tài khoản chỉ là tùy chọn: đăng nhập Google/email để nhận diện, không dùng để chia sẻ hay sync tài liệu.
  - Không bắt buộc Render/Firebase backend khi người dùng chỉ dùng local. Điều này giúp app chạy được cả khi không
    có mạng.

  2. Làm backup và khôi phục dữ liệu

  Đây là việc quan trọng nhất trước khi phát hành:

  - Nút “Sao lưu dữ liệu ResearchMind”.
  - Xuất toàn bộ PDF, SQLite, Chroma, cấu hình thành một file backup.
  - Nút khôi phục backup.
  - Tự nhắc backup định kỳ.
  - Hiển thị rõ vị trí thư mục dữ liệu.

  3. Hoàn thiện quản lý tài khoản local

  Trang Tài khoản hiện đã có nền tảng. Nên bổ sung tiếp:

  - Hiển thị dung lượng dữ liệu local.
  - Nút mở thư mục dữ liệu.
  - Nút xuất/xóa dữ liệu local có xác nhận hai bước.
  - Cho phép dùng app không đăng nhập nếu chỉ dùng local.
  - Ghi rõ: “Tài khoản không tự đồng bộ tài liệu lên cloud”.

  4. Đảm bảo bảo mật trước release

  - Thu hồi ngay Firebase service-account key đã từng bị lộ trong chat và tạo key mới.
  - Không commit .env, JSON service account, API key.
  - Bản installer không chứa API key dùng chung.
  - Người dùng tự nhập API key của họ trong Cài đặt, hoặc dùng local model.

  5. Test bản cài đặt thật

  Cài .exe trên một máy Windows sạch và test đầy đủ:

  - Mở app, đăng nhập/đăng xuất.
  - Google OAuth.
  - Nhập PDF, chat, restart app, dữ liệu vẫn còn.
  - Backup rồi restore.
  - Không có console window hoặc lỗi CORS.
  - Không có key trong thư mục cài đặt.

  6. Sau đó mới phát hành beta

  Nên phát hành private beta cho khoảng 5-10 người trước. Thu phản hồi về:

  - Tốc độ import PDF.
  - Chất lượng chat/citation.
  - Lỗi model/API key.
  - Backup/khôi phục.
  - Giao diện tài khoản và onboarding.

  Theo mình, bước tiếp theo nên làm ngay là Backup & Restore dữ liệu local. Đây là phần người dùng ResearchMind cần
  nhất, vì dữ liệu nghiên cứu nằm trên máy của họ.
