# ResearchMind

> Local-First AI Research Assistant for scholars.
> Read fast, critique deep, auto-generate reviews — all running on your machine.

ResearchMind is a personal academic knowledge management system that runs entirely offline. Supports import, search, RAG chat, verification, and literature review — no data leaves your computer.

**Current version:** v0.6 · **Details:** [v0.6 — Polish & Launch](VERSION/VERSION_v0.6.md)

---

## Key Features

### Import & Index
- Drag & drop PDF/DOCX/EPUB/TXT/MD/HTML — auto parse, chunk, embed
- Import Queue: track status per file (queued → parsing → indexing → OCR → summarizing → ready)
- Retry individual files, manual OCR for scanned PDFs
- Zotero SQLite sync — import existing metadata libraries

### Semantic Search
- Hybrid search: BM25 (FTS5) + Vector (ChromaDB) + Cross-Encoder rerank
- Search by collection/author/year/tag/read status/starred
- Advanced filter + sort, saved search

### RAG Chat & Critique
- Chat with one paper or multiple papers simultaneously, scope by collection
- **Streaming** real-time, automatic provider chain fallback
- **Multi-layer cache:** LLM cache, embedding cache, rerank cache, academic cache — reduces repeated latency
- **Critique:** AI evaluates limitations, methodological flaws
- **Debate:** Multi-perspective discussion between multiple AI Personas
- **Verify:** DOI lookup → OpenAlex/Crossref/Semantic Scholar, cached + refreshable

### Literature Review Builder
- Select papers → Generate draft across 7 sections (Background → Future Directions)
- Inline editing, regenerate individual sections
- Comparison matrix between papers
- Export: DOCX / HTML / Markdown

### Library & Collections
- Collections/Projects — group papers by topic, thesis
- Highlights, notes, tags
- Preview panel: abstract, metadata, related papers
- Daily reading suggestions

---

## Technology Stack

| Layer | Technology |
|---|---|
| Desktop Shell | **Tauri v2** (Rust) |
| Frontend | React 18, TypeScript, Tailwind CSS, shadcn/ui, Recharts |
| Backend | Python 3.11+, FastAPI, Pydantic v2, SQLAlchemy |
| Embedding | bge-m3 (Sentence-Transformers) |
| Vector DB | ChromaDB |
| Full-text | SQLite FTS5 |
| Rerank | Cross-Encoder (disabled by default) |
| OCR | RapidOCR (ONNX) |
| LLM Providers | NVIDIA NIM, FreeModel, Groq, Gemini, llama-server (local GGUF), Claude API |

---

## Architecture

```text
Tauri App (React)
    │
    ▼
FastAPI Backend ────────────────────────────────────────┐
    │                                                    │
    ├── ingestion/ (parser, chunker, embedder, OCR)     ├── data/
    ├── search/ (hybrid, reranker, cache)                  ├── papers/
    ├── chat/ (generator, provider chain)                   ├── chroma/
    ├── routers/ (papers, chat, search, verify, review)     ├── models/
    ├── db/ (SQLAlchemy models, migrations)                 └── researchmind.db
    └── academic/ (OpenAlex, Crossref, S2 clients)
```

---

## Installation

### Prerequisites
- Node.js 22+, pnpm
- Python 3.11+, Rust Stable, Tauri CLI

### Clone & Install
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

## Roadmap

| Version | Focus | Status |
|---|---|---|
| **v0.1** | Import, Search, Basic Chat | ✅ |
| **v0.2** | Streaming, Cache, Retry, Provider chain | ✅ |
| **v0.3** | Verify (OpenAlex/Crossref/S2), Critique, Debate | ✅ |
| **v0.4** | Import Queue, OCR UX, Review Builder, Collections | ✅ |
| **v0.5** | Speed: virtualization, cold start, debounce, lazy load | ✅ |
| **v0.6** | Polish & Launch: onboarding, shortcuts, privacy, release notes | ✅ |

See detailed version notes at [`VERSION/`](VERSION/).

---

## Privacy

- Local-First: all data stays on your machine
- Never sends PDFs externally
- Can run fully offline (using llama-server with GGUF model)
- LLM cloud providers are optional, user's choice

---

## License

MIT License
