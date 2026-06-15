# ResearchMind VN — 🚀 Các Bước Tiếp Theo

> **Mục tiêu ngắn hạn:** Setup môi trường, chạy backend + frontend, test với PDF thật.

---

## ✅ Những gì ĐÃ CODE XONG

### Backend (14 files)
| Module | Chức năng |
|---|---|
| `config/` | Settings (chunk_size, model, URL...) |
| `db/` | SQLAlchemy + 5 tables (Paper, Chunk, ChatHistory, Setting) |
| `ingestion/` | PyMuPDF → chunk 512 tokens → bge-m3 embedding |
| `search/` | BM25 FTS5 + ChromaDB + RRF fusion + cross-encoder |
| `chat/` | RAG retriever + Ollama/Claude generator + citations |
| `main.py` | FastAPI: 16 endpoints |
| `prototype_cli.py` | CLI test tool: import, search, chat, list, stats, delete |

### Frontend (6 components)
| Component | Chức năng |
|---|---|
| `App.tsx` | 4 tabs: Search, Library, Chat, Settings |
| `api.ts` | HTTP client → FastAPI |
| `SearchView` | Semantic search + kết quả |
| `LibraryView` | Paper list + filter + import PDF |
| `ChatView` | RAG chat + citations |
| `SettingsView` | Ollama config + health check |
| `ImportPanel` | Drag & drop + file + folder import |

---

## 🥇 NGAY BÂY GIỜ — Setup Môi Trường

```powershell
# 1. Tạo virtual environment
python -m venv .venv

# 2. Activate
.venv\Scripts\Activate.ps1

# 3. Cài dependencies (3-5 phút)
pip install -r backend\requirements.txt

# 4. Pull model
ollama pull qwen2.5:7b
```

---

## 🥇 Chạy Backend

```powershell
# Terminal 1: Backend
cd backend
uvicorn main:app --reload --port 8765
# → http://localhost:8765/docs (Swagger UI)
```

## 🥇 Test với CLI

```powershell
# Cửa sổ khác, test import + search
python prototype_cli.py import "D:\path\to\paper.pdf"
python prototype_cli.py stats
python prototype_cli.py search "phương pháp đánh giá độ trễ"
python prototype_cli.py list
```

## 🥈 Chạy Frontend

```powershell
cd apps\desktop
pnpm install
pnpm tauri dev
```

---

## 📋 Checklist

- [ ] `.venv` + `pip install -r backend\requirements.txt` — backend dependencies
- [ ] `uvicorn main:app --reload --port 8765` — backend chạy được
- [ ] `python prototype_cli.py import test.pdf` — import PDF thành công
- [ ] `python prototype_cli.py search "test"` — search có kết quả
- [ ] `ollama pull qwen2.5:7b` — model cho AI Local
- [ ] `ollama serve` — Ollama chạy
- [ ] `pnpm install && pnpm tauri dev` — frontend chạy được
- [ ] Xoá `crates/memory-*` — dọn dẹp code cũ
- [ ] Xoá `plan/HYBRID_MODEL.md.copy` — file thừa (nếu còn)
