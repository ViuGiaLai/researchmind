# ResearchMind VN — 📋 Trạng Thái Dự Án

> **Cập nhật:** 15/06/2026
> **Mục tiêu:** Trợ lý nghiên cứu AI cho học giả Việt Nam — Local-first, 8 tuần MVP

---

## 📊 Tổng Quan

| Hạng mục | Trạng thái | Tiến độ |
|---|---|---|
| 📐 Plan & Spec | ✅ Đã viết lại | 6/6 files |
| 🐍 Python Backend | ✅ Hoàn thành | 14 files |
| 🖥️ React Frontend | ✅ Hoàn thành | 6 components |
| 📄 PDF Ingestion Pipeline | ✅ Hoàn thành | parser + chunker + embedder |
| 🔍 Search Engine (Hybrid) | ✅ Hoàn thành | BM25 + Vector + RRF + Cross-encoder |
| 💬 AI Chat (RAG) | ✅ Hoàn thành | retriever + generator (Ollama/Claude) |
| 📚 Library Management | ✅ Hoàn thành | CRUD + filter + pagination |
| 📥 PDF Import UI | ✅ Hoàn thành | Drag & drop + file + folder |
| 🛠️ Tauri Shell | ✅ Đã rewrite | Thin shell cho Python backend |
| 🧪 Testing | 🔴 Chưa chạy | Cần setup .venv |
| 🗑️ Crate cũ | 🟡 Còn trên disk | Cần user xoá thủ công |
| 🗑️ plan/HYBRID_MODEL.md.copy | 🟡 File thừa | Cần xoá thủ công |

---

## ✅ Phần 1: NHỮNG GÌ ĐÃ LÀM (Done)

### Hybrid Model — Cloud-first AI Mode
- ✅ `/api/detect-specs` — Auto-detect RAM, CPU, suggest model tier
- ✅ Settings API masks `claude_api_key` (hiện `"***"`)
- ✅ SettingsView rewrite: mode selector cards, API key input, model tiers
- ✅ AISetupWizard: first-run onboarding (welcome → choose mode → configure → done)
- ✅ App.tsx: auto-show wizard nếu chưa cấu hình
- ✅ step indicator fixed, retry limit 5, unused var removed, psutil added

### Plan Files (6/6)
| File | Trạng thái |
|---|---|
| `plan/ResearchMind_VN_Plan.md` | ✅ |
| `plan/architecture.md` | ✅ Viết lại |
| `plan/phase1-mvp-spec.md` | ✅ Viết lại |
| `plan/roadmap.md` | ✅ Viết lại |
| `plan/HYBRID_MODEL.md` | ✅ Thêm mới |
| `have_done_plan/next-steps.md` | ✅ Cập nhật |
| `have_done_plan/tracking.md` | ✅ File này |

### Backend Python (14 files)
| Module | Files | Chức năng |
|---|---|---|
| config | `settings.py` | Pydantic Settings |
| db | `database.py`, `models.py` | SQLAlchemy + 5 tables |
| ingestion | `parser.py`, `chunker.py`, `embedder.py` | PyMuPDF → chunk → bge-m3 |
| search | `bm25.py`, `vector.py`, `hybrid.py` | FTS5 + ChromaDB + RRF + Cross-encoder |
| chat | `retriever.py`, `generator.py` | RAG + Ollama/Claude + citations |
| main | `main.py` | FastAPI: 16 endpoints |
| CLI | `prototype_cli.py` | Test CLI: import/search/chat/list/stats/delete |

### Frontend React (6 components)
| Component | Chức năng |
|---|---|
| `App.tsx` | 4 tabs: Search, Library, Chat, Settings |
| `lib/api.ts` | HTTP client → FastAPI |
| `search/SearchView.tsx` | Semantic search |
| `library/LibraryView.tsx` | Paper list + import toggle |
| `chat/ChatView.tsx` | RAG chat + citations |
| `settings/SettingsView.tsx` | Ollama config + health check |
| `import/ImportPanel.tsx` | Drag & drop + file + folder import |

### Tauri Shell
| File | Trạng thái |
|---|---|
| `src-tauri/src/main.rs` | ✅ Cập nhật lib name |
| `src-tauri/src/lib.rs` | ✅ Thin shell: spawn Python backend |
| `src-tauri/Cargo.toml` | ✅ Xoá memory-* deps, thêm reqwest |
| `src-tauri/tauri.conf.json` | ✅ Đổi tên → ResearchMind VN |

---

## 🔴 Phần 2: NHỮNG GÌ CHƯA LÀM (To Do)

### Cần user action
| Task | Lý do |
|---|---|
| Xoá `crates/memory-*` trên disk | Terminal không chạy được (WSL) |
| Setup `.venv` + `pip install -r requirements.txt` | Cần Python 3.11+ |
| Chạy `uvicorn main:app --reload --port 8765` | Kiểm tra backend hoạt động |
| Chạy `pnpm install && pnpm tauri dev` | Kiểm tra frontend |
| Pull model: `ollama pull qwen2.5:7b` | Cho AI Chat |

### Tính năng tương lai (Phase 2)
| Tính năng | Khi nào |
|---|---|
| OCR cho PDF scan | Sau MVP |
| Zotero/BibTeX import | Sau 20 users |
| Streaming chat (SSE) | Tuần 7-8 |
| PDF preview inline | Tuần 7-8 |
| Export citation | Phase 3 |
| Lab account (multi-user) | Phase 4 |

## 🔄 Định hướng sản phẩm (Cập nhật)
- Nhận định: nền tảng hiện tại đã có "nhớ + search + chat", nhưng giá trị cạnh tranh phải là "giúp hiểu + giúp nghĩ + giúp viết".
- Ưu tiên chiến lược: xây thêm tính năng sản phẩm "giảm thời gian đọc" và "tạo nội dung nghiên cứu".
- Chọn killer feature cho giai đoạn tiếp theo: **Auto Literature Review Builder**.
  - Mục tiêu: từ thư viện paper đã nhập, tạo được output dạng Background / Related Work / Methods / Gaps / Insights.
  - Giá trị: giúp người dùng tiết kiệm 50-70% thời gian đọc, không còn chỉ là công cụ tìm kiếm tài liệu.
- Bước triển khai ngay: hoàn thiện endpoint/tính năng _quick summary + compare + structured synthesis_ trước khi mở rộng gap detection.
- Ghi chú: cập nhật file `have_done_plan/tracking.md` theo yêu cầu.
 - Ghi chú bổ sung: chọn **AI Phản biện (Critical Thinking Mode)** làm feature cạnh tranh cao — ưu tiên triển khai ngay sau quick summary.
 - Ghi chú bổ sung: chọn **AI Phản biện (Critical Thinking Mode)** làm feature cạnh tranh cao — ưu tiên triển khai ngay sau quick summary.
 - Ghi chú bổ sung: **Debate Mode (AI vs AI)** được chọn làm bước tiếp theo sau Phản biện — mục tiêu demo viral và dễ trình diễn.

---

## 📈 BIỂU ĐỒ TIẾN ĐỘ

```
Plan & Spec     ████████████████████████████████  100%  (6/6 files)
Python Backend  ████████████████████████████████  100%  (14 files)
React Frontend  ████████████████████████████████  100%  (6 components)
AI Chat (RAG)   ████████████████████████████████  100%  (2 modules)
Search Engine   ████████████████████████████████  100%  (Hybrid)
Import PDF UI   ████████████████████████████████  100%  (Drag & drop)
Tauri Shell     ████████████████████████████████  100%  (Thin shell)
Testing         ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░   0%  (Chưa setup)
Old Crates      ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░   0%  (Còn trên disk)

TỔNG THỂ: ██████████████████████████████████░  85%
```
