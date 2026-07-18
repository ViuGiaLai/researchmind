# Commercial release checklist

## Thông tin bắt buộc phải điền

- [ ] Tên pháp nhân/cá nhân kinh doanh.
- [ ] Địa chỉ và mã số thuế.
- [ ] Hộp thư support và sales nhận thư thật.
- [ ] Domain ResearchMind thuộc quyền kiểm soát của nhà phát hành.
- [ ] Privacy, Terms và Refund đã được người có chuyên môn pháp lý rà lại.

## Build và bảo mật

- [ ] Tất cả CI jobs xanh trên commit phát hành.
- [ ] Không có env file, private signing key, provider key hoặc dữ liệu người dùng trong artifact.
- [ ] Windows installer được Authenticode code-sign.
- [ ] macOS app được Developer ID sign và notarize.
- [ ] SHA-256 checksum được GitHub Release công bố.
- [ ] Secret scan và dependency license audit hoàn tất.
- [ ] Cài mới, nâng cấp và gỡ cài đặt được test trên máy sạch.

## Chấp nhận sản phẩm

- [ ] Import PDF, DOCX, EPUB và image hoạt động.
- [ ] Index, search và citation mở đúng trang.
- [ ] Trial bắt đầu đúng một lần và hết hạn đúng.
- [ ] License hợp lệ kích hoạt offline; token bị sửa hoặc hết hạn bị từ chối.
- [ ] Free features vẫn dùng được sau trial.
- [ ] Backup, restore và xóa dữ liệu được kiểm tra.
- [ ] Cloud AI disclosure khớp dữ liệu thực sự gửi đi.

## Thanh toán và hỗ trợ

- [ ] Webhook payment xác minh chữ ký và idempotency.
- [ ] Đơn hàng test phát hành license đúng plan và thời hạn.
- [ ] Hoàn tiền thu hồi license.
- [ ] Email giao license không chứa private key.
- [ ] Quy trình hỗ trợ và SLA đã có người chịu trách nhiệm.
