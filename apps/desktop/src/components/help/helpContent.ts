import { HELP_SECTIONS_EN as HELP_SECTIONS_EN_IMPORTED } from "./helpContent.en";

export type HelpSectionId =
  | "home"
  | "getting-started"
  | "user-guide"
  | "ai-features"
  | "import-export"
  | "settings-help"
  | "faq"
  | "shortcuts"
  | "release-notes"
  | "troubleshooting"
  | "about";

export interface HelpNavItem {
  id: HelpSectionId;
  label: string;
  group?: string;
}

export interface HelpFaqItem {
  q: string;
  a: string;
}

export interface HelpShortcutItem {
  keys: string;
  action: string;
}

export interface HelpReleaseItem {
  version: string;
  items: string[];
}

export interface HelpSectionContent {
  id: HelpSectionId;
  title: string;
  subtitle: string;
  blocks: HelpBlock[];
}

export type HelpBlock =
  | { type: "p"; text: string }
  | { type: "h3"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "faq"; items: HelpFaqItem[] }
  | { type: "shortcuts"; items: HelpShortcutItem[] }
  | { type: "releases"; items: HelpReleaseItem[] }
  | { type: "links"; items: { label: string; href: string }[] };

export const HELP_NAV: HelpNavItem[] = [
  { id: "home", label: "help_nav.home", group: "help_group.overview" },
  { id: "getting-started", label: "help_nav.getting_started", group: "help_group.overview" },
  { id: "user-guide", label: "help_nav.user_guide", group: "help_group.docs" },
  { id: "ai-features", label: "help_nav.ai_features", group: "help_group.docs" },
  { id: "import-export", label: "help_nav.import_export", group: "help_group.docs" },
  { id: "settings-help", label: "help_nav.settings", group: "help_group.docs" },
  { id: "faq", label: "help_nav.faq", group: "help_group.support" },
  { id: "shortcuts", label: "help_nav.shortcuts", group: "help_group.support" },
  { id: "release-notes", label: "help_nav.release_notes", group: "help_group.support" },
  { id: "troubleshooting", label: "help_nav.troubleshooting", group: "help_group.support" },
  { id: "about", label: "help_nav.about", group: "help_group.support" },
];

export const APP_VERSION = "0.6.0";
export const GITHUB_URL = "https://github.com/researchmind/researchmind";
export const BUG_REPORT_URL = "https://github.com/researchmind/researchmind/issues/new";
export const CONTACT_EMAIL = "support@researchmind.app";

export const HELP_SECTIONS_VI: Record<HelpSectionId, HelpSectionContent> = {
  home: {
    id: "home",
    title: "Trung tâm trợ giúp",
    subtitle: "Nền tảng nghiên cứu ưu tiên bằng chứng: tài liệu, FAQ và hướng dẫn nhanh",
    blocks: [
      { type: "p", text: "Chào mừng bạn đến với ResearchMind — nền tảng nghiên cứu ưu tiên bằng chứng giúp bạn tạo kết luận có thể kiểm chứng từ chính bộ paper của mình." },
      { type: "h3", text: "Bắt đầu nhanh" },
      { type: "ul", items: [
        "Mở Thư viện → chọn thư mục PDF hoặc import tài liệu",
        "Dùng Chat AI để hỏi về paper đã chọn",
        "Vào Đánh giá / Bằng chứng để phân tích có cấu trúc",
        "Khám phá Phòng thí nghiệm: Phân tích sâu, Bộ não, Đọc hôm nay, Biểu đồ",
      ]},
      { type: "h3", text: "Mục lục tài liệu" },
      { type: "ul", items: [
        "Bắt đầu — giới thiệu và thư viện đầu tiên",
        "Hướng dẫn sử dụng — từng module chính",
        "Tính năng AI — chat, review, debate, citation…",
        "Nhập / Xuất — PDF, BibTeX, Zotero…",
        "FAQ & Xử lý sự cố — câu hỏi thường gặp",
      ]},
    ],
  },

  "getting-started": {
    id: "getting-started",
    title: "Bắt đầu",
    subtitle: "Giới thiệu ResearchMind và các bước đầu tiên",
    blocks: [
      { type: "h3", text: "ResearchMind là gì?" },
      { type: "p", text: "Ứng dụng desktop giúp bạn chuyển paper thành câu trả lời, bằng chứng và review có thể kiểm chứng — dữ liệu lưu trên máy bạn." },
      { type: "h3", text: "Tính năng chính" },
      { type: "ul", items: [
        "Thư viện — quét thư mục, tìm kiếm, highlight, PDF viewer",
        "Chat AI — hỏi đáp theo paper hoặc toàn thư viện",
        "Đánh giá — insights, screening, review builder",
        "Bằng chứng — ma trận evidence theo tiêu chí",
        "Thí nghiệm — phân tích sâu, bộ não cá nhân, đọc hôm nay, graph",
      ]},
      { type: "h3", text: "Tải tài liệu" },
      { type: "ol", items: [
        "Vào Thư viện → Import hoặc chọn thư mục chứa PDF",
        "Đợi quá trình scan/index hoàn tất",
        "Paper xuất hiện trong danh sách — bấm để xem chi tiết hoặc chat",
      ]},
      { type: "h3", text: "Tạo thư viện đầu tiên" },
      { type: "ol", items: [
        "Lần đầu mở app: hoàn tất AI Setup Wizard (chọn Cloud Free, API riêng hoặc local)",
        "Chọn thư mục nghiên cứu trên ổ cứng",
        "ResearchMind tự index metadata và embedding để tìm kiếm semantic",
      ]},
    ],
  },

  "user-guide": {
    id: "user-guide",
    title: "Hướng dẫn sử dụng",
    subtitle: "Chi tiết từng khu vực trong ứng dụng",
    blocks: [
      { type: "h3", text: "Quản lý thư viện" },
      { type: "ul", items: [
        "Duyệt paper dạng danh sách hoặc split view với PDF",
        "Lọc theo tag, năm, trạng thái đọc",
        "Tìm kiếm full-text và semantic search trong tab Tìm kiếm",
        "Highlights — ghi chú trích dẫn gắn với trang PDF",
      ]},
      { type: "h3", text: "Chat AI" },
      { type: "ul", items: [
        "Chọn paper từ thư viện rồi bấm Chat, hoặc chat tự do trong tab Chat AI",
        "Bật Chỉ bằng chứng để model chỉ trả lời khi có citation trong tài liệu",
        "Xuất hội thoại, copy citation, mở PDF tại đoạn trích",
      ]},
      { type: "h3", text: "Đánh giá bài báo" },
      { type: "ul", items: [
        "Insights — tóm tắt, so sánh nhiều paper",
        "Screening — lọc include/exclude/maybe",
        "Review Builder — ghép các phần review có cấu trúc",
      ]},
      { type: "h3", text: "Trích xuất bằng chứng" },
      { type: "p", text: "Ma trận Evidence liệt kê claim theo paper và tiêu chí — bấm ô để xem quote và nguồn." },
      { type: "h3", text: "Ghi chú & Export" },
      { type: "ul", items: [
        "Highlights lưu trong thư viện, đồng bộ với PDF viewer",
        "Export BibTeX, copy citation, xuất chat/review dạng Markdown",
      ]},
    ],
  },

  "ai-features": {
    id: "ai-features",
    title: "Tính năng AI",
    subtitle: "Các khả năng AI trong ResearchMind",
    blocks: [
      { type: "h3", text: "Tóm tắt & Chat AI" },
      { type: "p", text: "Tóm tắt paper, hỏi đáp đa lượt với streaming, hiển thị citation và trust panel để bạn kiểm chứng từng kết luận." },
      { type: "h3", text: "Đánh giá & Phê bình AI" },
      { type: "p", text: "Phân tích phương pháp, điểm mạnh/yếu và đề xuất cải thiện dựa trên bằng chứng từ tài liệu." },
      { type: "h3", text: "Tranh luận AI" },
      { type: "p", text: "Mô phỏng tranh luận giữa các quan điểm về một paper hoặc chủ đề." },
      { type: "h3", text: "Phân tích khoảng trống" },
      { type: "p", text: "Xác định khoảng trống nghiên cứu từ tập paper đã chọn." },
      { type: "h3", text: "Trích dẫn & Tìm kiếm" },
      { type: "ul", items: [
        "Citation panel — APA, IEEE, BibTeX…",
        "Semantic search — tìm theo ý nghĩa, không chỉ từ khóa",
        "Reranker cải thiện thứ hạng kết quả",
      ]},
      { type: "h3", text: "Phân tích sâu (Wow)" },
      { type: "p", text: "Pipeline đa bước: tóm tắt, phương pháp, hạn chế, đóng góp, đề xuất hướng tiếp theo." },
    ],
  },

  "import-export": {
    id: "import-export",
    title: "Nhập & Xuất",
    subtitle: "Đưa dữ liệu vào và xuất ra ngoài",
    blocks: [
      { type: "h3", text: "Nhập" },
      { type: "ul", items: [
        "PDF — quét thư mục hoặc kéo thả từng file",
        "BibTeX / RIS — import metadata batch",
        "Zotero — chỉ đường dẫn thư mục data Zotero trong Cài đặt",
        "Word — hỗ trợ qua pipeline extract (nếu bật trong phiên bản của bạn)",
      ]},
      { type: "h3", text: "Xuất" },
      { type: "ul", items: [
        "BibTeX — toàn bộ hoặc paper đã chọn",
        "Citation copy — nhiều style học thuật",
        "Chat / Review — Markdown hoặc clipboard",
        "EndNote — qua định dạng RIS tương thích",
      ]},
    ],
  },

  "settings-help": {
    id: "settings-help",
    title: "Cài đặt",
    subtitle: "AI Provider, giao diện, lưu trữ và bảo mật",
    blocks: [
      { type: "h3", text: "Nhà cung cấp AI" },
      { type: "ul", items: [
        "Cloud Free — dùng ngay, không cần API key",
        "Custom API — Gemini, DeepSeek, Claude… nhập key trong Cài đặt",
        "Local — llama-server offline, cần RAM/VRAM đủ",
      ]},
      { type: "h3", text: "Giao diện" },
      { type: "ul", items: [
        "Chế độ Sáng / Tối / Hệ thống",
        "Giao diện AI Workspace — accent teal, rõ ràng ở cả chế độ sáng và tối",
      ]},
      { type: "h3", text: "Ngôn ngữ & API Keys" },
      { type: "p", text: "API keys lưu cục bộ. Không gửi paper ra ngoài khi dùng chế độ Local." },
      { type: "h3", text: "Backup & Local Storage" },
      { type: "ul", items: [
        "Dữ liệu index và cache nằm trên máy bạn",
        "Xóa cache embedding/LLM trong tab Dữ liệu khi cần giải phóng dung lượng",
        "Sao lưu thư mục dữ liệu app định kỳ",
      ]},
    ],
  },

  faq: {
    id: "faq",
    title: "Câu hỏi thường gặp",
    subtitle: "FAQ",
    blocks: [
      {
        type: "faq",
        items: [
          { q: "Tại sao AI trả lời chậm?", a: "Model cloud phụ thuộc mạng; model local phụ thuộc CPU/GPU. Thử giảm số paper context hoặc dùng model nhẹ hơn trong Cài đặt." },
          { q: "Tại sao PDF không đọc được?", a: "File có thể scan ảnh (cần OCR), bị mã hóa, hoặc đường dẫn đã đổi. Kiểm tra file mở được bằng reader khác và re-scan thư viện." },
          { q: "Tại sao Citation sai?", a: "Metadata thiếu tác giả/năm — sửa metadata paper hoặc chọn style citation phù hợp trong Cite panel." },
          { q: "Model nào nên dùng?", a: "Cloud Free cho bắt đầu; API riêng cho chất lượng cao; Local khi cần riêng tư tuyệt đối và có GPU/RAM đủ." },
          { q: "Dữ liệu có lên cloud không?", a: "Chế độ Local: không. Các chế độ Cloud chỉ gửi prompt cần thiết tới nhà cung cấp bạn chọn — paper index vẫn ở máy bạn." },
        ],
      },
    ],
  },

  shortcuts: {
    id: "shortcuts",
    title: "Phím tắt",
    subtitle: "Phím tắt bàn phím",
    blocks: [
      {
        type: "shortcuts",
        items: [
          { keys: "Ctrl + K", action: "Tìm kiếm nhanh / focus ô tìm (khi có)" },
          { keys: "Ctrl + F", action: "Tìm trong trang / PDF viewer" },
          { keys: "Ctrl + Enter", action: "Gửi tin nhắn Chat" },
          { keys: "Esc", action: "Đóng modal, Help Center, menu" },
          { keys: "/", action: "Focus ô nhập Chat (khi đang ở tab Chat)" },
          { keys: "Ctrl + ,", action: "Mở Cài đặt" },
        ],
      },
      { type: "p", text: "Một số phím tắt đang được bổ sung dần theo từng module." },
    ],
  },

  "release-notes": {
    id: "release-notes",
    title: "Có gì mới",
    subtitle: "Ghi chú phát hành",
    blocks: [
      {
        type: "releases",
        items: [
          {
            version: "v0.6.0",
            items: [
              "Giao diện AI Workspace — teal, tối/sáng/hệ thống",
              "Trung tâm trợ giúp, Tour giới thiệu và release notes cập nhật",
              "Citation export APA/IEEE và copy citation nhanh",
              "Privacy badge, onboarding và phím tắt cốt lõi",
            ],
          },
          {
            version: "v0.5.x",
            items: [
              "Evidence Matrix & Trust Panel",
              "Wow Analysis pipeline",
              "Personal Brain & Daily Reader",
            ],
          },
        ],
      },
    ],
  },

  troubleshooting: {
    id: "troubleshooting",
    title: "Xử lý sự cố",
    subtitle: "Khắc phục sự cố",
    blocks: [
      { type: "h3", text: "Lỗi AI" },
      { type: "ul", items: [
        "Kiểm tra backend: Cài đặt → Kiểm tra health",
        "Xác minh API key hoặc llama-server đang chạy (local)",
        "Xem log trong terminal khi chạy pnpm tauri dev",
      ]},
      { type: "h3", text: "Embedding Error" },
      { type: "ul", items: [
        "Xóa embedding cache trong Cài đặt → Dữ liệu",
        "Re-index thư viện sau khi đổi model embedding",
      ]},
      { type: "h3", text: "Import Error" },
      { type: "ul", items: [
        "Đảm bảo quyền đọc thư mục (Windows: không chặn bởi OneDrive lock)",
        "File PDF corrupt — thử mở bằng Acrobat/Edge",
      ]},
      { type: "h3", text: "GPU / Local model" },
      { type: "ul", items: [
        "VRAM không đủ → chọn model nhỏ hơn hoặc dùng CPU",
        "Cài driver GPU mới nhất cho CUDA/Metal",
      ]},
    ],
  },

  about: {
    id: "about",
    title: "Về ResearchMind",
    subtitle: "Phiên bản, giấy phép và liên kết",
    blocks: [
      { type: "p", text: `ResearchMind v${APP_VERSION} — nền tảng nghiên cứu ưu tiên bằng chứng, ưu tiên nghiên cứu có thể kiểm chứng và dữ liệu cục bộ.` },
      { type: "h3", text: "Thông tin" },
      { type: "ul", items: [
        `Phiên bản: ${APP_VERSION}`,
        "License: xem repository GitHub",
        "Dữ liệu: lưu trữ cục bộ trên thiết bị của bạn",
      ]},
      {
        type: "links",
        items: [
          { label: "GitHub", href: GITHUB_URL },
          { label: "Báo lỗi", href: BUG_REPORT_URL },
          { label: "Liên hệ hỗ trợ", href: `mailto:${CONTACT_EMAIL}` },
        ],
      },
    ],
  },
};

export { HELP_SECTIONS_EN } from "./helpContent.en";

export function getHelpSections(language: string): Record<HelpSectionId, HelpSectionContent> {
  if (language.toLowerCase().startsWith("vi")) return HELP_SECTIONS_VI;
  return requireEnglishHelpSections();
}

function requireEnglishHelpSections(): Record<HelpSectionId, HelpSectionContent> {
  return HELP_SECTIONS_EN_IMPORTED;
}

export const WELCOME_TOUR_STEPS = [
  {
    id: "library",
    title: "welcome_tour.title_library",
    body: "welcome_tour.body_library",
    target: "sidebar-library",
  },
  {
    id: "chat",
    title: "welcome_tour.title_chat",
    body: "welcome_tour.body_chat",
    target: "sidebar-chat",
  },
  {
    id: "review",
    title: "welcome_tour.title_review",
    body: "welcome_tour.body_review",
    target: "sidebar-review",
  },
  {
    id: "labs",
    title: "welcome_tour.title_labs",
    body: "welcome_tour.body_labs",
    target: "sidebar-labs",
  },
  {
    id: "help",
    title: "welcome_tour.title_help",
    body: "welcome_tour.body_help",
    target: "app-help-btn",
  },
];

export const WELCOME_STORAGE_KEY = "researchmind:welcome-seen";
