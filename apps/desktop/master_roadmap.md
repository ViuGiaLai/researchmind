# 🚀 ResearchMind: Master Execution Roadmap
*Bản kế hoạch chi tiết từng bước xây dựng nền tảng ResearchMind (6-Engine Hybrid Architecture)*

Để hiện thực hóa một hệ thống lớn như ResearchMind mà không bị ngợp, bạn cần áp dụng chiến lược **"Cuốn chiếu" (Agile Iteration)**: Làm đến đâu, chạy được đến đó, rủi ro thấp nhất và ra mắt được bản MVP (Sản phẩm khả dụng tối thiểu) nhanh nhất.

Dưới đây là lộ trình chi tiết từ Step 1 đến Step N.

---

## GIAI ĐOẠN 1: FOUNDATION & MVP (Chứng minh Năng lực Cốt lõi)
*Mục tiêu: Đọc được PDF, bóc tách cấu trúc, ẩn danh dữ liệu và hỏi đáp logic chuyên sâu. Giai đoạn này KHÔNG cần Database phức tạp, chạy 100% Local và API.*

### Bước 1: Setup Bộ khung Frontend & Local Storage
*   **Công việc:**
    *   Khởi tạo dự án Frontend (Khuyến nghị: **Next.js** hoặc **Vite + React**).
    *   Cấu hình **IndexedDB** hoặc **Local Forage** để lưu trữ dữ liệu hoàn toàn trên trình duyệt người dùng.
    *   Xây dựng giao diện cơ bản (Layout): Khu vực Upload file, Khu vực hiển thị nội dung đọc, Khu vực Chat/Tương tác với AI.
*   **Output:** Một ứng dụng web chạy Local, có thể lưu trữ trạng thái tải trang.

### Bước 2: Xây dựng Document Engine (Lõi bóc tách dữ liệu)
*   **Công việc:**
    *   Tích hợp thư viện đọc PDF cục bộ (ví dụ: `pdf.js` hoặc gọi các công cụ parser nhẹ bằng WebAssembly - WASM).
    *   Xây dựng thuật toán Parser: Chuyển đổi PDF $\rightarrow$ Text, nhận diện Heading, Section, bóc tách cơ bản (AST/Markdown).
    *   *Lưu ý:* Ban đầu chưa cần bóc tách hoàn hảo 100% công thức Toán hay hình ảnh phức tạp, chỉ cần Text và Layout cơ bản.
*   **Output:** Upload file PDF, hệ thống bóc ra được file Markdown có cấu trúc và lưu vào IndexedDB.

### Bước 3: Xây dựng Module Ẩn danh (Data Anonymization)
*   **Công việc:**
    *   Viết logic Regex hoặc dùng một model NLP nhỏ (như `spaCy` chạy WebAssembly hoặc gọi API nhanh) để quét văn bản.
    *   Thay thế tự động: Tên tác giả $\rightarrow$ `[AUTHOR_x]`, Tên trường $\rightarrow$ `[INSTITUTION_x]`, Tên dự án $\rightarrow$ `[PROJECT_x]`.
*   **Output:** Đầu vào là Markdown gốc $\rightarrow$ Đầu ra là Markdown đã được "làm sạch" (Sanitized Markdown).

### Bước 4: Xây dựng Reasoning Engine (RAG & Logic Analysis)
*   **Công việc:**
    *   Tích hợp LLM API (Khuyến nghị dùng **Anthropic Claude 3.5 Sonnet** hoặc **OpenAI GPT-4o** vì khả năng đọc hiểu ngữ cảnh dài cực tốt).
    *   Thiết kế hệ thống Prompt cốt lõi (Prompt Engineering):
        *   Prompt phân tích lỗ hổng nghiên cứu.
        *   Prompt kiểm tra mâu thuẫn số liệu (Logic Validation).
    *   Xây dựng luồng RAG đơn giản ngay tại Local (chia nhỏ văn bản, tạo index tạm trên RAM để AI tìm kiếm).
*   **Output:** Chatbot/Trợ lý có thể trả lời câu hỏi chuyên sâu về bài báo dựa trên dữ liệu đã được ẩn danh.

> [!IMPORTANT]
> **Điểm dừng (Milestone 1):** Tại đây, bạn đã có một sản phẩm **có thể bán/cho dùng thử được ngay**. Người dùng tải PDF chưa công bố lên $\rightarrow$ Hệ thống che thông tin $\rightarrow$ AI đọc và phản biện.

---

## GIAI ĐOẠN 2: PERSISTENCE & CLOUD SYNC (Đồng bộ & Lưu trữ An toàn)
*Mục tiêu: Đưa Cloudflare vào vận hành, quản lý tài khoản người dùng, đồng bộ quy trình và lưu trữ bảo mật (E2EE).*

### Bước 5: Setup Hạ tầng Cloudflare & User Authentication
*   **Công việc:**
    *   Đăng ký và cấu hình hệ sinh thái Cloudflare (Workers, D1 cho Database quan hệ).
    *   Thiết lập Hệ thống Đăng nhập/Xác thực (Authentication) (ví dụ: dùng Clerk, Supabase Auth hoặc tự build trên Cloudflare Workers).

### Bước 6: Xây dựng Workflow Engine cơ bản
*   **Công việc:**
    *   Thiết kế Schema Database trên **Cloudflare D1** để lưu trữ trạng thái dự án (Tên dự án, Giai đoạn: Brainstorm/Drafting/Reviewing).
    *   Làm tính năng: Tạo dự án mới, quản lý danh sách dự án.
*   **Output:** Người dùng đăng nhập vào thấy danh sách các nghiên cứu của mình trên mọi thiết bị.

### Bước 7: Xây dựng Memory Engine (Ghi chú & Lịch sử) + E2EE
*   **Công việc:**
    *   Làm tính năng Highlight văn bản và Thêm Note (Ghi chú cá nhân).
    *   **Thực thi E2EE:** Khi người dùng viết Note, sử dụng Web Crypto API để mã hóa đoạn Note bằng Master Password của người dùng tại trình duyệt.
    *   Đẩy chuỗi đã mã hóa lên Cloudflare D1 để lưu trữ. Khi tải trang, kéo chuỗi đó về và giải mã tại trình duyệt.
*   **Output:** Người dùng có thể ghi chú, đổi máy tính vẫn thấy ghi chú, nhưng Hacker (hoặc bạn) vào Database Cloudflare chỉ thấy ký tự vô nghĩa.

> [!TIP]
> **Điểm dừng (Milestone 2):** Sản phẩm trở thành một Workspace hoàn chỉnh. Người dùng có thể làm việc lâu dài, bảo mật tuyệt đối.

---

## GIAI ĐOẠN 3: KNOWLEDGE & AUTOMATION (Trở thành Nền tảng Chuyên gia)
*Mục tiêu: Cấp cho hệ thống tri thức ngành rộng lớn và tự động hóa khâu xuất bản.*

### Bước 8: Xây dựng Knowledge Engine (Từ điển ngành & SOTA)
*   **Công việc:**
    *   Tích hợp API của Semantic Scholar hoặc PapersWithCode.
    *   Cấu hình **Cloudflare KV** làm bộ nhớ đệm (Cache) để lưu trữ nhanh các chỉ số SOTA, thuật ngữ ngành, giúp giảm chi phí gọi API ngoại.
    *   Khi Reasoning Engine phân tích, nó sẽ tự động truy xuất Knowledge Engine để lấy thêm bối cảnh (Ví dụ: "Phương pháp của bạn đạt 90% accuracy, nhưng SOTA hiện tại trên PapersWithCode đã là 95%").
*   **Output:** AI phản hồi "sâu" hơn, có dẫn chứng so sánh với thế giới.

### Bước 9: Triển khai Cloudflare Vectorize (Cho tài liệu công cộng)
*   **Công việc:**
    *   Cho phép người dùng tìm kiếm (Semantic Search) hàng triệu bài báo *đã công bố* trên thế giới.
    *   Vector hóa metadata của các bài báo này và lưu trên **Cloudflare Vectorize**.
*   **Output:** Tính năng Literature Review (Tổng quan tài liệu) cực mạnh, tìm bài báo bằng ý nghĩa câu hỏi chứ không cần đúng từ khóa.

### Bước 10: Xây dựng Publishing Engine (Đóng gói xuất bản)
*   **Công việc:**
    *   Tạo Database chứa các Rule/Template của IEEE, Springer... trên Cloudflare D1.
    *   Tính năng: Scan toàn bộ bản thảo (Local) đối chiếu với Rule (Cloud) $\rightarrow$ Đưa ra danh sách lỗi (Quá số trang, sai format trích dẫn...).
    *   Hỗ trợ xuất file (Export) ra định dạng chuẩn (PDF chuẩn, LaTeX chuẩn).
*   **Output:** "Trợ lý định dạng" giúp người dùng tiết kiệm hàng tuần đồng hồ sửa format chuẩn bị nộp bài.

---

## TỔNG KẾT CHIẾN LƯỢC

1.  **Làm ngay bây giờ (Tháng 1-2):** Giai đoạn 1 (Bước 1, 2, 3, 4). Đây là trái tim của sản phẩm.
2.  **Làm tiếp theo (Tháng 3-4):** Giai đoạn 2 (Bước 5, 6, 7). Biến tool thành một nền tảng SaaS có thể thu phí.
3.  **Mở rộng (Tháng 5+):** Giai đoạn 3 (Bước 8, 9, 10). Tạo rào cản cạnh tranh (Moat) khổng lồ mà các đối thủ khác khó sao chép.
