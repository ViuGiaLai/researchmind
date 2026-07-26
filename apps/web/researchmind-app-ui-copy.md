# UI Copy — ResearchMind Cloud (toàn bộ 15 trang `/app/*`)

> Giả định khi viết: dùng tiếng Việt làm ngôn ngữ chính (đúng định vị "cho nhà nghiên cứu Việt Nam"), có thể lưu trong `packages/i18n` làm locale `vi`, giữ `en` làm fallback nếu cần. Giọng văn: gọn, chuyên nghiệp, không hoa mỹ — đúng tinh thần "thẻ mục lục thư viện" đã dùng ở Landing/About.
>
> Cấu trúc mỗi trang gồm: **Tiêu đề** · **Mô tả phụ (dưới tiêu đề)** · **Empty state** (khi chưa có dữ liệu) · **Label các cột/nút chính** · **Ghi chú áp dụng**.

---

## 1. Dashboard

**Tiêu đề:** Dashboard

**Mô tả phụ:** Toàn cảnh không gian nghiên cứu của bạn — dữ liệu trực tiếp từ Desktop.

**Nhãn 4 stat card:**
| Card | Label chính | Label phụ (dưới số liệu) |
|---|---|---|
| 1 | Không gian làm việc | Đã đồng bộ từ Desktop |
| 2 | Báo cáo (cloud) | Đã publish công khai hoặc chia sẻ |
| 3 | Tài liệu (metadata) | Tổng số paper đã lưu chỉ mục |
| 4 | Dung lượng sao lưu | *(xem empty state riêng bên dưới)* |

**Empty state — khi chưa có dữ liệu nào:**
> **Chưa có dữ liệu đồng bộ**
> Mở ResearchMind Desktop và bật đồng bộ để thấy không gian làm việc, báo cáo và tài liệu của bạn ở đây.
> `[Xem hướng dẫn kết nối Desktop]`

**Trạng thái lỗi (thay cho raw error hiện tại):**
> **Không tải được dữ liệu**
> Đã có lỗi khi kết nối tới máy chủ. Vui lòng thử lại sau ít phút.
> `[Thử lại]`

**Panel "Latest activity" — empty state:**
> **Chưa có hoạt động nào**
> Các thay đổi đồng bộ từ Desktop sẽ hiển thị tại đây.

**Sửa lỗi số liệu hiện tại:** thay `undefined MB` → `0 MB`, thay `undefined events / 7d` → `0 sự kiện / 7 ngày` khi chưa có backup nào.

---

## 2. Workspaces

**Tiêu đề:** Không gian làm việc

**Mô tả phụ:** Không gian nghiên cứu được liên kết với cloud và trạng thái đồng bộ.

**Ô tìm kiếm (placeholder):** Tìm không gian làm việc...

**Empty state (đúng với ảnh chụp hiện tại — đang thiếu):**
> **Chưa có không gian làm việc nào**
> Mở ResearchMind Desktop, tạo một không gian làm việc và bật đồng bộ để nó xuất hiện tại đây.
> `[Xem hướng dẫn]`

**Header cột (khi có dữ liệu):**
`Tên` · `Số tài liệu` · `Trạng thái đồng bộ` · `Cập nhật lúc` · `Thao tác`

**Nhãn trạng thái đồng bộ (badge màu):**
| Trạng thái kỹ thuật | Nhãn hiển thị | Màu gợi ý |
|---|---|---|
| `local_only` | Chỉ trên máy | Xám |
| `syncing` | Đang đồng bộ... | Vàng |
| `synced` | Đã đồng bộ | Xanh lá |
| `conflict` | Xung đột | Đỏ |
| `backup_available` | Có bản sao lưu | Xanh dương |
| `archived` | Đã lưu trữ | Xám nhạt |

**Modal xử lý Conflict:**
> **Không gian làm việc này có xung đột**
> Có 2 phiên bản khác nhau từ 2 thiết bị. Chọn phiên bản bạn muốn giữ:
> `[Giữ bản trên máy này]` `[Giữ bản trên Cloud]`
> *Phiên bản không được chọn sẽ được lưu lại dưới dạng snapshot, không bị xóa.*

---

## 3. Reports

**Tiêu đề:** Báo cáo

**Mô tả phụ:** Báo cáo nghiên cứu đã publish lên cloud, có thể chia sẻ công khai.

**Empty state:**
> **Chưa có báo cáo nào được publish**
> Đăng nhập cloud từ Desktop App và publish một báo cáo để quản lý chia sẻ, phiên bản tại đây.
> `[Xem hướng dẫn publish]`

**Header cột:** `Tiêu đề` · `Không gian gốc` · `Trạng thái` · `Phiên bản` · `Cập nhật lúc`

**Nhãn trạng thái hiển thị (visibility):**
| Kỹ thuật | Nhãn |
|---|---|
| `private` | Riêng tư |
| `shared_link` | Chia sẻ qua link |
| `public` | Công khai |

**Trang chi tiết report — nút hành động:**
`[Sao chép link chia sẻ]` · `[Xem lịch sử phiên bản]` · `[Khôi phục phiên bản này]`

**Panel lịch sử phiên bản:**
> Phiên bản 3 (hiện tại) — cập nhật 25/07/2026
> Phiên bản 2 — 20/07/2026 `[Khôi phục]`
> Phiên bản 1 — 15/07/2026 `[Khôi phục]`

---

## 4. Snapshots

**Tiêu đề:** Ảnh chụp

**Mô tả phụ:** Điểm khôi phục theo thời gian cho không gian làm việc và báo cáo.

**Empty state:**
> **Chưa có ảnh chụp nào**
> Ảnh chụp được tạo tự động mỗi khi có thay đổi lớn, hoặc bạn có thể tạo thủ công.
> `[Tạo ảnh chụp thủ công]`

**Header cột:** `Không gian` · `Loại` · `Dung lượng` · `Ngày tạo` · `Thao tác`

**Nhãn loại:** `Tự động` · `Thủ công`

**Nút hành động mỗi dòng:** `[Khôi phục]` · `[Xóa]`

**Cảnh báo khi khôi phục:**
> **Khôi phục về ảnh chụp này?**
> Toàn bộ không gian làm việc sẽ quay về trạng thái tại thời điểm này. Trạng thái hiện tại sẽ được lưu thành một ảnh chụp mới trước khi khôi phục.
> `[Hủy]` `[Xác nhận khôi phục]`

---

## 5. Activity

**Tiêu đề:** Hoạt động

**Mô tả phụ:** Nhật ký đầy đủ mọi thay đổi trên không gian làm việc của bạn.

**Bộ lọc:** `Tất cả` · `Không gian làm việc` · `Nhóm` · `AI` · `Hệ thống`

**Empty state:**
> **Chưa có hoạt động nào được ghi nhận**
> Nhật ký sẽ xuất hiện khi bạn nhập tài liệu, tạo báo cáo hoặc cập nhật sơ đồ tri thức từ Desktop.

**Mẫu dòng log (theo type):**
| Type | Câu hiển thị mẫu |
|---|---|
| `paper_imported` | Đã nhập **12 tài liệu** vào *Nghiên cứu Nông nghiệp Gia Lai* |
| `report_regenerated` | Báo cáo *Tổng quan tài liệu Q3* đã được tạo lại |
| `graph_updated` | Sơ đồ tri thức của *Workspace X* đã được cập nhật |
| `evidence_updated` | Phát hiện **3 mâu thuẫn** mới trong *Workspace X* |
| `workspace_shared` | Đã chia sẻ *Workspace X* với **email@example.com** |
| `permission_changed` | Quyền của **email@example.com** đổi thành *Biên tập viên* |

---

## 6. Analytics

**Tiêu đề:** Phân tích

**Mô tả phụ:** Xu hướng sử dụng theo thời gian.

**Empty state:**
> **Chưa đủ dữ liệu để phân tích**
> Quay lại sau khi bạn đã sử dụng ResearchMind một thời gian — biểu đồ xu hướng sẽ xuất hiện tại đây.

**Tên 3 biểu đồ đề xuất:**
- Tài liệu nhập theo tuần
- Báo cáo theo không gian làm việc
- AI Credits đã dùng

---

## 7. Notifications

**Tiêu đề:** Thông báo

**Mô tả phụ:** Cập nhật về không gian làm việc, nhóm và hệ thống.

**Tab lọc theo danh mục:** `Tất cả` · `Không gian làm việc` · `Nhóm` · `AI` · `Hệ thống` · `Thanh toán`

**Empty state:**
> **Không có thông báo nào**
> Bạn sẽ nhận thông báo khi có đồng bộ mới, lời mời nhóm hoặc cập nhật hệ thống.

**Nút:** `[Đánh dấu tất cả đã đọc]`

**Mẫu nội dung thông báo:**
| Danh mục | Mẫu |
|---|---|
| Không gian làm việc | *Workspace X* đã đồng bộ xong |
| Không gian làm việc | Phát hiện xung đột ở *Workspace X* — cần bạn xử lý |
| AI | Tác vụ tạo báo cáo đã hoàn thành |
| AI | AI Credits sắp hết — còn lại 5% |
| Hệ thống | Hệ thống sẽ bảo trì lúc 02:00 ngày mai |

---

## 8. Backups

**Tiêu đề:** Sao lưu

**Mô tả phụ:** Bản sao lưu không gian làm việc, cài đặt và prompt của bạn.

**Tab loại:** `Tất cả` · `Không gian làm việc` · `Cài đặt` · `Prompt`

**Empty state:**
> **Chưa có bản sao lưu nào**
> Bản sao lưu được tạo tự động định kỳ, hoặc bạn có thể tạo ngay bây giờ.
> `[Tạo bản sao lưu]`

**Header cột:** `Loại` · `Đối tượng` · `Dung lượng` · `Ngày tạo` · `Thao tác`

**Nút mỗi dòng:** `[Tải xuống]` · `[Khôi phục]`

---

## 9. Devices

**Tiêu đề:** Thiết bị

**Mô tả phụ:** Các thiết bị đã đăng nhập ResearchMind Desktop.

**Empty state:**
> **Chưa có thiết bị nào**
> Đăng nhập vào Cloud từ ResearchMind Desktop để thiết bị xuất hiện tại đây.

**Header cột:** `Tên thiết bị` · `Hệ điều hành` · `Trạng thái` · `Đồng bộ gần nhất` · `Thao tác`

**Nhãn trạng thái:** `Đang hoạt động` (chấm xanh) · `Ngoại tuyến` (chấm xám)

**Nút:** `[Ngắt kết nối]`

**Cảnh báo khi ngắt kết nối:**
> **Ngắt kết nối thiết bị này?**
> Thiết bị sẽ cần đăng nhập lại để tiếp tục đồng bộ. Dữ liệu local trên thiết bị đó không bị ảnh hưởng.
> `[Hủy]` `[Xác nhận ngắt kết nối]`

---

## 10. Team

**Tiêu đề:** Nhóm

**Mô tả phụ:** Mời thành viên cộng tác trên không gian làm việc.

**Empty state:**
> **Chưa có thành viên nào**
> Mời đồng nghiệp để cùng xem, bình luận hoặc chỉnh sửa không gian làm việc.
> `[Mời thành viên]`

**Header cột:** `Thành viên` · `Vai trò` · `Trạng thái` · `Ngày mời`

**Nhãn vai trò:** `Chủ sở hữu` · `Biên tập viên` · `Người xem`

**Nhãn trạng thái lời mời:** `Đang chờ` · `Đã tham gia`

**Modal mời thành viên:**
> **Mời thành viên**
> Email: `[nhập email]`
> Vai trò: `[Biên tập viên ▾]`
> `[Gửi lời mời]`

---

## 11. Billing

**Tiêu đề:** Thanh toán

**Mô tả phụ:** Gói dịch vụ và AI Credits của bạn.

**Trạng thái đề xuất (nếu chưa mở billing thật):**
> **Sắp ra mắt**
> Tính năng quản lý gói dịch vụ và thanh toán đang được hoàn thiện.

**Nếu đã có billing thật — layout:**
- Gói hiện tại: *Free / Pro / Team*
- AI Credits còn lại: thanh progress bar
- `[Nâng cấp gói]` · `[Xem lịch sử thanh toán]`

---

## 12. API Keys

**Tiêu đề:** API Keys

**Mô tả phụ:** Khóa truy cập cho tích hợp bên ngoài.

**Empty state:**
> **Chưa có API key nào**
> Tạo key để kết nối ResearchMind với công cụ khác hoặc script tự động.
> `[Tạo API key mới]`

**Header cột:** `Tên` · `Quyền truy cập` · `Dùng lần cuối` · `Ngày tạo` · `Thao tác`

**Cảnh báo khi tạo xong (hiện đúng 1 lần):**
> **Lưu lại key này ngay bây giờ**
> Đây là lần duy nhất key đầy đủ được hiển thị. Bạn sẽ không thể xem lại sau khi rời trang này.
> `sk_live_••••••••••••••••` `[Sao chép]`

---

## 13. Settings

**Tiêu đề:** Cài đặt

**Mô tả phụ:** Thông tin tài khoản và tùy chọn ứng dụng.

**Các mục (tab hoặc section):**
- **Hồ sơ** — Tên, email, ảnh đại diện, đổi mật khẩu, xác thực 2 bước
- **Tùy chọn** — Ngôn ngữ hiển thị (Tiếng Việt / English), giao diện (Sáng/Tối)
- **Cấu hình AI** — Nhà cung cấp AI mặc định, quản lý API key của bên thứ ba
- **Tính năng thử nghiệm** — Bật/tắt tính năng đang phát triển

---

## 14. Help

**Tiêu đề:** Trợ giúp

**Mô tả phụ:** Câu hỏi thường gặp và hướng dẫn sử dụng.

**Danh mục gợi ý:**
- Bắt đầu với ResearchMind Desktop
- Kết nối Desktop với Cloud
- Xử lý xung đột đồng bộ
- Xuất báo cáo và trích dẫn
- Câu hỏi về bảo mật dữ liệu

---

## 15. Feedback

**Tiêu đề:** Góp ý

**Mô tả phụ:** Báo lỗi hoặc đề xuất tính năng bạn muốn thấy ở ResearchMind.

**Form:**
> Loại góp ý: `[Báo lỗi ▾]` *(Báo lỗi / Đề xuất tính năng / Khác)*
> Nội dung: `[textarea]`
> `[Gửi góp ý]`

**Thông báo sau khi gửi:**
> **Cảm ơn bạn đã góp ý**
> Mình sẽ xem qua sớm nhất có thể.

---

## Ghi chú chung khi implement

1. **Ưu tiên sửa trước:** Dashboard (undefined MB/events) và Reports (Firestore index) — đã nêu ở tài liệu trước, không lặp lại ở đây.
2. **i18n:** nên đưa toàn bộ chuỗi trên vào `packages/i18n/vi.json`, giữ key tiếng Anh (`workspaces.empty.title`) để dễ thêm locale `en` sau nếu cần mở rộng ra người dùng quốc tế.
3. **Nhất quán giọng văn:** toàn bộ empty state đều theo mẫu: **Tiêu đề ngắn** → **1 câu giải thích** → **1 CTA hành động tiếp theo** (không để trống hoàn toàn như hiện tại ở trang Workspaces trong ảnh chụp).
4. **Không để text tiếng Anh lẫn tiếng Việt** trong cùng 1 trang (hiện tại "Workspaces" + "Cloud-linked research workspaces and sync state" đang là tiếng Anh — cần đồng bộ hết sang tiếng Việt nếu chọn `vi` làm ngôn ngữ chính).