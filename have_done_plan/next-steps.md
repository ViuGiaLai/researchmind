# ResearchMind VN — 🚀 Các Bước Tiếp Theo

> **Mục tiêu ngắn hạn:** Build MVP trong 8 tuần — Import PDF → Search → Chat → Library.

---

## 🥇 Bước 0: Research — KHÔNG CODE (Tuần này)

> **Gặp 5 nghiên cứu sinh hoặc sinh viên cao học. Hỏi đúng 1 câu:**
> *"Lần cuối bạn cần tìm lại nội dung trong paper đã đọc nhưng không nhớ tên — chuyện đó xảy ra bao lâu trước?"*
> Ghi lại câu trả lời nguyên văn. Không pitch sản phẩm.

### Cách tiếp cận

1. Vào 3 nhóm Facebook: NCS Việt Nam, PhD Vietnam Network, Hội nghiên cứu sinh
2. Đăng bài hỏi về pain point (không pitch)
3. Inbox 20 người đang viết luận án
4. Phỏng vấn sâu 5 người

---

## 🥇 Bước 1: Setup Môi Trường

```powershell
# 1. Python 3.11+
python --version  # cần >= 3.11

# 2. Node.js 20+
node --version  # cần >= 20

# 3. pnpm
npm install -g pnpm

# 4. Rust (cho Tauri)
rustc --version

# 5. Ollama
# Tải từ ollama.com hoặc:
winget install Ollama
ollama pull llama3.1:8b

# 6. Python virtual environment
cd D:\all_my_project\memoryOS
python -m venv .venv
.venv\Scripts\activate
pip install -r backend/requirements.txt
```

---

## 🥇 Bước 2: Build Prototype CLI (Tuần 2-4)

**Không cần UI. Chỉ Python CLI.**

```python
# prototype_cli.py
# 1. Import PDF → extract text → chunk → embed → store
# 2. Search: gõ câu hỏi → tìm chunks → in kết quả
# 3. Cho 3 người dùng thử

python prototype_cli.py import D:\PDFs\paper1.pdf
# ✅ Imported: paper1.pdf (45 chunks, 2.3s)

python prototype_cli.py search "phương pháp đánh giá độ trễ mạng 5G"
# Kết quả:
# 1. paper1.pdf (trang 5): độ trễ mạng 5G được đánh giá...
# 2. paper3.pdf (trang 12): phương pháp Monte Carlo...
```

---

## 🥇 Bước 3: Build MVP (Tuần 5-8)

### Tuần 5-6: Backend + Frontend Core

```powershell
# Backend
cd backend
uvicorn main:app --reload --port 8765
# http://localhost:8765/docs → FastAPI docs

# Frontend (trong terminal khác)
cd apps/desktop
pnpm install
pnpm tauri dev
```

### Tuần 7-8: AI Chat + Hoàn Thiện

```powershell
# Kiểm tra Ollama
ollama list  # phải thấy llama3.1:8b

# Test chat
curl -X POST http://localhost:8765/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Tóm tắt paper này", "paper_ids": ["id1"]}'
```

---

## 📋 Checklist Hàng Ngày

- [ ] `cd backend && uvicorn main:app --reload` — backend chạy?
- [ ] `cd apps/desktop && pnpm tauri dev` — app chạy?
- [ ] Import ít nhất 1 PDF test
- [ ] Search thử bằng câu hỏi tiếng Việt
- [ ] Viết commit message rõ ràng

---

## 🎯 Milestones

| Tuần | Milestone | Check |
|---|---|---|
| Tuần 1 | ✅ Phỏng vấn 5 NCS | ☐ |
| Tuần 2 | ✅ CLI prototype: import + search | ☐ |
| Tuần 3 | ✅ Backend FastAPI + Search APIs | ☐ |
| Tuần 4 | ✅ ChromaDB + Hybrid Search hoạt động | ☐ |
| Tuần 5 | ✅ React + Tauri UI (Library + Search) | ☐ |
| Tuần 6 | ✅ Import folder + Settings | ☐ |
| Tuần 7 | ✅ Chat với Paper (Ollama) | ☐ |
| Tuần 8 | ✅ MVP hoàn chỉnh + 10 users test | ☐ |

---

> **Nguyên tắc:** 
> - Không code khi chưa phỏng vấn người dùng
> - Không thêm tính năng khi chưa có 20 user active
> - Dùng Python để build nhanh, rewrite sau nếu cần
> - Mỗi câu trả lời AI phải có trích dẫn nguồn
