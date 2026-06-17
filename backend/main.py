"""ResearchMind VN — FastAPI Backend

Trợ lý nghiên cứu AI — Local-first, tiếng Việt.

Endpoints:
- POST /api/papers/import          Import PDF
- POST /api/papers/import/folder   Import folder
- GET  /api/papers                 List papers
- GET  /api/papers/{id}            Paper detail
- PATCH /api/papers/{id}           Update paper
- DELETE /api/papers/{id}          Delete paper
- POST /api/search                 Hybrid search
- GET  /api/search/suggest         Search suggestions
- POST /api/chat                   Chat with paper
- GET  /api/chat/history           Chat history
- GET  /api/health                 Health check
- GET  /api/stats                  Statistics
- GET  /api/settings               Get settings
- PUT  /api/settings               Update settings
"""

import os
os.environ["HF_HUB_DISABLE_SYMLINKS_WARNING"] = "1"
os.environ["OPENBLAS_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["ANONYMIZED_TELEMETRY"] = "False"

import sys
from pathlib import Path

# Add backend directory to path for imports
backend_dir = Path(__file__).parent
sys.path.insert(0, str(backend_dir))

from fastapi import FastAPI, UploadFile, File, BackgroundTasks, HTTPException, Query, Body, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse, JSONResponse
from contextlib import asynccontextmanager
from loguru import logger
import shutil
import uuid
import re
import asyncio
import threading
from collections import Counter
from datetime import datetime, timedelta, time

from config.settings import settings
from db.database import get_engine, get_session
from db.models import Base, Paper, Chunk, ChatHistory, Setting
from ingestion.parser import extract_document, SUPPORTED_EXTENSIONS
from ingestion.chunker import chunk_text
from ingestion.embedder import get_embedder
from search.bm25 import BM25Search
from search.vector import VectorSearch
from search.hybrid import HybridSearch
from chat.retriever import Retriever
from chat.generator import Generator
from export import router as export_router
from zotero_import import router as zotero_import_router


# ─── Global state ────────────────────────────────────────────────

class AppState:
    def __init__(self):
        self.engine = None
        self.bm25 = None
        self.vector = None
        self.hybrid = None
        self.retriever = None
        self.generator = None
        self.embedder = None
        self.embedder_ready = False
        self.init_message = "Khởi động..."

state = AppState()


# ─── Lifespan ────────────────────────────────────────────────────

def load_persisted_settings():
    """Load settings from SQLite database on startup.

    Only loads UI/preference settings, NOT connection/security settings
    which should always come from .env file.
    """
    # These keys ALWAYS come from .env, never from SQLite persistence
    env_only_keys = {
        "ollama_url", "claude_api_key", "deepseek_api_key", "gemini_api_key",
        "groq_api_key", "freemodel_api_key",
        "ollama_model", "claude_model", "deepseek_model", "gemini_model",
        "groq_model", "freemodel_model",
        "model_tier_weak", "model_tier_medium", "model_tier_strong",
        "llm_mode", "custom_cloud_provider",
    }

    session = get_session(state.engine)
    try:
        db_settings = session.query(Setting).all()
        for s in db_settings:
            if s.key in env_only_keys:
                continue
            if hasattr(settings, s.key):
                default_val = getattr(settings, s.key)
                if isinstance(default_val, bool):
                    setattr(settings, s.key, s.value.lower() in ("true", "1", "yes"))
                elif isinstance(default_val, int):
                    setattr(settings, s.key, int(s.value))
                elif isinstance(default_val, float):
                    setattr(settings, s.key, float(s.value))
                else:
                    setattr(settings, s.key, s.value)

        logger.info("Loaded persisted settings from SQLite successfully")
    except Exception as e:
        logger.error(f"Failed to load persisted settings: {e}")
    finally:
        session.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize app state on startup, cleanup on shutdown."""
    logger.info("Starting ResearchMind VN backend...")

    # Ensure data directories
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    settings.papers_dir.mkdir(parents=True, exist_ok=True)
    settings.chroma_dir.mkdir(parents=True, exist_ok=True)

    # Database
    state.engine = get_engine(settings.db_path)
    Base.metadata.create_all(state.engine)
    
    # Migration: add auto_summary column if missing (for existing databases)
    _migrate_auto_summary(state.engine)
    
    logger.info("Database initialized")

    # Load persisted settings from DB
    load_persisted_settings()

    # Embedder (lazy-loaded, just init placeholder)
    state.embedder = get_embedder(settings.embedding_model)
    state.init_message = "Đang tải mô hình AI..."

    # Warm-up model in background to avoid delay on first search
    def _warmup_embedder():
        try:
            logger.info(f"Warming up embedding model: {settings.embedding_model}")
            state.embedder._load_model()
            state.embedder_ready = True
            state.init_message = "Sẵn sàng"
            logger.info("Embedding model ready")
        except Exception as e:
            logger.error(f"Failed to load embedding model: {e}")
            state.embedder_ready = True  # allow app to proceed anyway
            state.init_message = "Sẵn sàng (model lỗi)"

    threading.Thread(target=_warmup_embedder, daemon=True).start()

    # Search engines
    db_session = get_session(state.engine)
    state.bm25 = BM25Search(db_session)
    state.bm25.ensure_fts_table()
    state.vector = VectorSearch(settings.chroma_dir)
    state.hybrid = HybridSearch(
        bm25_search=state.bm25,
        vector_search=state.vector,
        embedder=state.embedder,
        rrf_k=settings.rrf_k,
        top_k_final=settings.top_k_final,
    )
    logger.info("Search engines initialized")

    # Warm-up cross-encoder in background to avoid delay on first search
    def _warmup_cross_encoder():
        try:
            logger.info("Warming up cross-encoder model...")
            state.hybrid._get_cross_encoder()
            logger.info("Cross-encoder model ready")
        except Exception as e:
            logger.error(f"Failed to load cross-encoder: {e}")

    threading.Thread(target=_warmup_cross_encoder, daemon=True).start()

    # Store engine in app.state for dependency injection in routers
    app.state.engine = state.engine

    # RAG components
    state.retriever = Retriever(state.hybrid)
    state.generator = Generator(
        ollama_url=settings.ollama_url,
        ollama_model=settings.ollama_model,
        claude_api_key=settings.claude_api_key,
        claude_model=settings.claude_model,
        deepseek_api_key=settings.deepseek_api_key,
        deepseek_model=settings.deepseek_model,
        gemini_api_key=settings.gemini_api_key,
        gemini_model=settings.gemini_model,
        groq_api_key=settings.groq_api_key,
        groq_model=settings.groq_model,
        nvidia_api_key=settings.nvidia_api_key,
        nvidia_model=settings.nvidia_model,
        nvidia_url=getattr(settings, "nvidia_url", "https://integrate.api.nvidia.com/v1"),
        freemodel_api_key=settings.freemodel_api_key,
        freemodel_model=settings.freemodel_model,
        freemodel_url=getattr(settings, "freemodel_url", "https://freemodel.dev/v1"),
        mode=settings.llm_mode,
        custom_cloud_provider=settings.custom_cloud_provider,
    )
    logger.info("RAG pipeline initialized")

    # Suggest GPU acceleration if applicable
    import subprocess
    try:
        result = subprocess.run(
            ["ollama", "show", settings.ollama_model],
            capture_output=True, text=True, timeout=5
        )
        if result.returncode == 0:
            logger.info(f"Ollama model '{settings.ollama_model}' ready")
    except Exception:
        pass

    yield

    # Cleanup
    state.engine.dispose()
    logger.info("Backend shutdown complete")


# ─── FastAPI app ─────────────────────────────────────────────────

app = FastAPI(
    title="ResearchMind VN",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:1420",
        "tauri://localhost",
        "http://tauri.localhost",
        "https://tauri.localhost",
        "http://127.0.0.1:1420",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register export & import routes
app.include_router(export_router)
app.include_router(zotero_import_router)


# ─── Global Exception Handler ────────────────────────────────────

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Catch-all exception handler to ensure CORS headers are returned on 500 errors."""
    logger.exception(f"Unhandled exception occurred: {exc}")
    return JSONResponse(
        status_code=500,
        content={
            "detail": "Internal Server Error",
            "message": str(exc),
            "type": exc.__class__.__name__,
        },
    )


# ─── Health ──────────────────────────────────────────────────────

@app.get("/api/health")
async def health():
    """Health check endpoint."""
    return {
        "status": "ok",
        "version": "0.1.0",
        "embedding_model": settings.embedding_model,
        "llm_mode": settings.llm_mode,
        "ollama_model": settings.ollama_model,
        "total_papers": _count_papers(),
        "total_chunks": _count_chunks(),
        "embedder_ready": state.embedder_ready,
        "init_message": state.init_message,
    }


def _count_papers() -> int:
    try:
        session = get_session(state.engine)
        count = session.query(Paper).count()
        session.close()
        return count
    except Exception:
        return 0


def _count_chunks() -> int:
    try:
        session = get_session(state.engine)
        count = session.query(Chunk).count()
        session.close()
        return count
    except Exception:
        return 0


# ─── Paper Import ────────────────────────────────────────────────

@app.post("/api/papers/import")
async def import_document(
    file: UploadFile = File(...),
    background_tasks: BackgroundTasks = None,
):
    """Import a single document (PDF, DOCX, TXT, MD, HTML, EPUB)."""
    ext = Path(file.filename).suffix.lower()
    if ext not in SUPPORTED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file format '{ext}'. Supported: {', '.join(sorted(SUPPORTED_EXTENSIONS))}"
        )

    file_id = str(uuid.uuid4())
    save_path = settings.papers_dir / f"{file_id}_{file.filename}"

    with open(save_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    doc = await asyncio.to_thread(extract_document, str(save_path))
    if doc is None:
        raise HTTPException(status_code=400, detail=f"Cannot parse file: {file.filename}")

    session = get_session(state.engine)
    try:
        paper = Paper(
            id=file_id,
            filename=file.filename,
            title=doc.title,
            authors=doc.authors,
            year=doc.year,
            doi=doc.doi,
            page_count=doc.page_count,
            file_size=doc.file_size,
            file_path=str(save_path),
            language=doc.language,
            status="indexing",
        )
        session.add(paper)
        session.commit()
    except Exception as e:
        session.rollback()
        logger.error(f"Failed to save paper metadata: {e}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    finally:
        session.close()

    background_tasks.add_task(_index_paper, file_id, doc)

    return {
        "paper_id": file_id,
        "filename": file.filename,
        "title": doc.title,
        "page_count": doc.page_count,
        "language": doc.language,
        "status": "indexing",
    }


@app.post("/api/papers/import/folder")
async def import_folder(
    folder_path: str = Body(..., embed=True),
    background_tasks: BackgroundTasks = None,
):
    """Import all supported documents from a folder."""
    folder = Path(folder_path)
    if not folder.exists() or not folder.is_dir():
        raise HTTPException(status_code=400, detail=f"Folder not found: {folder_path}")

    doc_files = []
    for ext in SUPPORTED_EXTENSIONS:
        doc_files.extend(folder.glob(f"*{ext}"))
        doc_files.extend(folder.glob(f"*{ext.upper()}"))
    doc_files = sorted(set(doc_files))  # deduplicate

    if not doc_files:
        raise HTTPException(status_code=400, detail="No supported documents found in the folder")

    import_results = []
    for doc_file in doc_files:
        try:
            doc = await asyncio.to_thread(extract_document, str(doc_file))
            if doc is None:
                import_results.append({
                    "filename": doc_file.name,
                    "status": "failed",
                    "error": "Cannot parse document",
                })
                continue

            file_id = str(uuid.uuid4())
            save_path = settings.papers_dir / f"{file_id}_{doc_file.name}"
            shutil.copy2(str(doc_file), str(save_path))

            session = get_session(state.engine)
            try:
                paper = Paper(
                    id=file_id,
                    filename=doc_file.name,
                    title=doc.title,
                    authors=doc.authors,
                    year=doc.year,
                    doi=doc.doi,
                    page_count=doc.page_count,
                    file_size=doc.file_size,
                    file_path=str(save_path),
                    language=doc.language,
                    status="indexing",
                )
                session.add(paper)
                session.commit()
            except Exception as e:
                session.rollback()
                import_results.append({
                    "filename": doc_file.name,
                    "status": "failed",
                    "error": str(e),
                })
                continue
            finally:
                session.close()

            background_tasks.add_task(_index_paper, file_id, doc)
            import_results.append({
                "filename": doc_file.name,
                "status": "indexing",
                "paper_id": file_id,
                "pages": doc.page_count,
            })

        except Exception as e:
            import_results.append({
                "filename": doc_file.name,
                "status": "error",
                "error": str(e),
            })

    return {
        "total": len(doc_files),
        "results": import_results,
    }


def _index_paper(file_id: str, doc):
    """
    Background indexing: chunk → embed → store in ChromaDB + FTS5.

    Runs as a background task after PDF import.
    """
    logger.info(f"Indexing paper: {file_id} ({doc.filename})")

    session = get_session(state.engine)
    try:
        # Chunk
        chunks = chunk_text(
            doc.text_by_page,
            chunk_size=settings.chunk_size,
            chunk_overlap=settings.chunk_overlap,
        )

        if not chunks:
            logger.warning(f"No chunks generated for {doc.filename}")
            session.query(Paper).filter(Paper.id == file_id).update({"status": "failed"})
            session.commit()
            return

        logger.info(f"Generated {len(chunks)} chunks for {doc.filename}")

        # Save chunks to SQLite
        for chunk in chunks:
            chunk.paper_id = file_id
            db_chunk = Chunk(
                paper_id=file_id,
                chunk_index=chunk.index,
                content=chunk.text,
                page_number=chunk.page_number,
                section_header=chunk.section_header,
                token_count=chunk.token_count,
            )
            session.add(db_chunk)
        session.commit()

        # Rebuild FTS index incrementally
        state.bm25._rebuild_fts()

        # Generate embeddings and store in ChromaDB
        chunk_texts = [c.text for c in chunks]
        chunk_ids = [f"{file_id}_{c.index}" for c in chunks]
        metadatas = [
            {
                "paper_id": file_id,
                "paper_title": doc.title or doc.filename,
                "chunk_index": c.index,
                "page_number": c.page_number or 0,
                "section_header": c.section_header or "",
            }
            for c in chunks
        ]

        embeddings = state.embedder.embed(chunk_texts)
        state.vector.add_chunks(chunk_ids, embeddings, metadatas, chunk_texts)

        # Update paper status
        session.query(Paper).filter(Paper.id == file_id).update({
            "status": "indexed",
        })
        session.commit()

        # Generate auto-summary in background using LLM
        try:
            intro_chunks = session.query(Chunk).filter(Chunk.paper_id == file_id).order_by(Chunk.chunk_index.asc()).limit(3).all()
            conclusion_chunk = session.query(Chunk).filter(Chunk.paper_id == file_id).order_by(Chunk.chunk_index.desc()).first()
            
            summary_context = "\n".join([c.content for c in intro_chunks])
            if conclusion_chunk and conclusion_chunk.chunk_index > 2:
                summary_context += f"\n\nKết luận:\n{conclusion_chunk.content}"
            
            summary_prompt = """Hãy viết một bản tóm tắt học thuật cực kỳ ngắn gọn và cấu trúc cho bài báo này. 
Trả về kết quả dưới định dạng Markdown như sau:

### 🧠 Tóm tắt tự động bởi ResearchMind:
* **Ý tưởng cốt lõi (Core Idea)**: [Viết 1 câu mô tả ý tưởng/mục tiêu chính]
* **Đóng góp chính (Contributions)**: [Viết 1-2 dòng về các đóng góp khoa học chính]
* **Điểm yếu / Hạn chế (Weaknesses)**: [Viết 1 dòng về các hạn chế được thảo luận]

Lưu ý: Viết bằng tiếng Việt súc tích, chuyên nghiệp."""
            
            result = state.generator.generate(
                query=summary_prompt,
                context_text=summary_context
            )
            
            if result and result.content:
                session.query(Paper).filter(Paper.id == file_id).update({
                    "auto_summary": result.content
                })
                session.commit()
                logger.info(f"Generated auto-summary for {doc.filename}")
        except Exception as sum_err:
            logger.warning(f"Auto-summary generation failed for {doc.filename}: {sum_err}")

        logger.info(f"✅ Indexed {doc.filename}: {len(chunks)} chunks")

    except Exception as e:
        logger.error(f"Indexing failed for {doc.filename}: {e}")
        session.query(Paper).filter(Paper.id == file_id).update({"status": "failed"})
        session.commit()
    finally:
        session.close()


# ─── Paper CRUD ──────────────────────────────────────────────────

@app.get("/api/papers")
async def list_papers(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    status: str = Query(None),
    sort_by: str = Query("created_at"),
    order: str = Query("desc"),
):
    """List papers with filtering, sorting, and pagination."""
    session = get_session(state.engine)
    try:
        query = session.query(Paper)
        if status:
            query = query.filter(Paper.status == status)

        # Sort
        sort_col = getattr(Paper, sort_by, Paper.created_at)
        if order == "desc":
            query = query.order_by(sort_col.desc())
        else:
            query = query.order_by(sort_col.asc())

        # Paginate
        total = query.count()
        papers = query.offset((page - 1) * limit).limit(limit).all()

        return {
            "total": total,
            "page": page,
            "limit": limit,
            "papers": [_paper_to_dict(p) for p in papers],
        }
    finally:
        session.close()


@app.get("/api/papers/{paper_id}")
async def get_paper(paper_id: str):
    """Get paper details."""
    session = get_session(state.engine)
    try:
        paper = session.query(Paper).filter(Paper.id == paper_id).first()
        if not paper:
            raise HTTPException(status_code=404, detail="Paper not found")

        # Count chunks
        chunk_count = session.query(Chunk).filter(Chunk.paper_id == paper_id).count()

        result = _paper_to_dict(paper)
        result["chunk_count"] = chunk_count
        return result
    finally:
        session.close()


@app.patch("/api/papers/{paper_id}")
async def update_paper(paper_id: str, update: dict):
    """Update paper metadata (tags, notes, read_status, starred)."""
    session = get_session(state.engine)
    try:
        paper = session.query(Paper).filter(Paper.id == paper_id).first()
        if not paper:
            raise HTTPException(status_code=404, detail="Paper not found")

        allowed_fields = {"tags", "notes", "read_status", "starred"}
        for key, value in update.items():
            if key in allowed_fields:
                setattr(paper, key, value)

        session.commit()
        return _paper_to_dict(paper)
    finally:
        session.close()


@app.delete("/api/papers/{paper_id}")
async def delete_paper(paper_id: str):
    """Delete paper and all associated data."""
    session = get_session(state.engine)
    try:
        paper = session.query(Paper).filter(Paper.id == paper_id).first()
        if not paper:
            raise HTTPException(status_code=404, detail="Paper not found")

        # Delete from ChromaDB
        try:
            state.vector.delete_paper_chunks(paper_id)
        except Exception as e:
            logger.warning(f"ChromaDB delete failed: {e}")

        # Delete from SQLite (cascades to chunks)
        session.delete(paper)
        session.commit()

        # Delete file
        try:
            Path(paper.file_path).unlink(missing_ok=True)
        except Exception:
            pass

        # Rebuild FTS
        state.bm25._rebuild_fts()

        return {"status": "deleted", "paper_id": paper_id}
    finally:
        session.close()


@app.get("/api/papers/{paper_id}/file")
async def get_paper_file(paper_id: str):
    """Retrieve the raw PDF file for a paper."""
    session = get_session(state.engine)
    try:
        paper = session.query(Paper).filter(Paper.id == paper_id).first()
        if not paper:
            raise HTTPException(status_code=404, detail="Paper not found")
        path = Path(paper.file_path)
        if not path.exists():
            raise HTTPException(status_code=404, detail="PDF file not found on disk")
        return FileResponse(path, media_type="application/pdf")
    finally:
        session.close()


@app.get("/api/papers/{paper_id}/related")
async def find_related_papers(paper_id: str, limit: int = Query(5)):
    """
    Find papers related to a given paper based on embedding similarity.
    Uses the paper's chunks to find similar chunks from other papers,
    then aggregates by paper_id and computes average similarity scores.
    """
    session = get_session(state.engine)
    try:
        # Verify the paper exists
        paper = session.query(Paper).filter(Paper.id == paper_id).first()
        if not paper:
            raise HTTPException(status_code=404, detail="Paper not found")

        # Get chunks of this paper from SQLite
        chunks = session.query(Chunk).filter(Chunk.paper_id == paper_id).all()
        if not chunks:
            return {"related_papers": [], "paper_id": paper_id}

        # Use only the first chunk's embedding as query (efficient single query)
        chunk_ids = [f"{paper_id}_{chunks[0].chunk_index}"]

        # Get embeddings from ChromaDB
        try:
            collection = state.vector.collection
            results = collection.get(
                ids=chunk_ids,
                include=["embeddings"],
            )
            if not results["ids"] or len(results["embeddings"]) == 0:
                return {"related_papers": [], "paper_id": paper_id}
            
            query_embedding = results["embeddings"][0]
        except Exception as e:
            logger.warning(f"Failed to get embeddings for paper {paper_id}: {e}")
            return {"related_papers": [], "paper_id": paper_id}

        # Single efficient query for similar chunks from OTHER papers
        search_results = state.vector.collection.query(
            query_embeddings=[query_embedding],
            n_results=limit * 3,  # Get more to filter out same paper
            include=["metadatas", "distances", "documents"],
        )
        
        # Aggregate scores per paper
        all_related = {}  # paper_id -> {scores, snippet, title}
        
        if search_results["ids"] and search_results["ids"][0]:
            for i in range(len(search_results["ids"][0])):
                metadata = search_results["metadatas"][0][i]
                distance = search_results["distances"][0][i]
                similarity = 1.0 - distance
                other_paper_id = metadata.get("paper_id", "")
                
                # Skip chunks from the same paper
                if other_paper_id == paper_id:
                    continue
                
                # Aggregate scores per paper
                if other_paper_id not in all_related:
                    all_related[other_paper_id] = {
                        "scores": [],
                        "snippet": search_results["documents"][0][i][:200],
                        "title": metadata.get("paper_title", ""),
                    }
                all_related[other_paper_id]["scores"].append(similarity)

        # Compute average scores and sort
        related_papers = []
        for pid, data in all_related.items():
            avg_score = sum(data["scores"]) / len(data["scores"])
            related_papers.append({
                "paper_id": pid,
                "title": data["title"],
                "similarity": round(avg_score, 4),
                "snippet": data["snippet"],
                "matching_chunks": len(data["scores"]),
            })
        
        # Sort by similarity descending
        related_papers.sort(key=lambda x: x["similarity"], reverse=True)
        
        return {
            "related_papers": related_papers[:limit],
            "paper_id": paper_id,
        }
    finally:
        session.close()


# ─── Search ──────────────────────────────────────────────────────

@app.post("/api/search")
async def search(query: dict = Body(...)):
    """Hybrid search across all indexed PDFs."""
    text = query.get("text", "")
    paper_ids = query.get("paper_ids")
    top_k = query.get("top_k", 10)

    if not text.strip():
        raise HTTPException(status_code=400, detail="Query text is required")

    results = await asyncio.to_thread(
        state.hybrid.search,
        query=text,
        paper_ids=paper_ids,
        top_k=top_k,
        use_reranker=True,
    )

    return {
        "query": text,
        "total": len(results),
        "results": [
            {
                "chunk_id": r.chunk_id,
                "paper_id": r.paper_id,
                "paper_title": r.paper_title,
                "content": r.content,
                "page_number": r.page_number,
                "score": round(r.score, 4),
            }
            for r in results
        ],
    }


@app.get("/api/search/suggest")
async def search_suggest(q: str = Query(...), limit: int = Query(5)):
    """Get search suggestions."""
    # For MVP: just return recent paper titles as suggestions
    session = get_session(state.engine)
    try:
        papers = session.query(Paper).filter(
            Paper.status == "indexed",
            Paper.title.ilike(f"%{q}%"),
        ).limit(limit).all()

        return {
            "suggestions": [p.title or p.filename for p in papers],
        }
    finally:
        session.close()


# ─── Chat ────────────────────────────────────────────────────────

def count_free_queries_today(session) -> int:
    """Count daily free queries logged in ChatHistory."""
    today_start = datetime.combine(datetime.today(), time.min)
    return session.query(ChatHistory).filter(
        ChatHistory.role == "assistant",
        ChatHistory.model_used == "gemini/free",
        ChatHistory.created_at >= today_start
    ).count()


@app.post("/api/chat")
async def chat(request: dict = Body(...)):
    """Chat with selected papers using RAG pipeline."""
    import time
    t0 = time.time()
    message = request.get("message", "")
    paper_ids = request.get("paper_ids")  # Optional list of paper IDs
    stream = request.get("stream", False)
    session_id = request.get("session_id", "default")

    if not message.strip():
        raise HTTPException(status_code=400, detail="Message is required")

    # Check free cloud query limit
    if settings.llm_mode == "cloud_free":
        session = get_session(state.engine)
        try:
            used = count_free_queries_today(session)
            if used >= settings.free_cloud_daily_limit:
                raise HTTPException(
                    status_code=429,
                    detail=f"Bạn đã dùng hết {settings.free_cloud_daily_limit} câu hỏi miễn phí trong ngày. Vui lòng chuyển sang dùng API Key cá nhân hoặc Local mode."
                )
        finally:
            session.close()

    # Retrieve relevant context (run in thread to avoid blocking event loop)
    t1 = time.time()
    retrieval = await asyncio.to_thread(
        state.retriever.retrieve,
        query=message,
        paper_ids=paper_ids,
        top_k=5,
    )
    t2 = time.time()
    logger.info(f"TIMING: retrieve={t2-t1:.2f}s context_len={len(retrieval.context_text)} chunks={retrieval.total_chunks}")

    if stream:
        return StreamingResponse(
            _stream_chat(message, retrieval.context_text, session_id, paper_ids),
            media_type="text/event-stream",
        )

    # Generate response (run in thread to avoid blocking event loop)
    generation = await asyncio.to_thread(
        state.generator.generate,
        query=message,
        context_text=retrieval.context_text,
    )
    t3 = time.time()
    logger.info(f"TIMING: generate={t3-t2:.2f}s model={generation.model_used} total={t3-t0:.2f}s")

    # Save to SQLite chat history
    session = get_session(state.engine)
    try:
        import json
        session.add(ChatHistory(
            session_id=session_id,
            role="user",
            content=message,
            context_papers=json.dumps(paper_ids or []),
            citations="[]",
            model_used="",
        ))
        session.add(ChatHistory(
            session_id=session_id,
            role="assistant",
            content=generation.content,
            context_papers=json.dumps(retrieval.papers_used),
            citations=json.dumps(generation.citations),
            model_used=generation.model_used,
        ))
        session.commit()
    except Exception as e:
        session.rollback()
        logger.error(f"Failed to save chat history: {e}")
    finally:
        session.close()

    return {
        "answer": generation.content,
        "citations": generation.citations,
        "model_used": generation.model_used,
        "papers_used": retrieval.papers_used,
        "chunks_used": retrieval.total_chunks,
    }


@app.post("/api/review")
async def review(request: dict = Body(...)):
    """Generate a structured literature review from selected papers."""
    paper_ids = request.get("paper_ids")
    query = request.get("query", "").strip()
    session_id = request.get("session_id", "review")

    if not query:
        query = """Hãy viết một review nghiên cứu bằng tiếng Việt cho các tài liệu đã chọn.
Trả về kết quả với cấu trúc sau:

### 🔎 Literature Review
* **Background**: [Tóm tắt bối cảnh nghiên cứu]
* **Related Work**: [So sánh các công trình liên quan và nêu khác biệt]
* **Methods**: [Tóm tắt phương pháp chính của các paper]
* **Key Findings**: [Những kết quả quan trọng nhất]
* **Research Gaps**: [Những khoảng trống/chưa giải quyết]
* **Insights**: [Kết luận và đề xuất nghiên cứu tiếp theo]

Lưu ý: chỉ dùng thông tin từ các đoạn đã cung cấp, nêu rõ trích dẫn nguồn [Tên Paper] khi cần. Giữ văn phong học thuật, súc tích và dễ hiểu."""

    retrieval = await asyncio.to_thread(
        state.retriever.retrieve,
        query=query,
        paper_ids=paper_ids,
        top_k=settings.top_k_retrieval,
    )

    generation = await asyncio.to_thread(
        state.generator.generate,
        query=query,
        context_text=retrieval.context_text,
    )

    session = get_session(state.engine)
    try:
        import json
        session.add(ChatHistory(
            session_id=session_id,
            role="user",
            content=query,
            context_papers=json.dumps(paper_ids or []),
            citations="[]",
            model_used="",
        ))
        session.add(ChatHistory(
            session_id=session_id,
            role="assistant",
            content=generation.content,
            context_papers=json.dumps(retrieval.papers_used),
            citations=json.dumps(generation.citations),
            model_used=generation.model_used,
        ))
        session.commit()
    except Exception as e:
        session.rollback()
        logger.error(f"Failed to save review history: {e}")
    finally:
        session.close()

    return {
        "answer": generation.content,
        "citations": generation.citations,
        "model_used": generation.model_used,
        "papers_used": retrieval.papers_used,
        "chunks_used": retrieval.total_chunks,
    }


@app.post("/api/critique")
async def critique(request: dict = Body(...)):
    """Generate a critical review (AI Phản biện) that points out assumptions, weaknesses, missing data, and reproducibility issues."""
    paper_ids = request.get("paper_ids")
    query = request.get("query", "").strip()
    session_id = request.get("session_id", "critique")

    critique_prompt = """Bạn là một chuyên gia phản biện học thuật. Dựa trên các đoạn trích được cung cấp từ những paper đã chọn, hãy:

1) Liệt kê các giả thiết (assumptions) mà paper dựa vào và đánh giá tính hợp lý của chúng (ngắn gọn).
2) Chỉ ra các thiếu sót về dữ liệu (ví dụ dataset thiếu, kích thước nhỏ, bias, không có baseline phù hợp).
3) Phân tích các hạn chế phương pháp (thiếu kiểm chứng, thiếu ablation, thiếu so sánh với state-of-the-art).
4) Nêu nguy cơ overclaim / kết luận vượt quá dữ liệu.
5) Kiểm tra tính khả thi lặp lại (reproducibility): thông tin thiếu, hyperparams, code/data không có.
6) Đưa ra 3 đề xuất cụ thể để cải thiện bài báo (nhỏ gọn, hành động được).

Trả về kết quả theo dạng gạch đầu dòng, mỗi điểm ngắn gọn, có trích dẫn [Tên Paper] cho các ví dụ hoặc chứng cứ. Viết bằng tiếng Việt, giọng phản biện, súc tích.
"""

    # If user supplied a custom query, append it to the prompt
    if query:
        full_query = f"{critique_prompt}\nUSER_REQUEST: {query}"
    else:
        full_query = critique_prompt

    retrieval = await asyncio.to_thread(
        state.retriever.retrieve,
        query=full_query,
        paper_ids=paper_ids,
        top_k=settings.top_k_retrieval,
    )

    generation = await asyncio.to_thread(
        state.generator.generate,
        query=full_query,
        context_text=retrieval.context_text,
    )

    session = get_session(state.engine)
    try:
        import json
        session.add(ChatHistory(
            session_id=session_id,
            role="user",
            content=full_query,
            context_papers=json.dumps(paper_ids or []),
            citations="[]",
            model_used="",
        ))
        session.add(ChatHistory(
            session_id=session_id,
            role="assistant",
            content=generation.content,
            context_papers=json.dumps(retrieval.papers_used),
            citations=json.dumps(generation.citations),
            model_used=generation.model_used,
        ))
        session.commit()
    except Exception as e:
        session.rollback()
        logger.error(f"Failed to save critique history: {e}")
    finally:
        session.close()

    return {
        "answer": generation.content,
        "citations": generation.citations,
        "model_used": generation.model_used,
        "papers_used": retrieval.papers_used,
        "chunks_used": retrieval.total_chunks,
    }


@app.post("/api/debate")
async def debate(request: dict = Body(...)):
    """Generate a paired debate between two AI personas (AI A vs AI B) based on selected papers."""
    paper_ids = request.get("paper_ids")
    query = request.get("query", "").strip()
    session_id = request.get("session_id", "debate")

    debate_prompt = """Bạn là một trợ lý phân tích học thuật. Hãy tạo một cuộc tranh luận giữa hai persona AI: **AI A (Ủng hộ)** và **AI B (Phản biện)**, dựa chỉ trên các đoạn trích được cung cấp từ các paper đã chọn.

Yêu cầu bắt buộc về định dạng đầu ra (BẮT BUỘC):
- Phần phải gồm các tiêu đề và gạch đầu dòng chính xác theo thứ tự sau: `AI A (Ủng hộ):`, `AI B (Phản biện):`, `Kết luận:`, `3 Đề xuất:`.
- Mỗi bên (AI A / AI B) bao gồm 2 mục gạch đầu dòng: `• Luận điểm chính:` (1-2 câu) và `• Phản biện ngắn:` (1 câu trả lời/đáp lại bên kia).
- Luôn kèm trích dẫn nguồn ở những câu nêu bằng chứng theo định dạng `[Tên Paper]` hoặc `[Tên Paper, trang X]` nếu có, ngay sau câu chứng cứ.
- `Kết luận:` (1-2 câu) tóm tắt điểm khác biệt cốt lõi và khi nào mỗi quan điểm phù hợp.
- `3 Đề xuất:` liệt kê 3 hành động/kiểm chứng cụ thể, mỗi đề xuất 1 dòng.
- Toàn bộ output viết bằng tiếng Việt, ngắn gọn, dùng gạch đầu dòng, không thêm giới thiệu dài, không dùng markup khác ngoài gạch đầu dòng và tiêu đề bên trên.

Nếu user có thêm `USER_REQUEST`, hãy điều chỉnh chủ đề tranh luận theo yêu cầu đó, nhưng vẫn chỉ dùng thông tin từ `context_text` (các đoạn trích).

Ví dụ (mẫu bắt buộc, cho UI dễ parse):

AI A (Ủng hộ):
• Luận điểm chính: Transformer vượt trội vì khả năng song song và mô hình hóa phụ thuộc dài hạn hiệu quả hơn RNN (2 câu). [Võ et al. 2023]
• Phản biện ngắn: Tuy nhiên, chi phí tính toán cao có thể làm giảm lợi ích trong môi trường tài nguyên hạn chế. [Nguyen et al. 2022]

AI B (Phản biện):
• Luận điểm chính: RNN vẫn hiệu quả với dữ liệu chuỗi ngắn và tiêu tốn ít bộ nhớ, có lợi cho tác vụ nhúng trên thiết bị (2 câu). [Tran & Lê 2021]
• Phản biện ngắn: Transformer có thể được tinh chỉnh hoặc nén để giảm chi phí trong nhiều trường hợp. [Lâm et al. 2022]

Kết luận:
• Transformer thường tốt hơn cho phụ thuộc dài, RNN vẫn có chỗ dùng cho tài nguyên hạn chế.

3 Đề xuất:
1. Thử nghiệm trực tiếp: chạy benchmark trên cùng bộ dữ liệu A với các cấu hình Transformer/RNN và báo metric latency/accuracy. [Tên Paper liên quan]
2. Ablation: so sánh phiên bản Transformer đã nén/quantize với RNN để kiểm tra trade-off.
3. Kiểm tra robustness: đánh giá trên dữ liệu nhiễu để đo ảnh hưởng của overfitting.

Lưu ý: giữ output ngắn gọn và chỉ dùng chứng cứ từ các đoạn trích đã cung cấp.
"""

    if query:
        full_query = f"{debate_prompt}\nUSER_REQUEST: {query}"
    else:
        full_query = debate_prompt

    retrieval = await asyncio.to_thread(
        state.retriever.retrieve,
        query=full_query,
        paper_ids=paper_ids,
        top_k=settings.top_k_retrieval,
    )

    # For debate: allow general knowledge if no papers/context available
    context_for_generation = retrieval.context_text
    if not context_for_generation.strip():
        # Fallback: allow LLM to generate debate from general knowledge
        context_for_generation = "[Không có tài liệu được chọn. Hãy tạo cuộc tranh luận dựa trên kiến thức chung.]"

    generation = await asyncio.to_thread(
        state.generator.generate,
        query=full_query,
        context_text=context_for_generation,
    )

    session = get_session(state.engine)
    try:
        import json
        session.add(ChatHistory(
            session_id=session_id,
            role="user",
            content=full_query,
            context_papers=json.dumps(paper_ids or []),
            citations="[]",
            model_used="",
        ))
        session.add(ChatHistory(
            session_id=session_id,
            role="assistant",
            content=generation.content,
            context_papers=json.dumps(retrieval.papers_used),
            citations=json.dumps(generation.citations),
            model_used=generation.model_used,
        ))
        session.commit()
    except Exception as e:
        session.rollback()
        logger.error(f"Failed to save debate history: {e}")
    finally:
        session.close()

    return {
        "answer": generation.content,
        "citations": generation.citations,
        "model_used": generation.model_used,
        "papers_used": retrieval.papers_used,
        "chunks_used": retrieval.total_chunks,
    }


async def _stream_chat(query: str, context_text: str, session_id: str, paper_ids: list):
    """Stream chat response chunks and save to history once completed."""
    full_response = ""
    for chunk in state.generator.stream_generate(query, context_text):
        full_response += chunk
        yield f"data: {chunk}\n\n"

    # Save to history after stream finishes
    db = get_session(state.engine)
    try:
        import json
        # Save user message
        db.add(ChatHistory(
            session_id=session_id,
            role="user",
            content=query,
            context_papers=json.dumps(paper_ids or []),
            citations="[]",
            model_used="",
        ))
        
        # Save assistant message
        model_used = "gemini/free" if settings.llm_mode == "cloud_free" else (
            f"deepseek/{settings.deepseek_model}" if settings.llm_mode == "cloud_custom" and settings.custom_cloud_provider == "deepseek" else (
                f"gemini/{settings.gemini_model}" if settings.llm_mode == "cloud_custom" and settings.custom_cloud_provider == "gemini" else (
                    f"claude/{settings.claude_model}" if settings.llm_mode == "cloud_custom" else f"ollama/{settings.ollama_model}"
                )
            )
        )
        
        # Extract citations from streaming result
        citations = []
        pattern = r'\[([^\]]+?)(?:,\s*trang\s*(\d+))?\]'
        import re
        for match in re.finditer(pattern, full_response):
            citations.append({
                "source": match.group(1).strip(),
                "page": int(match.group(2)) if match.group(2) else None,
                "text": match.group(0),
            })
            
        db.add(ChatHistory(
            session_id=session_id,
            role="assistant",
            content=full_response,
            context_papers="[]",
            citations=json.dumps(citations),
            model_used=model_used,
        ))
        db.commit()
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to save streamed chat history: {e}")
    finally:
        db.close()


@app.get("/api/chat/history")
async def get_chat_history(session_id: str = Query(None), limit: int = Query(50)):
    """Get chat history."""
    db = get_session(state.engine)
    try:
        query = db.query(ChatHistory).order_by(ChatHistory.created_at.desc())
        if session_id:
            query = query.filter(ChatHistory.session_id == session_id)
        history = query.limit(limit).all()

        return {
            "history": [
                {
                    "id": h.id,
                    "role": h.role,
                    "content": h.content,
                    "citations": h.citations,
                    "model_used": h.model_used,
                    "created_at": str(h.created_at) if h.created_at else None,
                }
                for h in reversed(history)
            ]
        }
    finally:
        db.close()


@app.delete("/api/chat/history")
async def clear_chat_history():
    """Clear all chat history."""
    db = get_session(state.engine)
    try:
        db.query(ChatHistory).delete()
        db.commit()
        return {"status": "cleared"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


# ─── Stats ───────────────────────────────────────────────────────

@app.get("/api/stats")
async def get_stats():
    """Get system statistics."""
    session = get_session(state.engine)
    try:
        total_papers = session.query(Paper).count()
        indexed_papers = session.query(Paper).filter(Paper.status == "indexed").count()
        total_chunks = session.query(Chunk).count()
        total_size = session.query(Paper).with_entities(Paper.file_size).all()
        total_size_bytes = sum(s[0] or 0 for s in total_size)

        # Chunks in ChromaDB
        chroma_count = state.vector.count()

        return {
            "total_papers": total_papers,
            "indexed_papers": indexed_papers,
            "total_chunks": total_chunks,
            "chroma_chunks": chroma_count,
            "total_size_mb": round(total_size_bytes / (1024 * 1024), 2),
            "embedding_model": settings.embedding_model,
            "llm_mode": settings.llm_mode,
            "data_dir": str(settings.data_dir),
        }
    finally:
        session.close()


# ─── Settings ────────────────────────────────────────────────────

@app.get("/api/settings")
async def get_settings():
    """Get all settings."""
    return {
        "ollama_url": settings.ollama_url,
        "ollama_model": settings.ollama_model,
        "llm_mode": settings.llm_mode,
        "claude_api_key": "***" if settings.claude_api_key else "",
        "claude_model": settings.claude_model,
        "deepseek_api_key": "***" if settings.deepseek_api_key else "",
        "deepseek_model": settings.deepseek_model,
        "gemini_api_key": "***" if settings.gemini_api_key else "",
        "gemini_model": settings.gemini_model,
        "groq_api_key": "***" if settings.groq_api_key else "",
        "groq_model": settings.groq_model,
        "freemodel_api_key": "***" if settings.freemodel_api_key else "",
        "freemodel_model": settings.freemodel_model,
        "custom_cloud_provider": settings.custom_cloud_provider,
        "model_tier_weak": settings.model_tier_weak,
        "model_tier_medium": settings.model_tier_medium,
        "model_tier_strong": settings.model_tier_strong,
        "chunk_size": settings.chunk_size,
        "chunk_overlap": settings.chunk_overlap,
        "top_k_retrieval": settings.top_k_retrieval,
        "embedding_model": settings.embedding_model,
        "setup_completed": settings.setup_completed,
        "zotero_data_dir": getattr(settings, "zotero_data_dir", ""),
    }


@app.put("/api/settings")
async def update_settings(new_settings: dict = Body(...)):
    """Update settings."""
    session = get_session(state.engine)
    try:
        for key, value in new_settings.items():
            if hasattr(settings, key):
                # Do not overwrite keys if sent as mask or empty (frontend sends "" for masked keys)
                if key in ("claude_api_key", "deepseek_api_key", "gemini_api_key", "groq_api_key", "freemodel_api_key"):
                    if value == "***" or (not value and getattr(settings, key, None)):
                        continue
                setattr(settings, key, value)
                # Persist to DB
                setting = session.query(Setting).filter(Setting.key == key).first()
                if setting:
                    setting.value = str(value)
                else:
                    session.add(Setting(key=key, value=str(value)))
        session.commit()

        # Recreate generator if LLM settings changed
        state.generator = Generator(
            ollama_url=settings.ollama_url,
            ollama_model=settings.ollama_model,
            claude_api_key=settings.claude_api_key,
            claude_model=settings.claude_model,
            deepseek_api_key=settings.deepseek_api_key,
            deepseek_model=settings.deepseek_model,
            gemini_api_key=settings.gemini_api_key,
            gemini_model=settings.gemini_model,
            groq_api_key=settings.groq_api_key,
            groq_model=settings.groq_model,
            nvidia_api_key=settings.nvidia_api_key,
            nvidia_model=settings.nvidia_model,
            nvidia_url=getattr(settings, "nvidia_url", "https://integrate.api.nvidia.com/v1"),
            freemodel_api_key=settings.freemodel_api_key,
            freemodel_model=settings.freemodel_model,
            freemodel_url=getattr(settings, "freemodel_url", "https://freemodel.dev/v1"),
            mode=settings.llm_mode,
            custom_cloud_provider=settings.custom_cloud_provider,
        )

        return {"status": "updated"}
    except Exception as e:
        session.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        session.close()


@app.get("/api/chat/usage")
async def get_chat_usage():
    """Get daily free cloud usage stats."""
    session = get_session(state.engine)
    try:
        used = count_free_queries_today(session)
        return {
            "used": used,
            "limit": settings.free_cloud_daily_limit,
            "remaining": max(0, settings.free_cloud_daily_limit - used),
            "mode": settings.llm_mode,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        session.close()


@app.post("/api/settings/validate-key")
async def validate_api_key(body: dict = Body(...)):
    """Validate API Key for a custom cloud provider."""
    provider = body.get("provider")
    api_key = body.get("api_key")
    model = body.get("model")

    if not provider or not api_key:
        raise HTTPException(status_code=400, detail="Missing provider or api_key")

    import httpx
    # If the user passed "***", they want to keep the existing saved key.
    # In that case, load it from settings.
    if api_key == "***":
        if provider == "deepseek":
            api_key = settings.deepseek_api_key
        elif provider == "gemini":
            api_key = settings.gemini_api_key
        elif provider == "claude":
            api_key = settings.claude_api_key

    if not api_key:
        return {"valid": False, "error": "Chưa có API Key."}

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            if provider == "gemini":
                # Validate Gemini key
                model_name = model or "gemini-1.5-flash"
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}"
                # Lightweight content generation request
                payload = {
                    "contents": [{"parts": [{"text": "Say ok"}]}]
                }
                res = await client.post(url, json=payload)
                if res.status_code == 200:
                    return {"valid": True}
                else:
                    try:
                        err_msg = res.json().get("error", {}).get("message", res.text)
                    except:
                        err_msg = res.text
                    return {"valid": False, "error": f"Lỗi Gemini: {err_msg}"}

            elif provider == "deepseek":
                # Validate DeepSeek key
                url = "https://api.deepseek.com/chat/completions"
                headers = {
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json"
                }
                model_name = model or "deepseek-chat"
                payload = {
                    "model": model_name,
                    "messages": [{"role": "user", "content": "Say ok"}],
                    "max_tokens": 5
                }
                res = await client.post(url, json=payload, headers=headers)
                if res.status_code == 200:
                    return {"valid": True}
                else:
                    try:
                        err_msg = res.json().get("error", {}).get("message", res.text)
                    except:
                        err_msg = res.text
                    return {"valid": False, "error": f"Lỗi DeepSeek: {err_msg}"}

            elif provider == "claude":
                # Validate Claude key
                url = "https://api.anthropic.com/v1/messages"
                headers = {
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                    "Content-Type": "application/json"
                }
                model_name = model or "claude-3-5-haiku-20241022"
                payload = {
                    "model": model_name,
                    "messages": [{"role": "user", "content": "Say ok"}],
                    "max_tokens": 5
                }
                res = await client.post(url, json=payload, headers=headers)
                if res.status_code == 200:
                    return {"valid": True}
                else:
                    try:
                        err_msg = res.json().get("error", {}).get("message", res.text)
                    except:
                        err_msg = res.text
                    return {"valid": False, "error": f"Lỗi Claude: {err_msg}"}

            else:
                return {"valid": False, "error": f"Nhà cung cấp '{provider}' không hợp lệ."}

    except Exception as e:
        logger.error(f"Error validating API key: {e}")
        return {"valid": False, "error": f"Lỗi kết nối mạng: {str(e)}"}


@app.get("/api/ollama/status")
async def get_ollama_status():
    """Check if Ollama is running and list available models."""
    import httpx
    url = f"{settings.ollama_url}/api/tags"
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            res = await client.get(url)
            if res.status_code == 200:
                models_data = res.json().get("models", [])
                pulled_models = [m.get("name") for m in models_data]
                return {
                    "connected": True,
                    "models": pulled_models,
                    "ollama_url": settings.ollama_url
                }
            else:
                return {
                    "connected": False,
                    "error": f"Ollama HTTP {res.status_code}",
                    "ollama_url": settings.ollama_url
                }
    except Exception as e:
        return {
            "connected": False,
            "error": f"Không thể kết nối đến Ollama: {str(e)}",
            "ollama_url": settings.ollama_url
        }


@app.post("/api/ollama/pull")
async def pull_ollama_model(body: dict = Body(...)):
    """Pull an Ollama model and stream the progress back to the frontend."""
    model = body.get("model")
    if not model:
        raise HTTPException(status_code=400, detail="Missing model parameter")

    import httpx
    import json

    async def progress_generator():
        # Connect to local Ollama API
        url = f"{settings.ollama_url}/api/pull"
        # We use a POST request with stream=True
        # Note: Ollama's API responds with JSON lines chunk by chunk
        try:
            async with httpx.AsyncClient(timeout=None) as client:
                async with client.stream("POST", url, json={"name": model, "stream": True}) as response:
                    if response.status_code != 200:
                        yield f"data: {json.dumps({'status': 'error', 'message': f'Ollama error {response.status_code}'})}\n\n"
                        return

                    async for line in response.aiter_lines():
                        if not line.strip():
                            continue
                        # Simply proxy the Ollama JSON payload directly to our client
                        yield f"data: {line}\n\n"
        except Exception as e:
            logger.error(f"Error pulling Ollama model: {e}")
            yield f"data: {json.dumps({'status': 'error', 'message': f'Lỗi kết nối Ollama: {str(e)}'})}\n\n"

    return StreamingResponse(progress_generator(), media_type="text/event-stream")


# ─── Machine Specs ─────────────────────────────────────────────

@app.get("/api/detect-specs")
async def detect_specs():
    """
    Detect machine specs (RAM, CPU) for auto-configuring model tier.

    Returns:
        - total_ram_gb: Total system RAM in GB.
        - cpu_cores: Number of logical CPU cores.
        - suggested_tier: "weak", "medium", or "strong" based on RAM.
        - suggested_model: The recommended Ollama model.
    """
    import os

    # Try multiple methods to detect RAM
    total_ram_gb = 8  # conservative default

    try:
        import psutil
        total_ram_gb = round(psutil.virtual_memory().total / (1024**3), 1)
    except ImportError:
        try:
            # Windows: use wmic
            import subprocess
            result = subprocess.run(
                ["wmic", "MemoryChip", "get", "Capacity"],
                capture_output=True, text=True, timeout=5
            )
            lines = result.stdout.strip().split("\n")[1:]
            total_bytes = sum(int(line.strip()) for line in lines if line.strip().isdigit())
            if total_bytes > 0:
                total_ram_gb = round(total_bytes / (1024**3), 1)
        except Exception:
            pass

    # Detect CPU cores
    cpu_cores = os.cpu_count() or 4

    # Suggest model tier based on RAM
    if total_ram_gb < 8:
        suggested_tier = "weak"
        suggested_model = settings.model_tier_weak
    elif total_ram_gb < 16:
        suggested_tier = "medium"
        suggested_model = settings.model_tier_medium
    else:
        suggested_tier = "strong"
        suggested_model = settings.model_tier_strong

    return {
        "total_ram_gb": total_ram_gb,
        "cpu_cores": cpu_cores,
        "suggested_tier": suggested_tier,
        "suggested_model": suggested_model,
    }


# ─── Data Management ─────────────────────────────────────────────

@app.post("/api/data/open-folder")
async def open_data_folder(body: dict = Body(default={})):
    """Open the specified or current local data folder in file explorer."""
    import subprocess
    import os
    try:
        path_str = body.get("path") or str(settings.data_dir)
        path = Path(path_str)
        path.mkdir(parents=True, exist_ok=True)
        if os.name == "nt":
            os.startfile(str(path))
        elif os.name == "posix":
            subprocess.Popen(["xdg-open", str(path)])
        else:
            subprocess.Popen(["open", str(path)])
        return {"success": True, "message": "Đã mở thư mục dữ liệu."}
    except Exception as e:
        logger.error(f"Failed to open data folder: {e}")
        raise HTTPException(status_code=500, detail=f"Không thể mở thư mục: {str(e)}")


@app.get("/api/data/disk-space")
async def check_disk_space(path: str):
    """Check total and free disk space for a given path."""
    import shutil
    try:
        target_path = Path(path)
        # Find closest existing parent to check disk usage
        check_path = target_path
        while not check_path.exists() and check_path.parent != check_path:
            check_path = check_path.parent
            
        total, used, free = shutil.disk_usage(str(check_path))
        free_gb = free / (1024**3)
        return {
            "total_gb": round(total / (1024**3), 1),
            "used_gb": round(used / (1024**3), 1),
            "free_gb": round(free_gb, 1),
            "warning": free_gb < 10.0  # Warn if less than 10GB free
        }
    except Exception as e:
        logger.error(f"Failed to check disk space: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/data/move-storage")
async def move_storage(body: dict = Body(...)):
    """Move all database files, papers, and vectors to a new path, update config."""
    new_path_str = body.get("new_path")
    if not new_path_str:
        raise HTTPException(status_code=400, detail="Missing new_path parameter")
    
    new_path = Path(new_path_str)
    old_path = settings.data_dir
    
    # Check if they are the same
    if old_path.resolve() == new_path.resolve():
        return {"success": True, "message": "Thư mục mới trùng với thư mục hiện tại."}
        
    try:
        # 1. Close database engines / pools
        state.engine.dispose()
        
        # 2. Wait a brief moment to ensure handles are released
        import time
        import shutil
        import json
        time.sleep(0.3)
        
        # 3. Create new directories
        new_path.mkdir(parents=True, exist_ok=True)
        
        # 4. Copy files from old path to new path
        def copy_dir_contents(src: Path, dst: Path):
            if not src.exists():
                return
            dst.mkdir(parents=True, exist_ok=True)
            for item in src.iterdir():
                if item.name == "config.json":
                    continue
                s = src / item.name
                d = dst / item.name
                if s.is_dir():
                    copy_dir_contents(s, d)
                else:
                    shutil.copy2(str(s), str(d))
        
        copy_dir_contents(old_path, new_path)
        
        # 5. Update settings.data_dir and child paths
        settings.data_dir = new_path
        settings.papers_dir = new_path / "papers"
        settings.chroma_dir = new_path / "chroma"
        settings.db_path = new_path / "db" / "researchmind.db"
        
        # 6. Save data_dir to config.json in fixed default directory
        from config.settings import get_fixed_default_dir
        default_dir = get_fixed_default_dir()
        default_dir.mkdir(parents=True, exist_ok=True)
        config_file = default_dir / "config.json"
        with open(config_file, "w", encoding="utf-8") as f:
            json.dump({"data_dir": str(new_path)}, f, indent=2, ensure_ascii=False)
            
        # 7. Re-initialize database engine at new path
        from db.database import get_engine
        state.engine = get_engine(settings.db_path)
        
        # Re-initialize search engines
        db_session = get_session(state.engine)
        state.bm25 = BM25Search(db_session)
        state.bm25.ensure_fts_table()
        db_session.close()
        
        from search.vector import VectorSearch
        state.vector = VectorSearch(settings.chroma_dir)
        
        from search.hybrid import HybridSearch
        state.hybrid = HybridSearch(
            bm25_search=state.bm25,
            vector_search=state.vector,
            embedder=state.embedder,
            rrf_k=settings.rrf_k,
            top_k_final=settings.top_k_final,
        )
        
        # 8. Safely delete old data directories (except default config.json)
        for sub in ["papers", "chroma", "db"]:
            old_sub = old_path / sub
            if old_sub.exists():
                try:
                    shutil.rmtree(old_sub)
                except Exception as e:
                    logger.warning(f"Could not clean up old subfolder {old_sub}: {e}")
                    
        return {"success": True, "message": f"Đã chuyển thư mục lưu trữ thành công: {new_path_str}"}
    except Exception as e:
        logger.error(f"Failed to move storage: {e}")
        # Try to restore connections to old path
        try:
            from db.database import get_engine
            state.engine = get_engine(settings.db_path)
        except Exception:
            pass
        raise HTTPException(status_code=500, detail=f"Lỗi khi chuyển thư mục dữ liệu: {str(e)}")


@app.post("/api/data/clear-data")
async def clear_all_data():
    """Clear all papers, chunks, chat history, and files (retains settings)."""
    try:
        # Clear database tables (except settings)
        db = get_session(state.engine)
        try:
            db.query(Chunk).delete()
            db.query(Paper).delete()
            db.query(ChatHistory).delete()
            db.commit()
        except Exception as e:
            db.rollback()
            raise e
        finally:
            db.close()
            
        # Re-initialize search engines
        db_session = get_session(state.engine)
        state.bm25 = BM25Search(db_session)
        state.bm25.ensure_fts_table()
        db_session.close()
        
        # Clear files in papers_dir
        if settings.papers_dir.exists():
            import shutil
            for item in settings.papers_dir.iterdir():
                try:
                    if item.is_file():
                        item.unlink()
                    elif item.is_dir():
                        shutil.rmtree(item)
                except Exception as e:
                    logger.warning(f"Failed to delete {item}: {e}")
                    
        # Clear ChromaDB vector collection
        try:
            from search.vector import VectorSearch
            state.vector = VectorSearch(settings.chroma_dir)
            state.vector.clear_collection()
        except Exception as e:
            logger.warning(f"ChromaDB collection clear failed: {e}")

        # Recreate hybrid search
        from search.hybrid import HybridSearch
        state.hybrid = HybridSearch(
            bm25_search=state.bm25,
            vector_search=state.vector,
            embedder=state.embedder,
            rrf_k=settings.rrf_k,
            top_k_final=settings.top_k_final,
        )

        return {"success": True, "message": "Đã xoá toàn bộ dữ liệu tài liệu (giữ lại cài đặt)."}
    except Exception as e:
        logger.error(f"Failed to clear data: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/data/reset-app")
async def reset_app():
    """Fully resets the app by clearing all database tables and files."""
    try:
        # Close engine connection / pool to unlock db file
        state.engine.dispose()
        
        # Clear files in data_dir (papers, chroma, etc. but keep db folder for recreations)
        import shutil
        import time
        
        # Wait a brief moment to ensure handles are released
        time.sleep(0.2)
        
        # We can delete chroma_dir and papers_dir
        for d in [settings.chroma_dir, settings.papers_dir]:
            if d.exists():
                try:
                    shutil.rmtree(d)
                except Exception as e:
                    logger.warning(f"Failed to delete directory {d}: {e}")
                    
        # Drop and recreate tables
        from db.database import get_engine
        state.engine = get_engine(settings.db_path)
        
        try:
            Base.metadata.drop_all(state.engine)
            Base.metadata.create_all(state.engine)
        except Exception as e:
            logger.error(f"Failed to drop/recreate tables: {e}")
            # Fallback: try deleting and re-creating
            if settings.db_path.exists():
                try:
                    settings.db_path.unlink()
                except Exception:
                    pass
            Base.metadata.create_all(state.engine)
            
        # Re-initialize state search engines
        db_session = get_session(state.engine)
        state.bm25 = BM25Search(db_session)
        state.bm25.ensure_fts_table()
        db_session.close()
        
        from search.vector import VectorSearch
        state.vector = VectorSearch(settings.chroma_dir)
        
        from search.hybrid import HybridSearch
        state.hybrid = HybridSearch(
            bm25_search=state.bm25,
            vector_search=state.vector,
            embedder=state.embedder,
            rrf_k=settings.rrf_k,
            top_k_final=settings.top_k_final,
        )
        
        logger.info("Application reset successfully")
        return {"success": True, "message": "Đã reset ứng dụng về trạng thái ban đầu thành công."}
    except Exception as e:
        logger.error(f"Failed to reset app: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ─── Insights (Research Gap + Conflict + Topic Generator) ──────────────────

@app.post("/api/insights/gap")
async def find_research_gap(body: dict = Body(...)):
    """
    Find research gaps across indexed papers.
    Uses RAG to retrieve relevant chunks, then LLM analyzes what's missing.
    """
    paper_ids = body.get("paper_ids")

    # Retrieve diverse chunks from multiple papers
    retrieval = state.retriever.retrieve(
        query="research methodology findings results limitations future work gaps unexplored areas weaknesses",
        paper_ids=paper_ids,
        top_k=15,
    )

    if not retrieval.context_text.strip():
        return {
            "answer": "Không đủ dữ liệu để phân tích. Hãy import thêm paper vào thư viện.",
            "citations": [],
            "model_used": "none",
            "papers_used": [],
            "chunks_used": 0,
        }

    gap_prompt = f"""Dựa trên các đoạn văn sau từ nhiều paper khác nhau, hãy phân tích và chỉ ra:

## 🔍 Research Gap Analysis

### 1. Lỗ hổng nghiên cứu chính (Main Research Gaps)
- Chỉ ra những vấn đề CHƯA được giải quyết hoặc giải quyết chưa tốt trong các paper.
- Với mỗi lỗ hổng, nêu rõ: vấn đề gì, tại sao chưa giải quyết được.

### 2. Điểm yếu chung (Common Weaknesses)
- Các hạn chế mà nhiều paper cùng gặp phải.
- Phương pháp nào còn thiếu sót?

### 3. Hướng nghiên cứu mới (New Research Directions)
- Đề xuất 2-3 hướng nghiên cứu mới dựa trên các lỗ hổng tìm được.
- Với mỗi hướng, giải thích tại sao đây là cơ hội tốt.

### 4. Cơ hội đóng góp (Contribution Opportunities)
- Cụ thể, một nghiên cứu sinh có thể đóng góp gì ngay bây giờ?

Lưu ý: Phân tích dựa CHỈ trên thông tin từ các đoạn đã cung cấp. Trích dẫn nguồn [Tên Paper] khi cần. Trả lời bằng tiếng Việt.

Context từ tài liệu:\n{retrieval.context_text}"""

    generation = state.generator.generate(
        query=gap_prompt,
        context_text=retrieval.context_text,
    )

    return {
        "answer": generation.content,
        "citations": generation.citations,
        "model_used": generation.model_used,
        "papers_used": retrieval.papers_used,
        "chunks_used": retrieval.total_chunks,
    }


@app.post("/api/insights/conflict")
async def find_conflicts(body: dict = Body(...)):
    """
    Find contradictions and conflicts between papers.
    Uses RAG to retrieve diverse chunks, then LLM compares claims.
    """
    paper_ids = body.get("paper_ids")

    # Retrieve chunks focusing on findings, conclusions, claims
    retrieval = state.retriever.retrieve(
        query="findings conclusions results claims arguments methodology approach results show demonstrate suggest",
        paper_ids=paper_ids,
        top_k=15,
    )

    if not retrieval.context_text.strip():
        return {
            "answer": "Không đủ dữ liệu để phân tích. Hãy import thêm paper vào thư viện.",
            "citations": [],
            "model_used": "none",
            "papers_used": [],
            "chunks_used": 0,
        }

    conflict_prompt = f"""Dựa trên các đoạn văn sau từ nhiều paper khác nhau, hãy phân tích và chỉ ra:

## ⚠️ Conflict Analysis

### 1. Mâu thuẫn trực tiếp (Direct Contradictions)
- Paper nào đưa ra kết luận/trường phái đối lập nhau?
- Cụ thể: Paper A nói X, Paper B nói Y — mâu thuẫn ở điểm nào?

### 2. Khác biệt về phương pháp (Methodological Differences)
- Các paper sử dụng phương pháp khác nhau cho cùng vấn đề?
- Kết quả khác nhau do phương pháp hay do dữ liệu?

### 3. Kết quả mâu thuẫn (Conflicting Results)
- Cùng 1 vấn đề nhưng kết quả đo lường khác nhau?
- Giải thích nguyên nhân có thể.

### 4. Góc nhìn đa chiều (Diverse Perspectives)
- Các paper có cách tiếp cận vấn đề từ nhiều góc nhìn khác nhau?
- Góc nhìn nào mạnh/yếu?

### 5. Cơ hội nghiên cứu từ mâu thuẫn (Opportunities)
- Mâu thuẫn nào tạo cơ hội nghiên cứu tốt nhất?
- Nên ưu tiên giải quyết mâu thuẫn nào?

Lưu ý: Phân tích dựa CHỈ trên thông tin từ các đoạn đã cung cấp. Trích dẫn nguồn [Tên Paper] cho mỗi claim. Trả lời bằng tiếng Việt.

Context từ tài liệu:\n{retrieval.context_text}"""

    generation = state.generator.generate(
        query=conflict_prompt,
        context_text=retrieval.context_text,
    )

    return {
        "answer": generation.content,
        "citations": generation.citations,
        "model_used": generation.model_used,
        "papers_used": retrieval.papers_used,
        "chunks_used": retrieval.total_chunks,
    }


@app.post("/api/insights/topic")
async def suggest_topics(body: dict = Body(...)):
    """
    Suggest research topics based on papers in the library.
    Uses RAG to retrieve diverse chunks, then LLM generates topic suggestions.
    """
    paper_ids = body.get("paper_ids")

    # Retrieve diverse chunks to understand the research landscape
    retrieval = state.retriever.retrieve(
        query="research topic methodology findings results future work direction novel approach innovative", 
        paper_ids=paper_ids,
        top_k=15,
    )

    if not retrieval.context_text.strip():
        return {
            "answer": "Không đủ dữ liệu để đề xuất đề tài. Hãy import thêm paper vào thư viện.",
            "citations": [],
            "model_used": "none",
            "papers_used": [],
            "chunks_used": 0,
        }

    topic_prompt = f"""Dựa trên các đoạn văn sau từ nhiều paper khác nhau, hãy phân tích và đề xuất:

## 💡 Research Topic Suggestions

### 1. Tổng quan lĩnh vực nghiên cứu (Research Landscape)
- Nhận xét nhanh về lĩnh vực/lĩnh vực con mà các paper đang tập trung.
- Xu hướng chính hiện tại là gì?

### 2. Đề xuất đề tài nghiên cứu (Suggested Topics)
Đề xuất 3-5 đề tài nghiên cứu cụ thể, mỗi đề tài bao gồm:
- **Tên đề tài** (gợi cảm hứng, rõ ràng)
- **Mô tả ngắn** (2-3 dòng giải thích đề tài)
- **Tại sao quan trọng** (cơ hội và tiềm năng đóng góp)
- **Gợi ý phương pháp tiếp cận** (cách triển khai sơ bộ)

### 3. Đề tài có tiềm năng cao nhất (Top Pick)
- Chọn 1 đề tài từ danh sách trên.
- Giải thích chi tiết hơn: tại sao đây là cơ hội vàng cho nghiên cứu sinh.
- Cần đọc thêm tài liệu nào để bắt đầu?

### 4. Gợi ý bước tiếp theo (Next Steps)
- Nên đọc thêm paper nào (dựa trên các paper hiện có)?
- Phương pháp nào nên tìm hiểu thêm?

Lưu ý: Đề xuất phải khả thi, cụ thể và dựa trên nội dung thực tế từ các đoạn đã cung cấp. Trích dẫn nguồn [Tên Paper] khi cần. Trả lời bằng tiếng Việt.

Context từ tài liệu:\n{retrieval.context_text}"""

    generation = state.generator.generate(
        query=topic_prompt,
        context_text=retrieval.context_text,
    )

    return {
        "answer": generation.content,
        "citations": generation.citations,
        "model_used": generation.model_used,
        "papers_used": retrieval.papers_used,
        "chunks_used": retrieval.total_chunks,
    }


@app.post("/api/insights/evolution")
async def find_evolution_map(body: dict = Body(...)):
    """
    Analyze research evolution across papers.
    Uses RAG to retrieve diverse chunks, then LLM maps the evolution of ideas.
    """
    paper_ids = body.get("paper_ids")

    # Single broad retrieval to capture evolution context
    retrieval = state.retriever.retrieve(
        query="research evolution development history background methodology findings results improvement advancement novel approach future direction", 
        paper_ids=paper_ids,
        top_k=20,
    )

    if not retrieval.context_text.strip():
        return {
            "answer": "Không đủ dữ liệu để phân tích evolution map. Hãy import thêm paper vào thư viện.",
            "citations": [],
            "model_used": "none",
            "papers_used": [],
            "chunks_used": 0,
        }

    evolution_prompt = f"""Dựa trên các đoạn văn sau từ nhiều paper khác nhau, hãy phân tích và vẽ bản đồ phát triển nghiên cứu.
Lưu ý: Sắp xếp các paper/giai đoạn theo thứ tự thời gian (cũ nhất → mới nhất) dựa trên năm xuất bản hoặc nội dung.

## 🧬 Evolution Map — Bản đồ phát triển nghiên cứu

### 1. Tổng quan xu hướng (Trend Overview)
- Nhận xét tổng quan về sự phát triển của lĩnh vực nghiên cứu trong các paper.
- Xu hướng chính theo thời gian là gì?

### 2. Dòng phát triển ý tưởng (Idea Evolution Chain)
Liệt kê theo thứ tự thời gian (cũ → mới):
- **Giai đoạn 1** (Paper cũ nhất): Ý tưởng ban đầu, nền tảng
- **Giai đoạn 2**: Phát triển tiếp, mở rộng hoặc cải tiến
- **Giai đoạn 3**: Đóng góp mới, bước ngoặt
- **Giai đoạn 4** (Paper mới nhất): Xu hướng hiện tại, tương lai

Với mỗi giai đoạn, nêu rõ:
- Paper nào đại diện (tên + năm nếu có)
- Ý tưởng chính của giai đoạn
- So với giai đoạn trước, có gì mới/khác?

### 3. Các bước ngoặt quan trọng (Key Milestones)
- Những phát hiện nào đã thay đổi hướng nghiên cứu?
- Phương pháp nào đã tạo đột phá?

### 4. Sơ đồ quan hệ (Relationship Map)
- Paper nào kế thừa/yếu tố từ paper nào?
- Có paper nào độc lập nhưng cùng chủ đề?

### 5. Dự đoán xu hướng tương lai (Future Trends)
- Dựa trên evolution map, xu hướng tiếp theo sẽ là gì?
- Researchers nên chuẩn bị kỹ năng/phương pháp gì?

Lưu ý: Phân tích dựa CHỈ trên thông tin từ các đoạn đã cung cấp. Trích dẫn nguồn [Tên Paper] cho mỗi giai đoạn. Trả lời bằng tiếng Việt.

Context từ tài liệu:\n{retrieval.context_text}"""

    generation = state.generator.generate(
        query=evolution_prompt,
        context_text=retrieval.context_text,
    )

    return {
        "answer": generation.content,
        "citations": generation.citations,
        "model_used": generation.model_used,
        "papers_used": retrieval.papers_used,
        "chunks_used": retrieval.total_chunks,
    }


# ─── Personalized Knowledge Brain ─────────────────────────────

@app.get("/api/personal/brain")
async def get_personal_brain():
    """
    Personalized Knowledge Brain: analyzes the user's library and reading
    patterns to provide personalized insights.
    
    Returns:
    - Reading statistics (total, read, unread, starred, languages)
    - Topic interest analysis (based on tags, titles, chat queries)
    - Author preference analysis (most frequent authors)
    - Reading timeline (papers added over time)
    - Personalized recommendations (what to read next, suggested topics)
    - Reading streak / activity
    """
    session = get_session(state.engine)
    try:
        import json as _json
        
        # ── 1. Reading Statistics ──
        all_papers = session.query(Paper).filter(Paper.status == "indexed").all()
        total_papers = len(all_papers)
        
        read_papers = [p for p in all_papers if p.read_status == "read"]
        reading_papers = [p for p in all_papers if p.read_status == "reading"]
        unread_papers = [p for p in all_papers if p.read_status == "unread"]
        starred_papers = [p for p in all_papers if p.starred]
        
        languages = Counter(p.language for p in all_papers)
        total_pages = sum(p.page_count or 0 for p in all_papers)
        
        reading_stats = {
            "total_papers": total_papers,
            "read_count": len(read_papers),
            "reading_count": len(reading_papers),
            "unread_count": len(unread_papers),
            "starred_count": len(starred_papers),
            "total_pages": total_pages,
            "languages": dict(languages),
            "read_percentage": round(len(read_papers) / total_papers * 100, 1) if total_papers > 0 else 0,
        }
        
        # ── 2. Topic Interest Analysis ──
        # Collect all tags from papers
        all_tags = []
        for p in all_papers:
            try:
                tags = _json.loads(p.tags or "[]")
                all_tags.extend(tags)
            except Exception:
                pass
        
        tag_counts = Counter(all_tags)
        top_topics = tag_counts.most_common(10)
        
        # Also analyze titles for keywords (simple extraction)
        title_words = []
        stop_words = set(['the', 'a', 'an', 'and', 'or', 'of', 'in', 'on', 'at', 'to', 'for', 'is', 'are', 'was', 'were', 'by', 'with', 'from', 'that', 'this', 'it', 'its', 'as', 'not', 'but', 'can', 'has', 'have', 'been', 'we', 'our', 'their', 'they', 'he', 'she', 'than', 'if', 'when', 'which', 'what', 'how', 'all', 'each', 'every', 'more', 'most', 'no', 'other', 'some', 'such', 'than', 'too', 'very', 'may', 'will', 'also', 'about', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between', 'under', 'again', 'then', 'once', 'here', 'there', 'why', 'both', 'few', 'own', 'same', 'so', 'while', 'only', 'now', 'over', 'such', 'just', 'any', 'new', 'one', 'two', 'first', 'based', 'using', 'approach', 'method', 'model', 'using', 'via', 'study', 'paper', 'analysis', 'using', 'data', 'method', 'methods', 'approach', 'approaches', 'performance', 'result', 'results', 'present', 'propose', 'proposed', 'introduce', 'introduced', 'develop', 'developed', 'providing', 'provide'])
        
        for p in all_papers:
            if p.title:
                words = re.findall(r'[a-zA-Z]{3,}', p.title.lower())
                title_words.extend([w for w in words if w not in stop_words and len(w) > 3])
        
        word_counts = Counter(title_words)
        top_keywords = word_counts.most_common(15)
        
        # Analyze chat queries for interests
        user_queries = session.query(ChatHistory.content).filter(
            ChatHistory.role == "user"
        ).limit(100).all()
        
        query_words = []
        for (content,) in user_queries:
            words = re.findall(r'[a-zA-ZÀ-ỹ]{3,}', content.lower())
            query_words.extend([w for w in words if w not in stop_words and len(w) > 3])
        
        query_word_counts = Counter(query_words)
        top_query_topics = query_word_counts.most_common(10)
        
        topic_interests = {
            "top_tags": [{"topic": t, "count": c} for t, c in top_topics],
            "top_keywords": [{"keyword": w, "count": c} for w, c in top_keywords],
            "top_query_topics": [{"topic": t, "count": c} for t, c in top_query_topics],
        }
        
        # ── 3. Author Preference Analysis ──
        all_authors = []
        for p in all_papers:
            try:
                authors = _json.loads(p.authors or "[]")
                if isinstance(authors, list):
                    all_authors.extend([a.strip() for a in authors if a.strip()])
            except Exception:
                pass
        
        author_counts = Counter(all_authors)
        top_authors = author_counts.most_common(10)
        
        author_preferences = {
            "top_authors": [{"author": a, "count": c} for a, c in top_authors],
        }
        
        # ── 4. Reading Timeline (papers added over time) ──
        timeline = []
        month_counts = Counter()
        for p in all_papers:
            if p.created_at:
                month_key = p.created_at.strftime("%Y-%m")
                month_counts[month_key] += 1
        
        for month in sorted(month_counts.keys(), reverse=True)[:6]:
            timeline.append({"month": month, "count": month_counts[month]})
        
        # ── 5. Reading Activity (recent activity) ──
        recent_chats = session.query(ChatHistory).filter(
            ChatHistory.role == "user"
        ).order_by(ChatHistory.created_at.desc()).limit(10).all()
        
        recent_activity = []
        for ch in recent_chats:
            recent_activity.append({
                "type": "chat",
                "content": ch.content[:100],
                "date": str(ch.created_at) if ch.created_at else None,
            })
        
        # ── 6. Personalized Insights (computed, no LLM needed) ──
        insights = []
        
        if total_papers == 0:
            insights.append({
                "type": "info",
                "title": "Bắt đầu hành trình nghiên cứu",
                "description": "Hãy import PDF đầu tiên để xây dựng thư viện nghiên cứu của bạn.",
                "action": "Import PDF",
            })
        else:
            # Unread papers warning
            if len(unread_papers) > 0:
                insights.append({
                    "type": "action",
                    "title": f"{len(unread_papers)} paper chưa đọc",
                    "description": f"Bạn có {len(unread_papers)} paper chờ xử lý. Hãy bắt đầu với paper quan trọng nhất.",
                    "action": "Xem thư viện",
                })
            
            # Reading progress
            if len(read_papers) > 0 and total_papers > 0:
                pct = round(len(read_papers) / total_papers * 100)
                insights.append({
                    "type": "progress",
                    "title": f"Tiến độ đọc: {pct}%",
                    "description": f"Bạn đã đọc {len(read_papers)}/{total_papers} paper. {'Tuyệt vời!' if pct > 70 else 'Cố gắng lên!' if pct > 30 else 'Hãy đọc thêm paper nhé!'}",
                })
            
            # Top topic suggestion
            if top_topics:
                top_topic = top_topics[0][0]
                insights.append({
                    "type": "insight",
                    "title": f"Chủ đề quan tâm nhất: {top_topic}",
                    "description": f"Bạn đang tập trung nhiều vào '{top_topic}'. Hãy tìm thêm paper liên quan để mở rộng kiến thức.",
                })
            
            # Language balance
            if len(languages) > 1:
                langs = ", ".join([f"{lang}: {count}" for lang, count in languages.most_common(3)])
                insights.append({
                    "type": "info",
                    "title": "Ngôn ngữ đa dạng",
                    "description": f"Thư viện của bạn có nhiều ngôn ngữ: {langs}. Điều này cho thấy bạn tiếp cận nghiên cứu từ nhiều nguồn.",
                })
            
            # Starred papers suggestion
            if len(starred_papers) > 0:
                starred_titles = [p.title or p.filename for p in starred_papers[:3]]
                insights.append({
                    "type": "insight",
                    "title": f"{len(starred_papers)} paper yêu thích",
                    "description": f"Các paper được yêu thích: {', '.join(starred_titles[:2])}{'...' if len(starred_titles) > 2 else ''}. Đây có thể là hướng nghiên cứu chính của bạn.",
                })
            
            # Suggestion: create a review
            if total_papers >= 3 and len(read_papers) < total_papers // 2:
                insights.append({
                    "type": "action",
                    "title": "Tạo Literature Review",
                    "description": "Với nhiều paper chưa đọc, hãy để AI tóm tắt và review giúp bạn.",
                    "action": "Tạo Review",
                })
        
        return {
            "reading_stats": reading_stats,
            "topic_interests": topic_interests,
            "author_preferences": author_preferences,
            "timeline": timeline,
            "recent_activity": recent_activity,
            "insights": insights,
        }
    finally:
        session.close()


# ─── Daily AI Reader ──────────────────────────────────────────

@app.get("/api/personal/daily-reader")
async def get_daily_reader():
    """
    Daily AI Reader: suggests papers to read each day based on user's
    interests, reading history, and paper metadata.
    
    Returns:
    - today_suggestion: AI-generated daily reading suggestion with summary
    - unread_papers: list of unread papers prioritized by relevance
    - recommended_read_order: suggested reading order
    - reading_streak: current reading activity
    """
    session = get_session(state.engine)
    try:
        import json as _json
        
        # ── 1. Get all indexed papers ──
        all_papers = session.query(Paper).filter(Paper.status == "indexed").all()
        
        unread_papers = [p for p in all_papers if p.read_status == "unread"]
        reading_papers = [p for p in all_papers if p.read_status == "reading"]
        read_papers = [p for p in all_papers if p.read_status == "read"]
        
        # ── 2. Analyze user interests from tags and chat history ──
        all_tags = []
        for p in all_papers:
            try:
                tags = _json.loads(p.tags or "[]")
                all_tags.extend(tags)
            except Exception:
                pass
        
        tag_counts = Counter(all_tags)
        top_interests = [t for t, c in tag_counts.most_common(5)]
        
        # Get recent chat queries to understand current interests
        recent_queries = session.query(ChatHistory.content).filter(
            ChatHistory.role == "user"
        ).order_by(ChatHistory.created_at.desc()).limit(20).all()
        
        query_text = " ".join([q[0] for q in recent_queries]) if recent_queries else ""
        
        # ── 3. Build paper summaries for AI context ──
        paper_summaries = []
        for p in all_papers:
            summary = {
                "id": p.id,
                "title": p.title or p.filename,
                "authors": "",
                "year": p.year,
                "language": p.language,
                "read_status": p.read_status,
                "tags": [],
                "pages": p.page_count or 0,
                "auto_summary": "",
            }
            try:
                authors = _json.loads(p.authors or "[]")
                if isinstance(authors, list):
                    summary["authors"] = ", ".join(authors[:3])
            except Exception:
                pass
            try:
                summary["tags"] = _json.loads(p.tags or "[]")
            except Exception:
                pass
            if p.auto_summary:
                # Truncate auto_summary for context
                summary["auto_summary"] = p.auto_summary[:200]
            paper_summaries.append(summary)
        
        # ── 4. AI generates daily reading suggestion ──
        daily_suggestion = None
        
        if len(all_papers) > 0:
            papers_context = _json.dumps(paper_summaries[:30], ensure_ascii=False, indent=1)
            interests_context = f"Top interests: {', '.join(top_interests)}" if top_interests else "No tags yet"
            recent_context = f"Recent chat topics: {query_text[:500]}" if query_text else "No recent chat"
            
            daily_prompt = f"""Bạn là trợ lý nghiên cứu cá nhân. Dựa trên thư viện paper và sở thích của người dùng, hãy gợi ý paper nên đọc HÔM NAY.

## Thư viện paper:
{papers_context}

## Sở thích:
{interests_context}

## Hoạt động gần đây:
{recent_context}

## YÊU CẦU:
Hãy chọn 2-3 paper phù hợp nhất để đọc hôm nay. Với mỗi paper, hãy:
1. Giải thích TẠI SAO paper này phù hợp với sở thích của người dùng
2. Đọc paper này sẽ giúp ích gì cho nghiên cứu của họ
3. Gợi ý đọc paper nào TIẾP THEO sau khi đọc xong

Trả lời bằng tiếng Việt, ngắn gọn, súc tích. Dùng markdown với headings.

Nếu không có paper nào phù hợp, hãy gợi ý:
- Nên import thêm paper về chủ đề nào
- Hoặc nên bắt đầu đọc paper chưa đọc nào trước"""
            
            generation = state.generator.generate(
                query=daily_prompt,
                context_text=papers_context,
            )
            
            daily_suggestion = {
                "suggestion": generation.content,
                "model_used": generation.model_used,
            }
        
        # ── 5. Prioritized unread papers ──
        # Score papers by relevance: starred > has_summary > more pages > recent
        def paper_priority(p):
            score = 0
            if p.starred:
                score += 100
            if p.auto_summary:
                score += 50
            # Boost papers with user's interest tags
            try:
                paper_tags = _json.loads(p.tags or "[]")
                overlap = len(set(paper_tags) & set(top_interests))
                score += overlap * 30
            except Exception:
                pass
            # Prefer shorter papers for daily reading
            pages = p.page_count or 10
            if pages < 10:
                score += 20
            elif pages < 20:
                score += 10
            return score
        
        prioritized_unread = sorted(unread_papers, key=paper_priority, reverse=True)
        
        unread_list = []
        for p in prioritized_unread[:10]:
            tags = []
            try:
                tags = _json.loads(p.tags or "[]")
            except Exception:
                pass
            unread_list.append({
                "paper_id": p.id,
                "title": p.title or p.filename,
                "authors": "",
                "year": p.year,
                "pages": p.page_count or 0,
                "tags": tags,
                "starred": bool(p.starred),
                "has_summary": bool(p.auto_summary),
            })
            try:
                authors = _json.loads(p.authors or "[]")
                if isinstance(authors, list):
                    unread_list[-1]["authors"] = ", ".join(authors[:3])
            except Exception:
                pass
        
        # ── 6. Reading streak ──
        today = datetime.today().date()
        streak = 0
        for days_back in range(30):
            check_date = today - timedelta(days=days_back)
            day_start = datetime.combine(check_date, time.min)
            day_end = datetime.combine(check_date, time.max)
            has_activity = session.query(ChatHistory).filter(
                ChatHistory.created_at >= day_start,
                ChatHistory.created_at <= day_end
            ).count() > 0
            if has_activity:
                if days_back == streak:
                    streak += 1
                else:
                    break
            elif days_back > 0:
                break
        
        return {
            "daily_suggestion": daily_suggestion,
            "unread_papers": unread_list,
            "reading_streak": streak,
            "stats": {
                "total": len(all_papers),
                "unread": len(unread_papers),
                "reading": len(reading_papers),
                "read": len(read_papers),
            },
        }
    finally:
        session.close()


# ─── Zotero Auto-Detect ────────────────────────────────────────

@app.get("/api/zotero/detect")
async def detect_zotero_data_dir():
    """
    Auto-detect Zotero data directory on Windows.
    
    Detection strategy:
    1. Read prefs.js in Zotero profile dir → look for "extensions.zotero.dataDir"
    2. Parse profiles.ini to find active profile, then read prefs.js
    3. Fallback to default: %USERPROFILE%/Zotero
    
    Returns:
    {
        "found": bool,
        "path": str or null,
        "method": str ("prefs_js" / "default" / "not_found"),
        "has_storage": bool,
        "message": str,
    }
    """
    import configparser
    import os

    detected_path = None
    method = "not_found"

    if os.name != "nt":
        return {
            "found": False,
            "path": None,
            "method": "unsupported_os",
            "has_storage": False,
            "message": "Auto-detect chỉ hỗ trợ Windows.",
        }

    appdata = os.environ.get("APPDATA", "")
    userprofile = os.environ.get("USERPROFILE", "")

    if not appdata and userprofile:
        appdata = str(Path(userprofile) / "AppData" / "Roaming")

    # Zotero profile directories to check (Zotero 6 vs 7+)
    candidates = [
        Path(appdata) / "Zotero",                     # Zotero 6
        Path(appdata) / "Zotero" / "Zotero",         # Zotero 7+
    ]

    for profiles_dir in candidates:
        if not profiles_dir.exists():
            continue

        # Step 1: Parse profiles.ini to find the active profile dir
        profile_dirs_to_check = []
        profiles_ini = profiles_dir / "profiles.ini"
        if profiles_ini.exists():
            try:
                ini = configparser.ConfigParser()
                ini.read(str(profiles_ini))

                # Find the default profile name from [General]
                default_profile = ini.get("General", "Default", fallback=None)

                # Iterate profile sections [Profile0], [Profile1], ...
                for section in ini.sections():
                    if not section.startswith("Profile"):
                        continue
                    profile_name = ini.get(section, "Name", fallback=None)
                    profile_path = ini.get(section, "Path", fallback=None)
                    is_relative = ini.get(section, "IsRelative", fallback="1")
                    is_default = ini.get(section, "Default", fallback="0")

                    if not profile_path:
                        continue

                    # Check if this is the default profile
                    if default_profile and profile_name != default_profile and is_default != "1":
                        continue

                    # Resolve the profile directory
                    if is_relative == "1":
                        profile_dir = profiles_dir / profile_path
                    else:
                        profile_dir = Path(profile_path)

                    if profile_dir.exists():
                        profile_dirs_to_check.append(profile_dir)

            except Exception:
                pass

        # Step 2: Also check all subdirectories for prefs.js directly
        if not profile_dirs_to_check:
            for item in profiles_dir.iterdir():
                if item.is_dir() and (item / "prefs.js").exists():
                    profile_dirs_to_check.append(item)

        # Step 3: Read prefs.js in each profile dir for extensions.zotero.dataDir
        for profile_dir in profile_dirs_to_check:
            prefs_js = profile_dir / "prefs.js"
            if not prefs_js.exists():
                continue
            try:
                content = prefs_js.read_text(encoding="utf-8")
                match = re.search(
                    r'user_pref\s*\(\s*"extensions\.zotero\.dataDir"\s*,\s*"([^"]+)"\s*\)',
                    content,
                )
                if match:
                    detected_path = match.group(1)
                    method = "prefs_js"
                    break
            except Exception:
                pass

        if detected_path:
            break

    # Fallback: Check default Zotero data directory
    if not detected_path and userprofile:
        default_path = Path(userprofile) / "Zotero"
        if default_path.exists():
            detected_path = str(default_path)
            method = "default"

    if not detected_path:
        return {
            "found": False,
            "path": None,
            "method": "not_found",
            "has_storage": False,
            "message": "Không tìm thấy thư mục Zotero data. Vui lòng nhập thủ công.",
        }

    detected = Path(detected_path)
    has_storage = detected.exists() and (detected / "storage").exists()

    return {
        "found": True,
        "path": str(detected.resolve()),
        "method": method,
        "has_storage": has_storage,
        "message": f"Đã phát hiện thư mục Zotero: {detected_path}" if has_storage
        else f"Đã phát hiện thư mục Zotero ({detected_path}), nhưng không tìm thấy thư mục storage/",
    }


@app.post("/api/zotero/save-path")
async def save_zotero_path(body: dict):
    """
    Persist Zotero data directory path to settings so it doesn't need
    to be re-detected every time.
    """
    path = body.get("path", "")
    if not path or not path.strip():
        raise HTTPException(status_code=400, detail="Path is required")

    # Save to settings object
    settings.zotero_data_dir = path.strip()

    # Persist to DB
    session = get_session(state.engine)
    try:
        setting = session.query(Setting).filter(Setting.key == "zotero_data_dir").first()
        if setting:
            setting.value = path.strip()
        else:
            session.add(Setting(key="zotero_data_dir", value=path.strip()))
        session.commit()
        logger.info(f"Saved Zotero data dir to settings: {path}")
        return {"status": "saved", "path": path.strip()}
    except Exception as e:
        session.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        session.close()


# ─── Auto-Cite ──────────────────────────────────────────────

@app.post("/api/papers/cite")
async def generate_citations(body: dict):
    """
    Generate formatted academic citations for papers.
    Supports APA, IEEE, Vancouver, BibTeX, and HTML styles.
    """
    paper_ids = body.get("paper_ids", [])
    style = body.get("style", "apa")  # apa / ieee / vancouver

    if not paper_ids:
        return {"citations": [], "style": style, "message": "No paper IDs provided."}

    import json

    session = get_session(state.engine)
    try:
        citations = []
        for pid in paper_ids:
            paper = session.query(Paper).filter(Paper.id == pid).first()
            if not paper:
                continue

            # Parse authors from JSON string
            try:
                authors_list = json.loads(paper.authors) if paper.authors else []
            except (json.JSONDecodeError, TypeError):
                authors_list = [a.strip() for a in paper.authors.split(",")] if paper.authors else ["Unknown"]

            title = paper.title or paper.filename.replace(".pdf", "").replace("_", " ")
            year = paper.year or "n.d."
            doi = paper.doi or ""
            pages = paper.page_count

            # Format citation based on style
            if style == "apa":
                # APA 7th Edition format
                if len(authors_list) == 0:
                    author_str = "Unknown"
                elif len(authors_list) == 1:
                    author_str = authors_list[0]
                elif len(authors_list) == 2:
                    author_str = f"{authors_list[0]} & {authors_list[1]}"
                elif len(authors_list) <= 20:
                    author_str = ", ".join(authors_list[:-1]) + f", & {authors_list[-1]}"
                else:
                    author_str = ", ".join(authors_list[:19]) + f", ... {authors_list[-1]}"

                formatted = f"{author_str} ({year}). *{title}*"
                if pages:
                    formatted += f" (pp. 1-{pages})"
                formatted += "."
                if doi:
                    formatted += f" https://doi.org/{doi}"

            elif style == "ieee":
                # IEEE format
                if len(authors_list) == 0:
                    author_str = "Unknown"
                elif len(authors_list) <= 3:
                    author_str = ", ".join(authors_list)
                else:
                    author_str = ", ".join(authors_list[:3]) + ", et al."

                formatted = f"{author_str}, \"{title}\", {year}"
                if pages:
                    formatted += f", pp. 1-{pages}"
                formatted += "."
                if doi:
                    formatted += f" doi: {doi}."

            elif style == "vancouver":
                # Vancouver format
                if len(authors_list) == 0:
                    author_str = "Unknown"
                elif len(authors_list) <= 6:
                    author_str = ", ".join(authors_list)
                else:
                    author_str = ", ".join(authors_list[:6]) + ", et al."

                formatted = f"{author_str}. {title}. {year}"
                if pages:
                    formatted += f"; 1-{pages}"
                formatted += "."
                if doi:
                    formatted += f" doi: {doi}."

            elif style == "bibtex":
                # BibTeX format — generate a @article{...} entry
                # Generate citation key: first_author_lastname + year
                if len(authors_list) > 0:
                    first_author = authors_list[0]
                    if ", " in first_author:
                        last_name = first_author.split(",")[0].strip()
                    else:
                        parts = first_author.strip().split()
                        last_name = parts[-1] if parts else "unknown"
                    cite_key = re.sub(r'[^a-zA-Z0-9_]', '', last_name.lower())[:20]
                else:
                    cite_key = "unknown"
                year_bib = str(year) if year != "n.d." else "n.d."
                if year_bib != "n.d.":
                    cite_key += year_bib

                # Format authors as "Last, First and Last, First"
                bibtex_authors = []
                for a in authors_list:
                    a = a.strip()
                    if ", " in a:
                        bibtex_authors.append(a)
                    else:
                        parts = a.rsplit(" ", 1)
                        if len(parts) == 2:
                            bibtex_authors.append(f"{parts[1]}, {parts[0]}")
                        else:
                            bibtex_authors.append(a)
                author_str_bib = " and ".join(bibtex_authors)

                # Build BibTeX entry
                formatted = f"@article{{{cite_key},\n"
                if author_str_bib:
                    formatted += f"  author = {{{author_str_bib}}},\n"
                formatted += f"  title = {{{title}}},\n"
                formatted += f"  year = {{{year_bib}}},\n"
                if doi:
                    formatted += f"  doi = {{{doi}}},\n"
                if pages:
                    formatted += f"  pages = {{1--{pages}}},\n"
                formatted += "}"

            elif style == "html":
                # HTML format — build a full HTML page for the bibliography
                # We'll collect all entries and produce a single HTML document at the end
                # For each citation, build the entry HTML
                year_str = str(year) if year != "n.d." else "n.d."
                doi_str = doi if doi else ""
                pages_str = f"pp. 1–{pages}" if pages else ""

                # Build author string for display
                if len(authors_list) == 0:
                    author_display = "Unknown"
                elif len(authors_list) <= 3:
                    author_display = ", ".join(authors_list)
                else:
                    author_display = ", ".join(authors_list[:3]) + " et al."

                # HTML for each citation (numbered, clean academic style)
                entry_html_lines = []
                entry_html_lines.append(f'<div class="cite-entry">')
                entry_html_lines.append(f'  <span class="cite-num">[{len(citations) + 1}]</span>')
                entry_html_lines.append(f'  <div class="cite-body">')
                entry_html_lines.append(f'    <span class="cite-authors">{_escape_html(author_display)}</span>')
                entry_html_lines.append(f'    <span class="cite-title">{_escape_html(title)}</span>')
                entry_html_lines.append(f'    <span class="cite-year">({year_str})</span>')
                if pages_str:
                    entry_html_lines.append(f'    <span class="cite-pages">{pages_str}</span>')
                if doi_str:
                    entry_html_lines.append(f'    <span class="cite-doi">DOI: <a href="https://doi.org/{_escape_html(doi_str)}" target="_blank">{_escape_html(doi_str)}</a></span>')
                entry_html_lines.append(f'  </div>')
                entry_html_lines.append(f'</div>')
                formatted = "\n".join(entry_html_lines)

            else:
                # Vancouver format (default fallback)
                if len(authors_list) == 0:
                    author_str = "Unknown"
                elif len(authors_list) <= 6:
                    author_str = ", ".join(authors_list)
                else:
                    author_str = ", ".join(authors_list[:6]) + ", et al."

                formatted = f"{author_str}. {title}. {year}"
                if pages:
                    formatted += f"; 1-{pages}"
                formatted += "."
                if doi:
                    formatted += f" doi: {doi}."

            citations.append({
                "paper_id": paper.id,
                "title": title,
                "authors": authors_list,
                "year": year,
                "doi": doi,
                "pages": pages,
                "formatted": formatted,
                "style": style,
            })

        # Generate bibliography block
        if style == "html":
            # Wrap individual entries in a full HTML document
            entries = "\n".join([c["formatted"] for c in citations])
            today = datetime.now().strftime("%Y-%m-%d %H:%M")
            bibliography = f"""<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Bibliography — ResearchMind VN</title>
<style>
  * {{ margin: 0; padding: 0; box-sizing: border-box; }}
  body {{ font-family: 'Georgia', 'Times New Roman', serif; font-size: 12pt; line-height: 1.6; color: #1a1a1a; background: #fff; padding: 40px; max-width: 800px; margin: 0 auto; }}
  h1 {{ font-size: 22pt; font-weight: 700; color: #111; border-bottom: 2px solid #6366f1; padding-bottom: 10px; margin-bottom: 24px; }}
  .cite-entry {{ display: flex; gap: 12px; padding: 12px 0; border-bottom: 1px solid #e5e7eb; }}
  .cite-entry:last-child {{ border-bottom: none; }}
  .cite-num {{ font-size: 10pt; font-weight: 700; color: #6366f1; min-width: 32px; text-align: right; flex-shrink: 0; padding-top: 2px; }}
  .cite-body {{ flex: 1; display: flex; flex-direction: column; gap: 2px; }}
  .cite-authors {{ font-weight: 600; font-size: 11pt; color: #111; }}
  .cite-title {{ font-style: italic; font-size: 11pt; color: #333; }}
  .cite-year {{ font-size: 10pt; color: #666; }}
  .cite-pages {{ font-size: 10pt; color: #666; }}
  .cite-doi {{ font-size: 9pt; }}
  .cite-doi a {{ color: #6366f1; text-decoration: none; }}
  .cite-doi a:hover {{ text-decoration: underline; }}
  .footer {{ margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 9pt; color: #999; text-align: center; }}
  @media print {{ body {{ padding: 20px; }} h1 {{ font-size: 18pt; }} .cite-entry {{ break-inside: avoid; }} }}
</style>
</head>
<body>
<h1>Bibliography</h1>
{entries}
<div class="footer">
  Generated by ResearchMind VN on {today} — {len(citations)} citation(s)
</div>
</body>
</html>"""
        else:
            bibliography = "\n\n".join([c["formatted"] for c in citations])

        return {
            "citations": citations,
            "bibliography": bibliography,
            "style": style,
            "count": len(citations),
        }
    finally:
        session.close()


# ─── Auto-Highlight ────────────────────────────────────────────

@app.get("/api/papers/{paper_id}/highlights")
async def get_paper_highlights(paper_id: str, limit: int = Query(10)):
    """
    AI identifies and returns the most important passages in a paper.
    Uses RAG to retrieve all chunks, then LLM picks the highlights.
    """
    session = get_session(state.engine)
    try:
        paper = session.query(Paper).filter(Paper.id == paper_id).first()
        if not paper:
            raise HTTPException(status_code=404, detail="Paper not found")

        # Retrieve chunks from this specific paper
        retrieval = await asyncio.to_thread(
            state.retriever.retrieve,
            query="key findings methodology results conclusion abstract introduction important contributions novel results findings limitations weaknesses",
            paper_ids=[paper_id],
            top_k=20,
        )

        if not retrieval.context_text.strip():
            return {
                "highlights": [],
                "paper_id": paper_id,
                "message": "Paper chưa được index đầy đủ để tạo highlights.",
            }

        highlight_prompt = f"""Bạn là một trợ lý nghiên cứu. Hãy đọc kỹ toàn bộ nội dung paper sau và xác định {limit} đoạn quan trọng nhất.

Đối với mỗi đoạn quan trọng, hãy trả về JSON array với cấu trúc:
[
  {{
    "category": "key_finding" | "methodology" | "conclusion" | "novel_contribution" | "limitation" | "important_claim",
    "text": "đoạn trích nguyên văn (tối đa 200 ký tự)",
    "page_hint": số trang nếu biết (hoặc null),
    "importance": "high" | "medium",
    "note": "giải thích ngắn gọn tại sao đoạn này quan trọng"
  }}
]

Phân loại:
- key_finding: Kết quả nghiên cứu chính
- methodology: Phương pháp quan trọng
- conclusion: Kết luận then chốt
- novel_contribution: Đóng góp mới / sáng kiến
- limitation: Hạn chế được thảo luận
- important_claim: Khái niệm/quan điểm quan trọng

CHỈ trả về JSON array, không thêm text khác. Trả lời bằng tiếng Việt.

Nội dung paper:\n{retrieval.context_text}"""

        generation = await asyncio.to_thread(
            state.generator.generate,
            query=highlight_prompt,
            context_text=retrieval.context_text,
        )

        # Parse JSON from LLM response
        import json as _json
        highlights = []
        try:
            # Try to extract JSON array from response
            content = generation.content.strip()
            # Strip markdown code fences if present (common LLM output format)
            if content.startswith("```"):
                content = content.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
            # Find the first [ and last ]
            start = content.find('[')
            end = content.rfind(']')
            if start != -1 and end != -1:
                json_str = content[start:end + 1]
                highlights = _json.loads(json_str)
            else:
                highlights = []
        except Exception as parse_err:
            logger.warning(f"Failed to parse highlights JSON: {parse_err}")
            highlights = []

        return {
            "highlights": highlights[:limit],
            "paper_id": paper_id,
            "paper_title": paper.title,
        }
    finally:
        session.close()


# ─── Migration ────────────────────────────────────────────────

def _migrate_auto_summary(engine):
    """Add auto_summary column to papers table if it doesn't exist."""
    from sqlalchemy import text
    try:
        with engine.connect() as conn:
            # Check if column exists
            result = conn.execute(text(
                "PRAGMA table_info(papers)"
            ))
            columns = [row[1] for row in result.fetchall()]
            if "auto_summary" not in columns:
                conn.execute(text("ALTER TABLE papers ADD COLUMN auto_summary TEXT DEFAULT ''"))
                conn.commit()
                logger.info("Migration: Added auto_summary column to papers table")
    except Exception as e:
        logger.warning(f"Migration auto_summary skipped (may already exist): {e}")


# ─── Helpers ─────────────────────────────────────────────────────

def _paper_to_dict(paper) -> dict:
    """Convert a Paper ORM object to a dictionary."""
    return {
        "id": paper.id,
        "filename": paper.filename,
        "title": paper.title,
        "authors": paper.authors,
        "year": paper.year,
        "doi": paper.doi,
        "page_count": paper.page_count,
        "file_size": paper.file_size,
        "language": paper.language,
        "status": paper.status,
        "tags": paper.tags,
        "notes": paper.notes,
        "auto_summary": getattr(paper, "auto_summary", ""),
        "read_status": paper.read_status,
        "starred": bool(paper.starred),
        "created_at": str(paper.created_at) if paper.created_at else None,
        "indexed_at": str(paper.indexed_at) if paper.indexed_at else None,
    }


# ─── Main ────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=settings.host,
        port=settings.port,
        reload=True,
        log_level="info",
    )
