# ResearchMind — Hướng dẫn Setup (Phase 1 & 2)

## Tổng quan

```
Phase 1 ─── Foundation & MVP
├── Frontend: Vite + React 18 + TypeScript
├── Backend: Python FastAPI (PDF parsing, RAG, AI Chat)
├── Anonymization Engine (Blind Review)
└── Reasoning Engine (Chat, Critique, Debate, Verify)

Phase 2 ─── Cloud Sync & Authentication
├── Pluggable Auth (Mock / Clerk)
├── Cloud Sync Engine (Offline-first, Incremental)
├── Encryption Engine (E2EE: PBKDF2 → AES-256-GCM)
├── Workflow Engine (Projects, Documents)
├── Memory Engine (Encrypted Notes, Annotations)
└── Storage Layer (Cloudflare D1)
```

---

## Yêu cầu hệ thống

| Công cụ | Phiên bản tối thiểu |
|---|---|
| Node.js | 22+ |
| pnpm | 9+ |
| Python | 3.11+ |
| Rust | Stable (cho Tauri) |
| Git | 2.x |

---

## 1. Clone & Cài đặt dependencies

```bash
git clone https://github.com/your-org/researchmind.git
cd researchmind
```

### Frontend (apps/desktop)
```bash
cd apps/desktop
pnpm install
```

### Backend (Python FastAPI)
```bash
cd backend
pip install -r requirements.txt
```

---

## 2. Cấu hình môi trường

```bash
cd apps/desktop
cp .env.example .env
```

Mặc định `.env` đã có sẵn các giá trị cho local development:

```ini
VITE_BACKEND_URL=http://127.0.0.1:8765
VITE_BACKEND_AUTH_REQUIRED=false
VITE_AUTH_REQUIRED=true
VITE_CLOUD_SYNC_URL=http://localhost:8787
VITE_ENABLE_CLOUD_SYNC=true
```

### Không cần Firebase API key cho local dev

PluggableAuthProvider dùng **mock provider** mặc định — tạo user ảo trong localStorage.  
Không cần cấu hình Firebase hay Clerk để chạy local.

Nếu muốn dùng Clerk thật, thêm vào `.env`:
```ini
VITE_CLERK_PUBLISHABLE_KEY=pk_test_xxxxxxxxxxxx
```

---

## 3. Chạy Backend (FastAPI)

```bash
cd backend
uvicorn main:app --reload --port 8765
```

Backend sẽ khởi động với:
- SQLite database (`data/researchmind.db`)
- ChromaDB vector store
- PDF parser + embedder (tải model lần đầu)

Kiểm tra:
```bash
curl http://127.0.0.1:8765/api/ping
# → {"status":"ok","backend_ready":true}
```

---

## 4. Chạy Frontend (Vite)

Mở terminal mới:
```bash
cd apps/desktop
pnpm dev          # Web mode (http://localhost:1420)
# hoặc
pnpm tauri dev    # Desktop mode (Tauri window)
```

### Lần chạy đầu tiên

1. Trang **Auth Gate** hiện ra → chọn **Continue as Guest** hoặc nhấn **Sign In** (mock login)
2. Trang **Setup Wizard** hiện ra → cấu hình LLM provider (có thể bỏ qua nếu dùng local model)
3. Vào **Library** → kéo thả PDF để import
4. Đợi backend parse, chunk, embed (theo dõi progress bar)
5. Bắt đầu Chat với bài báo!

---

## 5. Chạy Cloud Sync Worker (optional)

### Prerequisites
- Node.js 18+
- Wrangler CLI: `npm install -g wrangler`
- Tài khoản Cloudflare (cho production)

### Local dev
```bash
cd apps/cloud-sync

# Khởi tạo D1 database local
pnpm db:init

# Chạy worker local
pnpm dev
# → http://localhost:8787
```

### Deploy lên Cloudflare
```bash
# Khởi tạo database trên remote D1
pnpm db:init:remote

# Deploy worker
pnpm deploy
```

### Cấu hình wrangler.toml
```toml
name = "researchmind-cloud-sync"
compatibility_date = "2024-03-20"
main = "src/index.ts"

[[d1_databases]]
binding = "DB"
database_name = "researchmind_db"
database_id = "your_d1_database_id"
```

---

## 6. E2EE (End-to-End Encryption)

Encryption Engine dùng **Web Crypto API**:
- **PBKDF2** (250,000 iterations) → derive key từ master password
- **AES-256-GCM** → encrypt/decrypt notes

User sẽ được hỏi master password:
- **Lần đầu**: tạo salt mới → lưu vào localStorage
- **Lần sau**: unlock bằng master password → giải mã notes

### MasterPasswordModal
Hiện ra khi:
- User đăng nhập
- Đã từng tạo master password trước đó
- Chưa unlock trong session này

---

## 7. Kiến trúc Data Flow

```
User ──→ AuthGate ──→ PluggableAuthProvider ──→ auth-token bridge ──→ api.ts ──→ Backend
                          │
                          ├──→ SyncDaemon (background, 60s interval)
                          │       ├── pushSync() → IndexedDB → Cloudflare Worker
                          │       └── pullSync() → Cloudflare Worker → IndexedDB
                          │
                          └──→ SyncStatus (online/offline/syncing indicator)
```

### Local Storage (IndexedDB via `db.ts`)
| Store | Mục đích |
|---|---|
| `projects` | Dự án nghiên cứu (offline cache) |
| `documents` | Metadata bài báo |
| `annotations` | Highlight + ghi chú |
| `encrypted_notes` | Ghi chú đã mã hóa E2EE |
| `sync_metadata` | Trạng thái đồng bộ |
| `user_preferences` | Cài đặt cá nhân |

### Cloudflare D1 Schema (`schema.sql`)
8 tables: `users`, `user_preferences`, `projects`, `documents`, `annotations`, `encrypted_notes`, `sync_metadata`, `version_history`

---

## 8. API Endpoints (Backend)

### Phase 1 — Core
| Method | Endpoint | Mô tả |
|---|---|---|
| GET | `/api/ping` | Health check |
| GET/PUT | `/api/settings` | Cấu hình LLM, embedding |
| GET/POST | `/api/papers` | Quản lý bài báo |
| POST | `/api/chat` | Chat với AI |
| POST | `/api/search` | Tìm kiếm hybrid (BM25 + Vector) |
| POST | `/api/anonymize/:id` | Ẩn danh bài báo |
| POST | `/api/insights/*` | Gap analysis, conflict, evolution |

### Phase 2 — Cloud Sync Worker
| Method | Endpoint | Mô tả |
|---|---|---|
| POST | `/api/sync` | Batch sync (push) |
| GET | `/api/sync` | Pull changes (since last_synced_at) |
| GET/POST | `/api/projects` | Workflow projects |
| GET/POST | `/api/documents` | Paper metadata |
| GET/POST | `/api/notes` | Encrypted notes (E2EE) |

---

## 9. File biến môi trường cho Backend

Tạo `backend/.env`:

```ini
# LLM Provider keys (tùy chọn, chỉ cần 1 provider)
GEMINI_API_KEY=your_gemini_key
CLAUDE_API_KEY=your_claude_key
DEEPSEEK_API_KEY=your_deepseek_key
GROQ_API_KEY=your_groq_key

# Google OAuth (cho desktop sign-in)
GOOGLE_OAUTH_CLIENT_ID=...
GOOGLE_OAUTH_CLIENT_SECRET=...
```

---

## 10. Troubleshooting

### Backend không start được
```
Lỗi: ModuleNotFoundError: No module named 'chromadb'
→ pip install -r requirements.txt --upgrade
```

### Import PDF lỗi
```
Lỗi: "Unsupported file type"
→ Chỉ hỗ trợ: .pdf, .docx, .epub, .txt, .md, .html
```

### Frontend không kết nối được backend
```
Lỗi: "Cannot connect to the backend"
→ Kiểm tra backend đã chạy: uvicorn main:app --reload --port 8765
```

### TypeError: Cannot read properties of undefined (reading 'filter')
→ `db.ts` yêu cầu IndexedDB. Mở Chrome DevTools → Application → IndexedDB → xóa `ResearchMindLocal` → reload.
