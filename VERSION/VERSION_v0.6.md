🧠

**ResearchMind VN**

v0.6 — Polish & Launch Plan

19/06/2026  ·  4 Sprint  ·  Launch-Ready

*"Trợ lý nhớ mọi paper bạn đã đọc — chạy hoàn toàn trên máy bạn, không gửi dữ liệu ra ngoài."*

|**v0.1 Feature**|**v0.2 Performance**|**v0.3 Correctness**|**v0.4 Reliability**|**v0.5 Speed**|**v0.6 Polish & Launch ★**|
| :-: | :-: | :-: | :-: | :-: | :-: |

*v0.6 là phiên bản cuối cùng trước khi tiếp cận user thật — tập trung làm cho app đủ đẹp và đủ mượt để demo mà không cần giải thích.*

# **1. Tại sao v0.6 phải là Polish & Launch?**
v0.1–v0.5 đã xây dựng một cỗ máy mạnh mẽ bên trong: hybrid RAG, 7 LLM providers, Verify Mode với OpenAlex + Crossref, Literature Review Builder, Import Queue, streaming, caching. Nhưng có một vấn đề:

|**Backend (đã tốt sau v0.1–v0.5)**|**Frontend (vẫn còn gap)**|
| :-: | :-: |
|✅ Hybrid BM25 + Vector search|❌ HTML entity bug: &quot; &amp; hiển thị sai|
|✅ Verify Mode: OpenAlex + Crossref|❌ UI chưa nhất quán — mix emoji + icon lib|
|✅ 7 LLM providers với fallback chain|❌ Onboarding yêu cầu cài Python và llama-server/GGUF thủ công|
|✅ Literature Review Builder + Export|❌ Error messages chưa tiếng Việt, chưa actionable|
|✅ Streaming + Cache + Import Queue|❌ Empty states trống — không hướng dẫn user làm gì|

**⚠️  Researcher nhìn app lần đầu → judge bằng mắt trong 5 giây. Nếu UI trông không chuyên nghiệp, họ không tin vào kết quả AI dù backend có tốt đến đâu. UI là cổng vào duy nhất đến user thật.**

# **2. Tổng quan 4 Sprint**

|**Sprint**|**Tên**|**Mục tiêu chính**|**Output**|
| :-: | :-: | :-: | :-: |
|**Sprint 1**|**Visual Consistency**|UI nhất quán, bug fix, design system chuẩn|App trông chuyên nghiệp khi screenshot|
|**Sprint 2**|**Micro-interactions**|Transitions, loading states, hover, toast mượt|App cảm giác alive, không bị "bật" đột ngột|
|**Sprint 3**|**Onboarding Flow**|Installer mượt, first-run rõ ràng, không cần README|NCS cài được trong <5 phút|
|**Sprint 4**|**Launch Checklist**|Shortcuts, citation export, privacy notice, bug report|App sẵn sàng cho người dùng thật|

*📌  Thứ tự ưu tiên: Sprint 3 (Onboarding) có impact lớn hơn Sprint 1 (Visual) vì installer là cổng đầu tiên — researcher không cài được thì không bao giờ thấy UI đẹp. Tuy nhiên Sprint 1 được đặt trước vì fix bug HTML entity cần làm ngay.*

# **3. Sprint 1 — Visual Consistency**
Mục tiêu: App trông chuyên nghiệp khi screenshot lần đầu. Researcher có thể chụp màn hình và gửi cho advisor mà không xấu hổ.

🐛  **3.1  Bug Fixes Bắt Buộc Trước Tiên**

- **Fix HTML entity encoding** — &quot; và &amp; đang hiển thị thay vì ký tự thật trong tên bài báo, tên tạp chí. Decode HTML entities trong MarkdownRenderer.tsx hoặc ở backend trước khi trả về. Fix trong 10 phút nhưng impact rất cao.
- **Fix encoding tên tác giả tiếng Việt** — một số PDF có tên tác giả bị mã hóa sai. Kiểm tra pipeline từ PyMuPDF → SQLite → API → React render.

🎨  **3.2  Design System**

Tạo một file design tokens duy nhất (variables.css hoặc tailwind.config) để toàn bộ app dùng chung:

|**Token**|**Giá trị**|**Dùng cho**|
| :-: | :-: | :-: |
|--color-primary|**#2563EB**|Button chính, link, accent|
|--color-verify|**#0D9488 (Teal)**|Mọi thứ liên quan Verify Mode|
|--color-warning|**#D97706 (Amber)**|OCR warning, cần chú ý|
|--color-error|**#DC2626 (Red)**|Import fail, lỗi, không tìm thấy|
|--color-success|**#16A34A (Green)**|Ready, verified, thành công|
|--font-sans|'Inter', system-ui|Toàn bộ UI text|
|--font-mono|'JetBrains Mono'|DOI, model name, code, ID|

🖼  **3.3  Icon System**

- Chọn 1 icon library duy nhất: Lucide React hoặc Phosphor Icons — không mix cả hai
- Bỏ toàn bộ emoji dùng như icon trong UI (giữ emoji chỉ trong content, không trong button/nav/badge)
- Các icon có semantic rõ ràng: verify = shield-check, import = upload, OCR = scan, citation = bookmark
- Size nhất quán: 16px inline, 20px button, 24px heading action

📭  **3.4  Empty States**

Mỗi màn hình cần có empty state rõ ràng khi chưa có dữ liệu:

|**Màn hình**|**Empty state message**|**Action button**|
| :-: | :-: | :-: |
|Library (chưa có paper)|Chưa có tài liệu nào. Import paper đầu tiên để bắt đầu.|📥 Import tài liệu|
|Search (không có kết quả)|Không tìm thấy kết quả cho "[query]". Thử từ khóa khác.|Xóa filter / Thử lại|
|Chat (chưa chọn paper)|Chọn ít nhất 1 paper từ thư viện để bắt đầu chat.|Mở thư viện|
|Import Queue (rỗng)|Hàng chờ trống. Kéo thả file vào đây để import.|Chọn file|

🌑  **3.5  Dark Mode Hoàn Chỉnh**

- Scan toàn bộ CSS: không có hardcode màu trắng, đen, hoặc màu hex không qua CSS variable
- Kiểm tra: Library, Chat, Verify Panel, Settings, Import Queue, Toast — tất cả phải đúng màu ở dark mode
- Scrollbar styling nhất quán — không có scrollbar mặc định của OS hiện ra chỏi màu

# **4. Sprint 2 — Micro-interactions**
Mục tiêu: App cảm giác "alive" và responsive. Mọi thao tác của user đều nhận được phản hồi visual ngay lập tức.

👆  **4.1  Hover & Focus States**

- Mọi button, link, clickable element phải có hover state rõ (background change, border highlight)
- Focus ring đúng chuẩn accessibility: outline 2px solid --color-primary với offset 2px
- Active state: button nhấn xuống có scale(0.97) hoặc shadow giảm — cho biết đang được click
- Cursor: pointer trên mọi clickable, text trên selectable text, default trên disabled

✨  **4.2  Transitions**

|**Tương tác**|**Transition**|**Duration**|
| :-: | :-: | :-: |
|Chuyển tab (Chat/Review/Verify...)|fade opacity 0→1 + slide Y 4px→0|150ms ease-out|
|Mở/đóng paper preview|expand height với overflow hidden|200ms ease|
|Hover trên paper row|background color change|100ms linear|
|Verify Panel xuất hiện|slide down + fade in|250ms ease-out|
|Toast notification|slide in từ bottom-right|200ms / auto-dismiss 3s|
|Sidebar nav active|indicator bar slide sang item mới|150ms ease|

⏳  **4.3  Loading States**

Thay spinner trắng bằng skeleton screens — user thấy layout trước khi có data:

- **Library list skeleton:** Render 5–8 paper row placeholder với shimmer animation khi đang load.
- **Search skeleton:** Render 3 result card placeholder ngay khi gửi query, thay bằng real data khi có.
- **Chat response:** Hiện avatar AI + cursor nhấp nháy ngay lập tức trước khi token đầu tiên đến (streaming đã có từ v0.2).
- **Verify Panel:** Skeleton 2 card với shimmer khi đang fetch OpenAlex/Crossref.
- **Import Queue:** Progress bar animated (đã có) — đảm bảo smooth 60fps không giật.

🔔  **4.4  Toast Notification System**

|**Type**|**Icon**|**Ví dụ message**|**Duration**|
| :-: | :-: | :-: | :-: |
|**Success**|✅|Đã import "YOLOv8\_2023.pdf" thành công|3 giây, auto-dismiss|
|**Warning**|⚠️|File này là PDF scan. Nhấn "Chạy OCR" để tìm kiếm được.|5 giây, có action button|
|**Error**|❌|Không kết nối được OpenAlex. Đang dùng local data.|Không tự dismiss, có nút X|
|**Info**|ℹ️|Paper này có 3.142 citations trên OpenAlex.|3 giây, auto-dismiss|

# **5. Sprint 3 — Onboarding Flow**
**⭐  Sprint này quan trọng nhất trong v0.6. Installer là cổng đầu tiên — nếu NCS không cài được trong 5 phút, họ sẽ bỏ dù app có tốt đến đâu.**

📦  **5.1  Installer Bundled**

Vấn đề hiện tại: User phải tự cài Python/backend, tự tải model GGUF, tự chạy llama-server CPU và uvicorn/backend. Không ai chịu làm điều này.

Lưu ý định hướng: v0.6 không dùng Ollama. Runtime local chuẩn là llama.cpp `llama-server.exe` chạy CPU với model GGUF; GPU/offload chỉ là tối ưu tùy chọn sau.

|**Task**|**Cách làm**|**Target**|
| :-: | :-: | :-: |
|Bundle Python runtime|PyInstaller bundle backend thành .exe — không cần cài Python|User không cần biết Python tồn tại|
|Bundle llama-server CPU|Tauri sidecar: bundle `llama-server.exe` từ llama.cpp, tự start với GGUF model khi app mở|Local CPU inference tự chạy trong nền, user không thấy terminal|
|GGUF model download wizard|First-run: chọn/tải `Qwen2.5-3B-Instruct-Q4_K_M.gguf` hoặc model GGUF phù hợp CPU, có progress/ETA|User biết app đang làm gì, không nghĩ bị đơ|
|Windows installer (.msi)|Tauri bundler + Wix toolset → .msi với icon, uninstall clean|Cài như bất kỳ phần mềm Windows nào khác|

🎯  **5.2  First-Run Experience**

Setup Wizard 5 bước — researcher hoàn thành trong <5 phút:

|**Bước**|**Màn hình**|**Nội dung**|**Skip được?**|
| :-: | :-: | :-: | :-: |
|**1**|**Chào mừng**|Logo + tagline + "Bắt đầu trong 2 phút"|Không|
|**2**|**Chọn LLM Mode**|3 lựa chọn rõ ràng: • Dùng Cloud miễn phí (khuyến nghị) • Nhập API key của tôi • Chỉ dùng local CPU (`llama-server` + GGUF)|Không|
|**3**|**Tải model (nếu chọn local)**|Progress bar với tốc độ MB/s và ETA. Nút "Dùng Cloud thay thế" nếu mạng chậm.|Có (chọn Cloud)|
|**4**|**Import paper đầu tiên**|Drop zone lớn: "Kéo thả 1 paper PDF của bạn vào đây để thử"|Có|
|**5**|**Chat đầu tiên**|"Hỏi gì về paper này đi!" với 3 gợi ý câu hỏi theo nội dung paper vừa import.|Có|

🇻🇳  **5.3  Error Messages Tiếng Việt**

Thay thế toàn bộ error message tiếng Anh kỹ thuật bằng tiếng Việt có hành động rõ ràng:

|**Error hiện tại**|**Error mới (tiếng Việt)**|**Action button**|
| :-: | :-: | :-: |
|Connection refused|Không thể kết nối với AI. Kiểm tra kết nối mạng hoặc runtime local CPU.|Thử lại / Dùng local CPU|
|401 Unauthorized|API key không hợp lệ. Kiểm tra lại trong Cài đặt.|Mở Cài đặt|
|PDF parsing failed|Không đọc được file này. Có thể là PDF scan hoặc bị mã hóa.|Chạy OCR / Thử file khác|
|Timeout: 30s exceeded|AI đang bận. Chờ thêm hoặc thử lại sau 30 giây.|Thử lại / Đổi provider|
|OpenAlex: 429|Đang dùng dữ liệu local. Verify sẽ retry sau vài phút.|(auto retry)|

# **6. Sprint 4 — Launch Checklist**
Mục tiêu: App sẵn sàng cho người dùng thật. Các thứ nhỏ mà researcher sẽ hỏi ngay lần đầu dùng.

⌨️  **6.1  Keyboard Shortcuts**

|**Shortcut**|**Hành động**|**Context**|
| :-: | :-: | :-: |
|**Ctrl+K**|Mở search toàn cục|Toàn app|
|**Ctrl+Enter**|Gửi câu hỏi trong Chat|Chat, Verify|
|**Ctrl+I**|Mở import dialog|Toàn app|
|**Ctrl+Shift+V**|Chuyển sang Verify Mode|Chat đang mở|
|**Ctrl+E**|Export response hiện tại|Chat, Review|
|**Escape**|Đóng modal / hủy thao tác|Mọi modal|
|**Ctrl+/**|Hiện keyboard shortcut cheat sheet|Toàn app|

📎  **6.2  Citation Export**

Researcher cần export citation ngay sau khi đọc xong paper. Đây là feature bị đánh giá thấp nhưng researcher hỏi ngay:

- **Format hỗ trợ:** APA 7th, IEEE, Vancouver, BibTeX, MLA — tối thiểu APA và IEEE cho v0.6.
- **Trigger:** Button "Copy Citation" trên mỗi paper card trong Library và trong Chat response.
- **Auto-fill từ metadata:** Dùng Crossref data (đã có từ v0.3) để điền tên tác giả, năm, journal, DOI chính xác.
- **Copy to clipboard:** Một click → copy → hiện toast "Đã copy citation APA".
- **Export toàn bộ bibliography:** Chọn nhiều paper → Export All → .bib file hoặc .txt formatted.

🔒  **6.3  Privacy Notice**

Đây là USP lớn nhất của ResearchMind — "dữ liệu không rời khỏi máy" — nhưng chưa được communicate rõ trong UI:

- **Badge ở header:** "🔒 Local-first — dữ liệu của bạn không rời khỏi máy tính này" — hiển thị thường xuyên.
- **Settings > Privacy tab:** Giải thích chi tiết: embedding chạy local, chat cloud (nếu dùng cloud mode) chỉ gửi context, không gửi raw file.
- **Khi dùng cloud LLM:** Warning rõ ràng "Câu hỏi và context sẽ được gửi đến [provider]. File PDF gốc không được gửi."
- **Verify Mode:** "Citation data được lấy từ OpenAlex/Crossref — chỉ DOI được gửi, không gửi nội dung paper."

🐞  **6.4  In-App Bug Report**

- **Nút "Báo lỗi"** ở Settings hoặc help menu — không yêu cầu user tự tìm GitHub.
- **Form đơn giản:** Mô tả lỗi + tự động đính kèm app version, OS, log cuối cùng (không đính kèm dữ liệu user).
- **Output:** Copy to clipboard → user paste vào email/Zalo gửi cho dev. Không cần server.
- **App version:** Hiển thị rõ "ResearchMind VN v0.6.0" ở Settings > About và ở title bar.

🖼  **6.5  App Icon & Branding**

- **App icon .ico:** Icon 🧠 gradient xanh → tím, kích thước 16/32/48/128/256px cho Windows.
- **Taskbar icon:** Đúng màu, không bị pixelated trên màn hình Retina/HiDPI.
- **Loading screen:** Splash screen đơn giản với logo + "Đang khởi động..." thay vì màn hình trắng.
- **About dialog:** Version, ngày build, license (MIT), link GitHub, "Made in Vietnam 🇻🇳".

# **7. Định Nghĩa v0.6 Done**

|**Tiêu chí**|**Test**|**Pass khi**|
| :-: | :-: | :-: |
|HTML entity bug đã fix|Manual|Tên bài báo hiển thị đúng ký tự|
|Design system nhất quán — 1 icon library, 1 font, color tokens|Visual review|Không có element nào "lạc điệu" khi screenshot|
|Dark mode hoàn chỉnh|Manual|Không có element nào còn màu hardcode sai|
|Mọi màn hình có empty state đúng|Manual|Library/Search/Chat/Queue đều có message + action|
|Transitions mượt trên mọi tab switch|Manual 60fps|Không có element nào "bật" đột ngột|
|Toast system: success/warning/error/info đúng màu|Manual|4 loại toast xuất hiện đúng màu và duration|
|NCS cài được app trong <5 phút|User test|Cài thành công không cần giải thích|
|Setup Wizard 5 bước hoàn thành|User test|Không có bước nào khiến user bị chặn|
|Error messages bằng tiếng Việt + action button|Manual|Không có error nào bằng tiếng Anh kỹ thuật|
|Citation export APA + IEEE chạy đúng|Unit test|Format đúng với 5 paper test case|
|Ctrl+K, Ctrl+Enter, Ctrl+I hoạt động|Manual|3 shortcut cốt lõi không bị conflict|
|Privacy badge hiển thị ở header|Manual|Researcher thấy "Local-first" ngay khi mở app|
|App icon đúng — không pixelated, đúng màu|Visual|Icon đẹp ở taskbar và Start menu Windows|
|Demo được cho người lạ không cần giải thích|User test|**5 phút demo, người dùng hiểu và muốn thử**|

# **8. v0.6 KHÔNG làm những thứ này**

|**Không làm**|**Lý do**|
| :-: | :-: |
|Thêm AI mode mới|Đã có Chat/Review/Phê bình/Tranh luận/Verify/Literature Review — đủ dùng. Thêm nữa sẽ làm UI phức tạp hơn.|
|Semantic Scholar, Retraction Watch|Để v0.7 sau khi có user thật phản hồi về Verify Mode hiện tại.|
|Mobile app|Desktop trước. Validate product-market fit với desktop rồi mới expand.|
|Cloud sync / Collaboration|Local-first là USP lớn nhất — không pha loãng ở v0.6.|
|Redesign toàn bộ kiến trúc|Chỉ polish lớp ngoài. Backend + core logic không thay đổi.|
|Monetization / Payment|Để v0.7 sau khi có ít nhất 20 user dùng hàng ngày.|

# **9. Roadmap sau v0.6**

|**Version**|**Theme**|**Nội dung chính**|**Điều kiện bắt đầu**|
| :-: | :-: | :-: | :-: |
|**v0.6**|**Polish & Launch**|UI đẹp, onboarding mượt, installer bundled — document này|v0.5 done ✅|
|**v0.7**|**Monetization**|Pro plan 99k/tháng, payment Momo/VNPay, license key|≥20 user dùng hàng ngày|
|**v0.8**|**Academic+**|Semantic Scholar, Retraction Watch, PubMed specialist|Feedback từ user về Verify Mode|
|**v0.9**|**Collaboration**|Lab plan, shared library, team annotation|≥5 paying labs|
|**v1.0**|**Public Launch**|Marketing, ProductHunt, cộng đồng NCS Việt Nam, báo chí|≥200 paying users|

*Sản phẩm tốt không bắt đầu từ code. Nó bắt đầu từ việc ngồi cùng người dùng và lắng nghe.*

ResearchMind VN — v0.6 Plan · 20/06/2026
ResearchMind VN — v0.6 Polish & Launch Plan  |  Trang 
