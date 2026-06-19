# Buổi 1 — Thứ 2, 15/06/2026

## Nội dung
- Lập kế hoạch dự án ResearchMind VN
- Khởi tạo project: backend FastAPI + frontend React + Tauri shell
- Thiết kế kiến trúc, chọn công nghệ

## Đã làm
1. Viết kế hoạch dự án: tầm nhìn, phân khúc người dùng, so sánh đối thủ
2. Thiết kế kiến trúc 4 lớp: React → Tauri → FastAPI → SQLite + ChromaDB
3. Khởi tạo backend FastAPI: cấu trúc thư mục, dependencies
4. Khởi tạo frontend React + TypeScript + Vite
5. Tạo Tauri shell: Rust backend spawn Python backend as child process
6. Thiết lập CI/CD pipeline: GitHub Actions build cross-platform
7. Viết `.env.example`, cấu hình môi trường

## Học được
- Cách thiết kế kiến trúc desktop app cho research tool
- Tauri v2: Rust shell + web frontend + spawn backend process
- So sánh embedding model đa ngữ (bge-m3, e5, MiniLM)

## Kết quả đạt được
- Project skeleton chạy được: Tauri app → FastAPI backend
- CI/CD tự động build Windows/macOS/Linux

## Kế hoạch buổi sau
- Xây dựng backend core: database models, ingestion pipeline, search engine

---
**Ký tên:** Rmah Viu
