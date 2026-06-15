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

import sys
from pathlib import Path

# Add backend directory to path for imports
backend_dir = Path(__file__).parent
sys.path.insert(0, str(backend_dir))

from fastapi import FastAPI, UploadFile, File, BackgroundTasks, HTTPException, Query, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from contextlib import asynccontextmanager
from loguru import logger
import shutil
import uuid

from config.settings import settings
from db.database import get_engine, get_session
from db.models import Base, Paper, Chunk, ChatHistory, Setting
from ingestion.parser import extract_pdf
from ingestion.chunker import chunk_text
from ingestion.embedder import get_embedder
from search.bm25 import BM25Search
from search.vector import VectorSearch
from search.hybrid import HybridSearch
from chat.retriever import Retriever
from chat.generator import Generator


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

state = AppState()


# ─── Lifespan ────────────────────────────────────────────────────

def load_persisted_settings():
    """Load settings from SQLite database on startup."""
    session = get_session(state.engine)
    try:
        db_settings = session.query(Setting).all()
        for s in db_settings:
            if hasattr(settings, s.key):
                default_val = getattr(settings, s.key)
                if isinstance(default_val, int):
                    setattr(settings, s.key, int(s.value))
                elif isinstance(default_val, float):
                    setattr(settings, s.key, float(s.value))
                elif isinstance(default_val, bool):
                    setattr(settings, s.key, s.value.lower() in ("true", "1", "yes"))
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
    logger.info("Database initialized")

    # Load persisted settings from DB
    load_persisted_settings()

    # Embedder (lazy-loaded, just init placeholder)
    state.embedder = get_embedder(settings.embedding_model)

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
        mode=settings.llm_mode,
        custom_cloud_provider=settings.custom_cloud_provider,
    )
    logger.info("RAG pipeline initialized")

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
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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
async def import_pdf(
    file: UploadFile = File(...),
    background_tasks: BackgroundTasks = None,
):
    """Import a single PDF file."""
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")

    # Save uploaded file
    file_id = str(uuid.uuid4())
    save_path = settings.papers_dir / f"{file_id}_{file.filename}"

    with open(save_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    # Extract text
    doc = extract_pdf(str(save_path))
    if doc is None:
        raise HTTPException(status_code=400, detail=f"Cannot parse PDF: {file.filename}")

    # Save paper metadata
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

    # Chunk, embed, store (in background)
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
    """Import all PDFs from a folder."""
    folder = Path(folder_path)
    if not folder.exists() or not folder.is_dir():
        raise HTTPException(status_code=400, detail=f"Folder not found: {folder_path}")

    pdf_files = list(folder.glob("*.pdf")) + list(folder.glob("*.PDF"))
    if not pdf_files:
        raise HTTPException(status_code=400, detail="No PDF files found in the folder")

    import_results = []
    for pdf_file in pdf_files:
        try:
            doc = extract_pdf(str(pdf_file))
            if doc is None:
                import_results.append({
                    "filename": pdf_file.name,
                    "status": "failed",
                    "error": "Cannot parse PDF",
                })
                continue

            file_id = str(uuid.uuid4())
            save_path = settings.papers_dir / f"{file_id}_{pdf_file.name}"
            shutil.copy2(str(pdf_file), str(save_path))

            session = get_session(state.engine)
            try:
                paper = Paper(
                    id=file_id,
                    filename=pdf_file.name,
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
                    "filename": pdf_file.name,
                    "status": "failed",
                    "error": str(e),
                })
                continue
            finally:
                session.close()

            background_tasks.add_task(_index_paper, file_id, doc)
            import_results.append({
                "filename": pdf_file.name,
                "status": "indexing",
                "paper_id": file_id,
                "pages": doc.page_count,
            })

        except Exception as e:
            import_results.append({
                "filename": pdf_file.name,
                "status": "error",
                "error": str(e),
            })

    return {
        "total": len(pdf_files),
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
            "indexed_at": "datetime('now')",
        })
        session.commit()

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


# ─── Search ──────────────────────────────────────────────────────

@app.post("/api/search")
async def search(query: dict = Body(...)):
    """Hybrid search across all indexed PDFs."""
    text = query.get("text", "")
    paper_ids = query.get("paper_ids")
    top_k = query.get("top_k", 10)

    if not text.strip():
        raise HTTPException(status_code=400, detail="Query text is required")

    results = state.hybrid.search(
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

from datetime import datetime, time

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

    # Retrieve relevant context
    retrieval = state.retriever.retrieve(
        query=message,
        paper_ids=paper_ids,
        top_k=5,
    )

    if stream:
        return StreamingResponse(
            _stream_chat(message, retrieval.context_text, session_id, paper_ids),
            media_type="text/event-stream",
        )

    # Generate response
    generation = state.generator.generate(
        query=message,
        context_text=retrieval.context_text,
    )

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
        "custom_cloud_provider": settings.custom_cloud_provider,
        "model_tier_weak": settings.model_tier_weak,
        "model_tier_medium": settings.model_tier_medium,
        "model_tier_strong": settings.model_tier_strong,
        "chunk_size": settings.chunk_size,
        "chunk_overlap": settings.chunk_overlap,
        "top_k_retrieval": settings.top_k_retrieval,
        "embedding_model": settings.embedding_model,
        "setup_completed": settings.setup_completed,
    }


@app.put("/api/settings")
async def update_settings(new_settings: dict = Body(...)):
    """Update settings."""
    session = get_session(state.engine)
    try:
        for key, value in new_settings.items():
            if hasattr(settings, key):
                # Do not overwrite keys if sent as mask
                if key in ("claude_api_key", "deepseek_api_key", "gemini_api_key") and value == "***":
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
async def open_data_folder():
    """Open the local data folder in file explorer."""
    import subprocess
    import os
    try:
        path = str(settings.data_dir)
        settings.data_dir.mkdir(parents=True, exist_ok=True)
        if os.name == "nt":
            os.startfile(path)
        elif os.name == "posix":
            subprocess.Popen(["xdg-open", path])
        else:
            subprocess.Popen(["open", path])
        return {"success": True, "message": "Đã mở thư mục dữ liệu."}
    except Exception as e:
        logger.error(f"Failed to open data folder: {e}")
        raise HTTPException(status_code=500, detail=f"Không thể mở thư mục: {str(e)}")


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
            
        # Re-initialize BM25 search
        state.bm25 = BM25Search(get_session(state.engine))
        
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
            vector_db = VectorSearch(settings.chroma_dir)
            vector_db.clear_collection()
        except Exception as e:
            logger.warning(f"ChromaDB collection clear failed: {e}")

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
        db_session.close()
        
        logger.info("Application reset successfully")
        return {"success": True, "message": "Đã reset ứng dụng về trạng thái ban đầu thành công."}
    except Exception as e:
        logger.error(f"Failed to reset app: {e}")
        raise HTTPException(status_code=500, detail=str(e))


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
