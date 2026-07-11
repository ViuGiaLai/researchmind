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

// ─── Vietnamese ─────────────────────────────────────────────

const HELP_SECTIONS_VI: Record<HelpSectionId, HelpSectionContent> = {
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

// ─── English ────────────────────────────────────────────────

const HELP_SECTIONS_EN: Record<HelpSectionId, HelpSectionContent> = {
  home: {
    id: "home",
    title: "Help Center",
    subtitle: "Evidence-first research platform: documentation, FAQ, and quick start guide",
    blocks: [
      { type: "p", text: "Welcome to ResearchMind — an evidence-first research platform that helps you create verifiable conclusions from your own papers." },
      { type: "h3", text: "Quick Start" },
      { type: "ul", items: [
        "Open Library → select a PDF folder or import documents",
        "Use Chat AI to ask questions about your selected papers",
        "Go to Review / Evidence for structured analysis",
        "Explore Labs: Deep Analysis, Personal Brain, Daily Reader, Graph",
      ]},
      { type: "h3", text: "Document Index" },
      { type: "ul", items: [
        "Getting Started — introduction and first library",
        "User Guide — each main module in detail",
        "AI Features — chat, review, debate, citation…",
        "Import & Export — PDF, BibTeX, Zotero…",
        "FAQ & Troubleshooting — common questions",
      ]},
    ],
  },

  "getting-started": {
    id: "getting-started",
    title: "Getting Started",
    subtitle: "Introduction to ResearchMind and first steps",
    blocks: [
      { type: "h3", text: "What is ResearchMind?" },
      { type: "p", text: "A desktop application that turns your papers into verifiable answers, evidence, and reviews — with all data stored locally on your machine." },
      { type: "h3", text: "Key Features" },
      { type: "ul", items: [
        "Library — folder scanning, search, highlights, PDF viewer",
        "Chat AI — ask questions per paper or across the whole library",
        "Review — insights, screening, review builder",
        "Evidence — criteria-based evidence matrix",
        "Labs — deep analysis, personal brain, daily reader, graph",
      ]},
      { type: "h3", text: "Loading Documents" },
      { type: "ol", items: [
        "Go to Library → Import or select a folder containing PDFs",
        "Wait for the scan/index process to complete",
        "Papers appear in the list — click to view details or chat",
      ]},
      { type: "h3", text: "Creating Your First Library" },
      { type: "ol", items: [
        "First launch: complete the AI Setup Wizard (choose Cloud Free, Custom API, or Local)",
        "Select a research folder on your hard drive",
        "ResearchMind automatically indexes metadata and embeddings for semantic search",
      ]},
    ],
  },

  "user-guide": {
    id: "user-guide",
    title: "User Guide",
    subtitle: "Detailed walkthrough of each area in the application",
    blocks: [
      { type: "h3", text: "Library Management" },
      { type: "ul", items: [
        "Browse papers as a list or split view with PDF",
        "Filter by tag, year, reading status",
        "Full-text and semantic search in the Search tab",
        "Highlights — citation notes linked to PDF pages",
      ]},
      { type: "h3", text: "Chat AI" },
      { type: "ul", items: [
        "Select papers from the library then click Chat, or chat freely in the Chat AI tab",
        "Enable Strict Evidence mode so the model only responds with in-document citations",
        "Export conversations, copy citations, open PDF at the cited excerpt",
      ]},
      { type: "h3", text: "Paper Review" },
      { type: "ul", items: [
        "Insights — summaries and multi-paper comparisons",
        "Screening — include/exclude/maybe filtering",
        "Review Builder — assemble structured review sections",
      ]},
      { type: "h3", text: "Evidence Extraction" },
      { type: "p", text: "The Evidence Matrix lists claims by paper and criterion — click a cell to see the quote and source." },
      { type: "h3", text: "Notes & Export" },
      { type: "ul", items: [
        "Highlights saved in the library, synced with the PDF viewer",
        "Export BibTeX, copy citations, export chat/review as Markdown",
      ]},
    ],
  },

  "ai-features": {
    id: "ai-features",
    title: "AI Features",
    subtitle: "AI capabilities in ResearchMind",
    blocks: [
      { type: "h3", text: "Summary & Chat AI" },
      { type: "p", text: "Summarize papers, multi-turn Q&A with streaming, citation display, and trust panel so you can verify every conclusion." },
      { type: "h3", text: "AI Review & Critique" },
      { type: "p", text: "Methodology analysis, strengths/weaknesses, and improvement suggestions based on evidence from your documents." },
      { type: "h3", text: "AI Debate" },
      { type: "p", text: "Simulate a debate between different perspectives on a paper or topic." },
      { type: "h3", text: "Research Gap Analysis" },
      { type: "p", text: "Identify research gaps from your selected set of papers." },
      { type: "h3", text: "Citations & Search" },
      { type: "ul", items: [
        "Citation panel — APA, IEEE, BibTeX…",
        "Semantic search — search by meaning, not just keywords",
        "Reranker improves result ranking",
      ]},
      { type: "h3", text: "Deep Analysis (Wow)" },
      { type: "p", text: "Multi-step pipeline: summary, methodology, limitations, contributions, and next-step recommendations." },
    ],
  },

  "import-export": {
    id: "import-export",
    title: "Import & Export",
    subtitle: "Getting data in and out",
    blocks: [
      { type: "h3", text: "Import" },
      { type: "ul", items: [
        "PDF — scan a folder or drag-and-drop individual files",
        "BibTeX / RIS — batch import metadata",
        "Zotero — point to your Zotero data directory in Settings",
        "Word — supported via extract pipeline (if enabled in your version)",
      ]},
      { type: "h3", text: "Export" },
      { type: "ul", items: [
        "BibTeX — all papers or selected ones",
        "Citation copy — multiple academic styles",
        "Chat / Review — Markdown or clipboard",
        "EndNote — via compatible RIS format",
      ]},
    ],
  },

  "settings-help": {
    id: "settings-help",
    title: "Settings",
    subtitle: "AI Provider, interface, storage, and security",
    blocks: [
      { type: "h3", text: "AI Provider" },
      { type: "ul", items: [
        "Cloud Free — use immediately, no API key needed",
        "Custom API — Gemini, DeepSeek, Claude… enter your key in Settings",
        "Local — offline llama-server, requires sufficient RAM/VRAM",
      ]},
      { type: "h3", text: "Interface" },
      { type: "ul", items: [
        "Light / Dark / System mode",
        "AI Workspace interface — teal accent, clear in both light and dark modes",
      ]},
      { type: "h3", text: "Language & API Keys" },
      { type: "p", text: "API keys are stored locally. Papers are never sent externally when using Local mode." },
      { type: "h3", text: "Backup & Local Storage" },
      { type: "ul", items: [
        "Index data and cache are stored on your machine",
        "Clear embedding/LLM cache in the Data tab when you need to free up space",
        "Back up the app data directory periodically",
      ]},
    ],
  },

  faq: {
    id: "faq",
    title: "Frequently Asked Questions",
    subtitle: "FAQ",
    blocks: [
      {
        type: "faq",
        items: [
          { q: "Why is AI response slow?", a: "Cloud models depend on network speed; local models depend on CPU/GPU. Try reducing the number of context papers or using a lighter model in Settings." },
          { q: "Why can't PDF be read?", a: "The file may be a scanned image (needs OCR), encrypted, or the path may have changed. Check the file opens in another reader and re-scan the library." },
          { q: "Why are citations wrong?", a: "Missing author/year metadata — edit the paper metadata or choose a compatible citation style in the Cite panel." },
          { q: "Which model should I use?", a: "Cloud Free to start; Custom API for higher quality; Local for absolute privacy when you have sufficient GPU/RAM." },
          { q: "Is my data uploaded to the cloud?", a: "Local mode: no. Cloud modes only send the necessary prompts to your chosen provider — paper indexes stay on your machine." },
        ],
      },
    ],
  },

  shortcuts: {
    id: "shortcuts",
    title: "Keyboard Shortcuts",
    subtitle: "Keyboard shortcuts",
    blocks: [
      {
        type: "shortcuts",
        items: [
          { keys: "Ctrl + K", action: "Quick search / focus search field (when available)" },
          { keys: "Ctrl + F", action: "Find in page / PDF viewer" },
          { keys: "Ctrl + Enter", action: "Send Chat message" },
          { keys: "Esc", action: "Close modal, Help Center, menu" },
          { keys: "/", action: "Focus Chat input (when on Chat tab)" },
          { keys: "Ctrl + ,", action: "Open Settings" },
        ],
      },
      { type: "p", text: "More shortcuts are being added gradually per module." },
    ],
  },

  "release-notes": {
    id: "release-notes",
    title: "What's New",
    subtitle: "Release notes",
    blocks: [
      {
        type: "releases",
        items: [
          {
            version: "v0.6.0",
            items: [
              "AI Workspace interface — teal, dark/light/system modes",
              "Help Center, Welcome Tour, and updated release notes",
              "APA/IEEE citation export and quick citation copy",
              "Privacy badge, onboarding, and core keyboard shortcuts",
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
    title: "Troubleshooting",
    subtitle: "Troubleshooting guide",
    blocks: [
      { type: "h3", text: "AI Errors" },
      { type: "ul", items: [
        "Check backend: Settings → Health check",
        "Verify API key or llama-server is running (local)",
        "Check logs in the terminal when running pnpm tauri dev",
      ]},
      { type: "h3", text: "Embedding Error" },
      { type: "ul", items: [
        "Clear embedding cache in Settings → Data",
        "Re-index the library after changing the embedding model",
      ]},
      { type: "h3", text: "Import Error" },
      { type: "ul", items: [
        "Ensure folder read permissions (Windows: not blocked by OneDrive lock)",
        "Corrupt PDF file — try opening with Acrobat/Edge",
      ]},
      { type: "h3", text: "GPU / Local model" },
      { type: "ul", items: [
        "Insufficient VRAM → choose a smaller model or use CPU",
        "Install the latest GPU driver for CUDA/Metal",
      ]},
    ],
  },

  about: {
    id: "about",
    title: "About ResearchMind",
    subtitle: "Version, license, and links",
    blocks: [
      { type: "p", text: `ResearchMind v${APP_VERSION} — an evidence-first research platform prioritizing verifiable research and local data storage.` },
      { type: "h3", text: "Information" },
      { type: "ul", items: [
        `Version: ${APP_VERSION}`,
        "License: see the GitHub repository",
        "Data: stored locally on your device",
      ]},
      {
        type: "links",
        items: [
          { label: "GitHub", href: GITHUB_URL },
          { label: "Report an Issue", href: BUG_REPORT_URL },
          { label: "Contact Support", href: `mailto:${CONTACT_EMAIL}` },
        ],
      },
    ],
  },
};

// ─── Japanese ────────────────────────────────────────────────

const HELP_SECTIONS_JA: Record<HelpSectionId, HelpSectionContent> = {
  home: {
    id: "home",
    title: "ヘルプセンター",
    subtitle: "エビデンス重視の研究プラットフォーム：ドキュメント、FAQ、クイックスタートガイド",
    blocks: [
      { type: "p", text: "ResearchMindへようこそ — 自分の論文から検証可能な結論を導き出すためのエビデンス重視の研究プラットフォームです。" },
      { type: "h3", text: "クイックスタート" },
      { type: "ul", items: [
        "ライブラリを開く → PDFフォルダを選択または文書をインポート",
        "Chat AIを使って選択した論文について質問する",
        "レビュー/エビデンスで構造化分析を行う",
        "ラボを探索：ディープ分析、パーソナル脳、デイリーリーダー、グラフ",
      ]},
      { type: "h3", text: "ドキュメント一覧" },
      { type: "ul", items: [
        "はじめに — 導入と最初のライブラリ",
        "ユーザーガイド — 各主要モジュール",
        "AI機能 — チャット、レビュー、ディベート、引用…",
        "インポート＆エクスポート — PDF、BibTeX、Zotero…",
        "FAQ＆トラブルシューティング — よくある質問",
      ]},
    ],
  },

  "getting-started": {
    id: "getting-started",
    title: "はじめに",
    subtitle: "ResearchMindの紹介と最初のステップ",
    blocks: [
      { type: "h3", text: "ResearchMindとは？" },
      { type: "p", text: "論文を検証可能な回答、エビデンス、レビューに変換するデスクトップアプリケーションです。すべてのデータはお使いのマシンにローカル保存されます。" },
      { type: "h3", text: "主な機能" },
      { type: "ul", items: [
        "ライブラリ — フォルダスキャン、検索、ハイライト、PDFビューア",
        "Chat AI — 論文ごとまたはライブラリ全体に対して質問",
        "レビュー — インサイト、スクリーニング、レビュービルダー",
        "エビデンス — 基準に基づくエビデンスマトリックス",
        "ラボ — ディープ分析、パーソナル脳、デイリーリーダー、グラフ",
      ]},
      { type: "h3", text: "文書の読み込み" },
      { type: "ol", items: [
        "ライブラリへ → インポートまたはPDFを含むフォルダを選択",
        "スキャン/インデックス処理の完了を待つ",
        "論文がリストに表示されます — クリックで詳細表示またはチャット",
      ]},
      { type: "h3", text: "最初のライブラリを作成" },
      { type: "ol", items: [
        "初回起動時：AIセットアップウィザードを完了（Cloud Free、カスタムAPI、またはローカルを選択）",
        "ハードドライブ上の研究フォルダを選択",
        "ResearchMindが自動的にメタデータと埋め込みをインデックスし、セマンティック検索に対応",
      ]},
    ],
  },

  "user-guide": {
    id: "user-guide",
    title: "ユーザーガイド",
    subtitle: "アプリケーションの各エリアの詳細な説明",
    blocks: [
      { type: "h3", text: "ライブラリ管理" },
      { type: "ul", items: [
        "論文をリスト表示またはPDFとの分割ビューで閲覧",
        "タグ、年、読書状態でフィルタリング",
        "検索タブで全文検索とセマンティック検索",
        "ハイライト — PDFページにリンクされた引用メモ",
      ]},
      { type: "h3", text: "Chat AI" },
      { type: "ul", items: [
        "ライブラリから論文を選択してチャット、またはChat AIタブで自由にチャット",
        "厳格エビデンスモードを有効にすると、モデルは文書内の引用がある場合のみ回答",
        "会話のエクスポート、引用のコピー、引用箇所のPDFを開く",
      ]},
      { type: "h3", text: "論文レビュー" },
      { type: "ul", items: [
        "インサイト — 要約と複数論文の比較",
        "スクリーニング — 包含/除外/保留のフィルタリング",
        "レビュービルダー — 構造化レビューセクションの作成",
      ]},
      { type: "h3", text: "エビデンス抽出" },
      { type: "p", text: "エビデンスマトリックスは論文と基準ごとに主張を一覧表示します — セルをクリックして引用とソースを確認できます。" },
      { type: "h3", text: "メモ＆エクスポート" },
      { type: "ul", items: [
        "ハイライトはライブラリに保存され、PDFビューアと同期",
        "BibTeXのエクスポート、引用のコピー、チャット/レビューをMarkdownでエクスポート",
      ]},
    ],
  },

  "ai-features": {
    id: "ai-features",
    title: "AI機能",
    subtitle: "ResearchMindのAI機能",
    blocks: [
      { type: "h3", text: "要約＆Chat AI" },
      { type: "p", text: "論文の要約、ストリーミングによるマルチターンQ&A、引用表示とトラストパネルで各結論を検証できます。" },
      { type: "h3", text: "AIレビュー＆批評" },
      { type: "p", text: "方法論の分析、長所/短所、文書のエビデンスに基づく改善提案。" },
      { type: "h3", text: "AIディベート" },
      { type: "p", text: "論文やトピックに関する異なる視点間のディベートをシミュレーション。" },
      { type: "h3", text: "研究ギャップ分析" },
      { type: "p", text: "選択した論文セットから研究ギャップを特定。" },
      { type: "h3", text: "引用＆検索" },
      { type: "ul", items: [
        "引用パネル — APA、IEEE、BibTeX…",
        "セマンティック検索 — キーワードだけでなく意味で検索",
        "リランカーが結果のランキングを改善",
      ]},
      { type: "h3", text: "ディープ分析（Wow）" },
      { type: "p", text: "マルチステップパイプライン：要約、方法論、限界、貢献、次のステップの推奨。" },
    ],
  },

  "import-export": {
    id: "import-export",
    title: "インポート＆エクスポート",
    subtitle: "データの入出力",
    blocks: [
      { type: "h3", text: "インポート" },
      { type: "ul", items: [
        "PDF — フォルダのスキャンまたはファイルのドラッグ＆ドロップ",
        "BibTeX / RIS — メタデータの一括インポート",
        "Zotero — 設定でZoteroデータディレクトリを指定",
        "Word — 抽出パイプラインで対応（バージョンにより有効な場合）",
      ]},
      { type: "h3", text: "エクスポート" },
      { type: "ul", items: [
        "BibTeX — 全論文または選択した論文",
        "引用コピー — 複数の学術スタイル",
        "チャット/レビュー — Markdownまたはクリップボード",
        "EndNote — 互換性のあるRIS形式で",
      ]},
    ],
  },

  "settings-help": {
    id: "settings-help",
    title: "設定",
    subtitle: "AIプロバイダー、インターフェース、ストレージ、セキュリティ",
    blocks: [
      { type: "h3", text: "AIプロバイダー" },
      { type: "ul", items: [
        "Cloud Free — すぐに使用可能、APIキー不要",
        "カスタムAPI — Gemini、DeepSeek、Claude… 設定でキーを入力",
        "ローカル — オフラインのllama-server、十分なRAM/VRAMが必要",
      ]},
      { type: "h3", text: "インターフェース" },
      { type: "ul", items: [
        "ライト/ダーク/システムモード",
        "AIワークスペースインターフェース — ティールアクセント、明るい/暗い両方でクリア",
      ]},
      { type: "h3", text: "言語＆APIキー" },
      { type: "p", text: "APIキーはローカルに保存されます。ローカルモード使用時は論文が外部に送信されることはありません。" },
      { type: "h3", text: "バックアップ＆ローカルストレージ" },
      { type: "ul", items: [
        "インデックスデータとキャッシュはお使いのマシンに保存",
        "容量を解放する必要がある場合は、データタブで埋め込み/LLMキャッシュをクリア",
        "アプリケーションデータディレクトリを定期的にバックアップ",
      ]},
    ],
  },

  faq: {
    id: "faq",
    title: "よくある質問",
    subtitle: "FAQ",
    blocks: [
      {
        type: "faq",
        items: [
          { q: "AIの応答が遅いのはなぜですか？", a: "クラウドモデルはネットワーク速度に依存し、ローカルモデルはCPU/GPUに依存します。コンテキストの論文数を減らすか、設定で軽量モデルをお試しください。" },
          { q: "PDFが読めないのはなぜですか？", a: "ファイルがスキャン画像（OCRが必要）、暗号化されている、またはパスが変更された可能性があります。別のリーダーで開けるか確認し、ライブラリを再スキャンしてください。" },
          { q: "引用が間違っているのはなぜですか？", a: "著者/年のメタデータが不足しています — 論文メタデータを編集するか、Citeパネルで互換性のある引用スタイルを選択してください。" },
          { q: "どのモデルを使うべきですか？", a: "最初はCloud Free、高品質にはカスタムAPI、プライバシー重視で十分なGPU/RAMがある場合はローカルモデルをお勧めします。" },
          { q: "データはクラウドにアップロードされますか？", a: "ローカルモード：いいえ。クラウドモードでは、必要なプロンプトのみを選択したプロバイダーに送信します — 論文インデックスはお使いのマシンに残ります。" },
        ],
      },
    ],
  },

  shortcuts: {
    id: "shortcuts",
    title: "キーボードショートカット",
    subtitle: "キーボードショートカット",
    blocks: [
      {
        type: "shortcuts",
        items: [
          { keys: "Ctrl + K", action: "クイック検索/検索フィールドにフォーカス（使用可能な場合）" },
          { keys: "Ctrl + F", action: "ページ内検索/PDFビューア" },
          { keys: "Ctrl + Enter", action: "Chatメッセージを送信" },
          { keys: "Esc", action: "モーダル、ヘルプセンター、メニューを閉じる" },
          { keys: "/", action: "Chat入力にフォーカス（Chatタブの場合）" },
          { keys: "Ctrl + ,", action: "設定を開く" },
        ],
      },
      { type: "p", text: "その他のショートカットは各モジュールに順次追加されています。" },
    ],
  },

  "release-notes": {
    id: "release-notes",
    title: "新機能",
    subtitle: "リリースノート",
    blocks: [
      {
        type: "releases",
        items: [
          {
            version: "v0.6.0",
            items: [
              "AIワークスペースインターフェース — ティール、ダーク/ライト/システムモード",
              "ヘルプセンター、ウェルカムツアー、更新されたリリースノート",
              "APA/IEEE引用のエクスポートとクイック引用コピー",
              "プライバシーバッジ、オンボーディング、コアキーボードショートカット",
            ],
          },
          {
            version: "v0.5.x",
            items: [
              "エビデンスマトリックス＆トラストパネル",
              "Wow Analysisパイプライン",
              "パーソナル脳＆デイリーリーダー",
            ],
          },
        ],
      },
    ],
  },

  troubleshooting: {
    id: "troubleshooting",
    title: "トラブルシューティング",
    subtitle: "トラブルシューティングガイド",
    blocks: [
      { type: "h3", text: "AIエラー" },
      { type: "ul", items: [
        "バックエンドを確認：設定 → ヘルスチェック",
        "APIキーまたはllama-serverが実行中であることを確認（ローカル）",
        "pnpm tauri dev実行時のターミナルログを確認",
      ]},
      { type: "h3", text: "埋め込みエラー" },
      { type: "ul", items: [
        "設定 → データで埋め込みキャッシュをクリア",
        "埋め込みモデル変更後にライブラリを再インデックス",
      ]},
      { type: "h3", text: "インポートエラー" },
      { type: "ul", items: [
        "フォルダの読み取り権限を確認（Windows：OneDriveロックによるブロックがないか）",
        "PDFファイルが破損している場合 — Acrobat/Edgeで開いてみる",
      ]},
      { type: "h3", text: "GPU / ローカルモデル" },
      { type: "ul", items: [
        "VRAM不足 → より小さいモデルを選択するかCPUを使用",
        "CUDA/Metal用の最新GPUドライバーをインストール",
      ]},
    ],
  },

  about: {
    id: "about",
    title: "ResearchMindについて",
    subtitle: "バージョン、ライセンス、リンク",
    blocks: [
      { type: "p", text: `ResearchMind v${APP_VERSION} — 検証可能な研究とローカルデータ保存を優先するエビデンス重視の研究プラットフォーム。` },
      { type: "h3", text: "情報" },
      { type: "ul", items: [
        `バージョン: ${APP_VERSION}`,
        "ライセンス: GitHubリポジトリを参照",
        "データ: お使いのデバイスにローカル保存",
      ]},
      {
        type: "links",
        items: [
          { label: "GitHub", href: GITHUB_URL },
          { label: "バグ報告", href: BUG_REPORT_URL },
          { label: "サポート問い合わせ", href: `mailto:${CONTACT_EMAIL}` },
        ],
      },
    ],
  },
};

// ─── Selector ───────────────────────────────────────────────

const HELP_SECTIONS_MAP: Record<string, Record<HelpSectionId, HelpSectionContent>> = {
  vi: HELP_SECTIONS_VI,
  en: HELP_SECTIONS_EN,
  ja: HELP_SECTIONS_JA,
};

export function getHelpSections(lang: string): Record<HelpSectionId, HelpSectionContent> {
  return HELP_SECTIONS_MAP[lang] || HELP_SECTIONS_VI;
}

// ─── Welcome Tour ──────────────────────────────────────────

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
