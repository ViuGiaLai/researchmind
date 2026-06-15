### Luồng 1 — Import PDF

1. **Người dùng tải PDF lên**

2. **Tauri UI (React Frontend)** nhận file PDF

3. Frontend gửi file qua **IPC** đến **FastAPI (Python Backend)**

4. FastAPI dùng **PyMuPDF** để đọc và trích xuất nội dung PDF

5. Nội dung được chia thành nhiều đoạn nhỏ (**Chunking**), mỗi chunk khoảng **512 tokens**

6. Mỗi chunk được đưa vào mô hình embedding **bge-m3 local** để tạo vector

7. Kết quả được lưu vào hai hệ thống:

   **a. SQLite FTS5**

   * Lưu toàn bộ văn bản
   * Tạo chỉ mục full-text search
   * Hỗ trợ tìm kiếm từ khóa (BM25)

   **b. ChromaDB**

   * Lưu vector embedding
   * Hỗ trợ semantic search (vector search)

8. Metadata của tài liệu (tên paper, tác giả, tags, thời gian import...) được lưu trong **SQLite**

---

### Luồng 2 — Chat với Paper (RAG)

1. **Người dùng nhập câu hỏi**

2. Hệ thống thực hiện **Query Processing**

   * Nhận diện ngôn ngữ
   * Chuẩn hóa câu hỏi
   * Mở rộng từ khóa (query expansion)

3. Câu hỏi được gửi đến **Hybrid Search**

4. Hybrid Search tìm kiếm đồng thời:

   **a. SQLite FTS5**

   * Tìm kiếm từ khóa bằng BM25

   **b. ChromaDB**

   * Tìm kiếm ngữ nghĩa bằng vector similarity

5. Kết quả từ hai nguồn được hợp nhất và xếp hạng

6. Hệ thống sử dụng **Re-ranker (Cross Encoder)** để chọn ra **Top 5 đoạn liên quan nhất**

7. Các đoạn văn liên quan được gửi vào **LLM (Qwen 2.5 hoặc Claude)** cùng với câu hỏi của người dùng

8. LLM sinh câu trả lời dựa trên ngữ cảnh được truy xuất

9. Hệ thống trả về:

   * Câu trả lời
   * Citation (trích dẫn nguồn)
   * Tên paper
   * Số trang hoặc vị trí đoạn văn

10. Người dùng nhận được câu trả lời có dẫn nguồn chính xác từ tài liệu PDF.

---

### Tóm tắt ngắn gọn

**Import PDF**

```text
User
→ Tauri UI
→ FastAPI
→ PDF Parser
→ Chunker
→ Embedder
├─ SQLite (Metadata)
├─ SQLite FTS5 (Full-text Search)
└─ ChromaDB (Vector Store)
```

**Chat với PDF (RAG)**

```text
User Question
→ Query Processing
→ Hybrid Search
├─ SQLite FTS5 (BM25)
└─ ChromaDB (Vector Search)
→ Re-ranker
→ LLM
→ Answer + Citation
→ User
```



phân tích 
Luồng Import PDF
Khi người dùng tải một tệp PDF lên hệ thống, tệp này trước tiên được tiếp nhận bởi giao diện Tauri được xây dựng bằng React. Từ frontend, tệp PDF được gửi thông qua cơ chế IPC đến backend FastAPI viết bằng Python để xử lý. Backend sử dụng thư viện PyMuPDF nhằm đọc nội dung và trích xuất toàn bộ văn bản từ tài liệu PDF.
Sau khi văn bản được trích xuất, hệ thống tiến hành chia nhỏ nội dung thành nhiều đoạn (chunk), mỗi đoạn có kích thước khoảng 512 token nhằm tối ưu cho việc lập chỉ mục và tạo embedding. Các chunk này sau đó được đưa vào mô hình embedding cục bộ bge-m3 để chuyển đổi thành các vector biểu diễn ngữ nghĩa.
Kết quả xử lý được lưu trữ ở nhiều lớp khác nhau. Metadata của tài liệu như tên paper, tác giả, nhãn phân loại (tags) và các thông tin quản lý khác được lưu trong SQLite. Nội dung văn bản đầy đủ của các chunk được lập chỉ mục trong SQLite FTS5 để hỗ trợ tìm kiếm toàn văn bằng BM25. Đồng thời, các vector embedding được lưu trong ChromaDB để phục vụ tìm kiếm ngữ nghĩa dựa trên độ tương đồng vector.

Luồng Chat với Paper (RAG)
Khi người dùng đặt câu hỏi liên quan đến tài liệu đã nhập, hệ thống trước tiên thực hiện bước xử lý truy vấn (Query Processing). Giai đoạn này bao gồm nhận diện ngôn ngữ, chuẩn hóa nội dung câu hỏi và mở rộng truy vấn nhằm tăng khả năng tìm kiếm chính xác.
Sau khi xử lý, câu hỏi được chuyển đến mô-đun Hybrid Search. Tại đây, hệ thống thực hiện đồng thời hai phương pháp tìm kiếm. Phương pháp thứ nhất sử dụng SQLite FTS5 để tìm kiếm từ khóa dựa trên thuật toán BM25. Phương pháp thứ hai sử dụng ChromaDB để tìm kiếm ngữ nghĩa thông qua vector embedding. Kết quả từ hai nguồn được hợp nhất nhằm tận dụng ưu điểm của cả tìm kiếm từ khóa và tìm kiếm ngữ nghĩa.
Các kết quả tìm được sau đó được đưa vào mô-đun Re-ranker sử dụng mô hình Cross-Encoder để đánh giá mức độ liên quan và lựa chọn ra những đoạn văn phù hợp nhất, thường là top 5 kết quả có độ liên quan cao nhất.
Những đoạn văn được chọn cùng với câu hỏi của người dùng sẽ được gửi đến mô hình ngôn ngữ lớn (LLM) như Qwen 2.5 hoặc Claude. Dựa trên ngữ cảnh được cung cấp, LLM tạo ra câu trả lời chính xác và có căn cứ từ nội dung tài liệu.
Cuối cùng, hệ thống trả về cho người dùng câu trả lời kèm theo thông tin trích dẫn (citation), bao gồm tên tài liệu, số trang hoặc vị trí đoạn văn được sử dụng làm nguồn tham chiếu. Điều này giúp người dùng dễ dàng kiểm chứng tính chính xác của câu trả lời và truy xuất ngược về nội dung gốc trong tài liệu PDF.
