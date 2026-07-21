# Tổng quan Kiến trúc đã triển khai (Giai đoạn 1 - MVP)

Để trả lời câu hỏi của bạn, đây là chi tiết những gì hệ thống đã hoàn thiện từ lúc khởi tạo nhánh `feature/research-engine` đến nay. Trọng tâm của giai đoạn này là **Đọc hiểu, bóc tách cấu trúc và ẩn danh dữ liệu an toàn 100% (Local-first)**.

Dưới đây là 3 khối logic chính đã được xây dựng và ráp nối thành công:

---

## 1. Engine Ẩn danh Dữ liệu (Backend)
Hệ thống xử lý văn bản tự động che giấu danh tính trước khi đưa vào AI để đảm bảo tính khách quan (Blind Review).

- **Core Logic**: Xây dựng `AnonymizationEngine` tại [engine.py](file:///d:/all_my_project/researchmind/backend/anonymization/engine.py). Sử dụng Regex & Heuristic NER để tìm và thay thế tên tác giả, trường đại học, email, mã số tài trợ (Grant), ORCID... thành các thẻ chuẩn hóa như `[AUTHOR_1]`, `[INSTITUTION_1]`.
- **Lưu trữ Reversible**: Các thay thế này được map lại (ví dụ: `[AUTHOR_1] -> John Doe`) và lưu vào cơ sở dữ liệu SQLite dưới dạng bảng `AnonymizationMap`.
- **API Endpoints**: Mở các REST API tại [anonymize.py](file:///d:/all_my_project/researchmind/backend/routers/anonymize.py) cho phép Frontend gọi lệnh:
  - Bật / Tắt ẩn danh.
  - Xóa map ẩn danh.
  - Lấy danh sách ánh xạ để hiển thị (Entity Map).

## 2. Giao diện Quản lý Ẩn danh (Frontend)
Cho phép người dùng tương tác trực tiếp với Engine thông qua UI của hệ thống.

- **Client API**: Khai báo toàn bộ TypeScript Interfaces và các phương thức giao tiếp (`api.anonymization`) tại [api.ts](file:///d:/all_my_project/researchmind/apps/desktop/src/lib/api.ts).
- **Control Panel**: Tạo Component [AnonymizationPanel.tsx](file:///d:/all_my_project/researchmind/apps/desktop/src/components/shared/AnonymizationPanel.tsx) hiển thị thống kê chi tiết (có bao nhiêu tác giả, bao nhiêu email bị ẩn). Bảng này đã được gắn vào trang thông tin tài liệu (`LibraryView.tsx`).

> [!TIP]
> **Trải nghiệm người dùng:** Bạn có thể mở một bài báo khoa học bất kỳ trong ứng dụng, xem tab Info sẽ thấy một bảng điều khiển. Nhấn "Chạy Quét" để nó tự động bóc tách tên, sau đó bật "Kích hoạt" để AI không còn nhìn thấy danh tính tác giả đó nữa.

## 3. Tích hợp RAG & Nâng cấp Prompt Sinh luận (Insights)
Bảo đảm AI đọc văn bản đã ẩn danh và trả lời chuẩn mực học thuật.

- **Chặn Luồng Context (Retriever)**: Đã can thiệp vào [retriever.py](file:///d:/all_my_project/researchmind/backend/chat/retriever.py). Khi AI tìm kiếm ngữ cảnh, trước khi ghép text đưa cho LLM, hệ thống sẽ tự động quét qua `AnonymizationMap` của bài báo. Nếu chế độ ẩn danh đang bật, đoạn văn bản đó sẽ bị thay thế tên người/tổ chức *ngay trong bộ nhớ tạm thời* (on-the-fly) rồi mới gửi cho AI.
- **Nâng cấp Prompts (Sprint 3)**: Đã viết lại toàn bộ system prompt cho luồng Insights tại [insights.py](file:///d:/all_my_project/researchmind/backend/routers/insights.py) để khắt khe hơn:
  - Phân tích lỗ hổng (*Gap Analysis*): Bắt buộc phân biệt giữa lỗ hổng do tác giả tự nhận và lỗ hổng do AI tổng hợp chéo.
  - Phân tích mâu thuẫn (*Conflict*): Phải so sánh phương pháp luận, không chỉ so sánh kết quả.
  - Xu hướng (*Evolution*): Nghiêm cấm "ảo giác", chỉ cho phép phác thảo lịch sử dựa trên các mốc thời gian có thật trong bài báo.

---

### Tóm lại
Chúng ta đã hoàn thành **Giai đoạn 1** theo triết lý "Cuốn chiếu" (làm tới đâu chạy được tới đó). Hiện tại ứng dụng đã có khả năng:
1. Load PDF.
2. Quét & giấu nhẹm tên tuổi/tổ chức (để review khách quan).
3. Chat/hỏi đáp logic, đào sâu mâu thuẫn khắt khe.

Bạn có thể duyệt qua Artifact này để nắm rõ các luồng. Chúng ta có thể bắt tay vào **Giai đoạn 2 (Review Builder)** nếu bạn đã sẵn sàng!
