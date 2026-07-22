# Kế Hoạch Giai Đoạn 2: PERSISTENCE & CLOUD SYNC (Final 10/10)

Mục tiêu: Đưa ResearchMind lên Cloud-sync với kiến trúc Module hóa 6 Engines, đảm bảo khả năng bảo mật (E2EE), đồng bộ đa thiết bị (Offline-first) và thiết kế chuẩn Storage Layer dài hạn.

## Trả lời câu hỏi Kiến trúc: Đồng bộ PDF hay Local-only?
**Quyết định:** Giữ **PDF Local-only** ở Giai đoạn 2 này.
*Lý do:* Theo triết lý Local-first, bảo mật tối đa và MVP ra mắt nhanh nhất, việc đồng bộ hàng chục MB file PDF lên R2 (đặc biệt khi chưa E2EE file nhị phân) sẽ tốn băng thông và rủi ro. Ta chỉ đồng bộ **Metadata, Annotations và Notes** (những dữ liệu chất xám quan trọng nhất). File PDF sẽ nằm ở Local (IndexedDB/FileSystem), cloud chỉ lưu "địa chỉ" tham chiếu. Nếu sau này cần, ta sẽ bật R2 bucket lên.

---

## 1. Kiến Trúc Hệ Thống (Phase 2 Architecture)

```text
Phase 2
├── Authentication (Pluggable: Clerk mặc định)
├── Cloud Sync Engine (Offline-first, Incremental, Conflict: LWW)
├── Workflow Engine (Project/Document State)
├── Memory Engine (Annotations & Notes)
├── Encryption Engine (E2EE bằng PBKDF2 -> AES-256-GCM)
└── Storage Layer (Cloudflare D1, R2, KV)
```

## 2. Thiết kế Cơ sở dữ liệu (Cloudflare D1 - `schema.sql`)
- `users`: Chỉ lưu `id = clerk_user_id` (Không lưu password/email tránh trùng Identity Provider).
- `projects`: Dữ liệu Workflow.
- `documents`: Lưu Metadata tham chiếu (không chứa file PDF).
- `annotations`: Ghi chú, highlight gắn với tài liệu.
- `encrypted_notes`: Dữ liệu tóm tắt cá nhân (mã hóa).
- `sync_metadata`: Lưu `version`, `updated_at`, `deleted_at`, `device_id`, `sync_state` để hỗ trợ Incremental Sync.
- `user_preferences`: Cài đặt cá nhân.
- `version_history`: Lõi của **Version Engine** (lưu document_version, note_version để rollback).

## 3. Hệ thống REST API (`apps/cloud-sync/src/index.ts`)
Thay vì nhồi nhét, API sẽ chuẩn hóa theo Resource:
- **Sync Core:** `POST /sync`, `GET /sync` (Batch).
- **Projects:** `GET /projects`, `POST /projects`
- **Documents:** `GET /documents`, `POST /documents`
- **Notes:** `GET /notes`, `POST /notes` (Gửi lên/kéo về dữ liệu E2EE).

## 4. Encryption Engine & Sync Engine
- **Master Password:** Derive key bằng `PBKDF2` (Future: Argon2id). Encryption key **chỉ tồn tại trong bộ nhớ (RAM) của phiên làm việc**, tuyệt đối không lưu xuống ổ cứng.
- **Sync Engine:** 
  - Push/Pull gia tăng (Incremental) dựa vào `version` và `updated_at`.
  - Conflict Resolution: Dùng **Last Write Wins (LWW)** cho MVP.
  - Offline Queue lưu tại IndexedDB, online lập tức đẩy lên.

## 5. File Biến Môi Trường (`.env.example`)
Sẽ cung cấp sẵn template cho Frontend và Workers:
- Clerk API Keys.
- Cloudflare D1 / R2 bindings.
