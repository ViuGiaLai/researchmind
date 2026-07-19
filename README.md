# ResearchMind

<p align="center">
  <img src="https://img.shields.io/badge/version-0.6-blue" alt="Version">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License">
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey" alt="Platform">
  <img src="https://img.shields.io/badge/build-Tauri%20v2-8B5CF6" alt="Tauri">
</p>

<p align="center">
  <b>Local-First AI Research Assistant for Academics</b><br>
  Read fast. Critique deep. Auto-generate reviews. All running on your machine.
</p>

<p align="center">
  <i>No data leaves your computer. Full offline support. Open source.</i>
</p>

---

## ✨ Features

### 📚 Library & Collections
Organize your academic library with collections, tags, highlights, and notes. Preview abstracts, metadata, and related papers. Get daily reading suggestions based on your interests.

<img width="1919" alt="Library" src="https://github.com/user-attachments/assets/cf6827fc-907e-4d3c-96ba-5f1240d5960d" />

### 🔍 Discovery & Search
Hybrid semantic search combining BM25 (FTS5) + Vector (ChromaDB) + Cross-Encoder rerank. Filter by collection, author, year, tag, read status, or starred. Save frequent searches.

<img width="1919" alt="Discovery" src="https://github.com/user-attachments/assets/b1aab3a9-ccac-4914-b14b-e1cf7b11bf29" />

### 🤖 AI Chat & RAG
Chat with one paper or multiple papers simultaneously. Stream responses in real-time with automatic provider fallback. Critique limitations and methodological flaws. Debate topics with multiple AI personas. Verify claims via DOI lookup across OpenAlex, Crossref, and Semantic Scholar.

<img width="1919" alt="AI Chat" src="https://github.com/user-attachments/assets/2da619ef-6357-427b-b66b-8bb771c2e660" />

### 📝 Review Builder
Select papers → Generate structured literature reviews across 7 sections (Background → Future Directions). Inline editing, regenerate individual sections, compare papers side-by-side. Export to DOCX, HTML, or Markdown.

<img width="1919" alt="Review Builder" src="https://github.com/user-attachments/assets/bd62bcc9-544c-4bec-90d9-d598c9e49f27" />

### 🖍️ Highlights & Notes
Annotate PDFs with highlights and margin notes. All annotations are searchable and linked to your library. Sync across papers within the same collection.

<img width="1915" alt="Highlights" src="https://github.com/user-attachments/assets/08201a55-d304-4730-84ed-6a2253933058" />

### 📥 Smart Import
Drag & drop PDF, DOCX, EPUB, TXT, MD, HTML — auto-parse, chunk, embed, and index. Track import status per file (queued → parsing → indexing → OCR → summarizing → ready). Retry individual files or trigger manual OCR for scanned PDFs. Sync existing metadata from Zotero SQLite.

---

## 🛠️ Technology Stack

| Layer | Technology |
|---|---|
| Desktop Shell | **Tauri v2** (Rust) |
| Frontend | React 18, TypeScript, Tailwind CSS, shadcn/ui |
| Backend | Python 3.11+, FastAPI, Pydantic v2, SQLAlchemy |
| Embedding | bge-m3 (Sentence-Transformers) |
| Vector DB | ChromaDB |
| Full-Text Search | SQLite FTS5 |
| Rerank | Cross-Encoder (optional) |
| OCR | RapidOCR (ONNX) |
| LLM Providers | NVIDIA NIM, Groq, Gemini, Claude, llama-server (local GGUF), FreeModel |

---

## 📐 Architecture

```text
Tauri App (React / TypeScript)
    │
    ▼
FastAPI Backend ────────────────────────────────────────┐
    │                                                    │
    ├── ingestion/ (parser, chunker, embedder, OCR)     ├── data/
    ├── search/ (hybrid, reranker, cache)                  ├── papers/
    ├── chat/ (generator, provider chain)                   ├── chroma/
    ├── routers/ (papers, chat, search, verify, review)     ├── models/
    ├── db/ (SQLAlchemy models, migrations)                 └── researchmind.db
    └── academic/ (OpenAlex, Crossref, Semantic Scholar)
```

---

## 🚀 Quick Start

### Prerequisites
- Node.js 22+, pnpm
- Python 3.11+, Rust Stable, Tauri CLI

### Install
```bash
git clone https://github.com/your-org/researchmind.git
cd researchmind
pnpm install
cd backend && pip install -r requirements.txt
```

### Run
```bash
pnpm tauri dev
```

---

## 🗺️ Roadmap

| Version | Focus | Status |
|---|---|---|
| **v0.1** | Import, Search, Basic Chat | ✅ |
| **v0.2** | Streaming Cache, Retry, Provider Chain | ✅ |
| **v0.3** | Verify (OpenAlex/Crossref/S2), Critique, Debate | ✅ |
| **v0.4** | Import Queue, OCR UX, Review Builder, Collections | ✅ |
| **v0.5** | Performance: virtualization, cold start, debounce, lazy load | ✅ |
| **v0.6** | Polish & Launch: onboarding, shortcuts, privacy, release notes | ✅ |

---

## 🔒 Privacy

- **Local-First** — all data stays on your machine
- **Never sends PDFs externally**
- **Fully offline** capable (using llama-server with local GGUF models)
- **LLM cloud providers are optional** — your choice, your data

---

## 📄 License

MIT License — free to use, modify, and distribute.

---

<p align="center">
  <b>ResearchMind</b> — Built for researchers who value privacy and performance.
</p>
