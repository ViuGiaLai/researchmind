"""ResearchMind VN — FastAPI Backend

Trợ lý nghiên cứu AI — Local-first, tiếng Việt.

Routes are organized into routers/:
- routers/papers.py   Paper CRUD + Import + Citation + Highlights
- routers/search.py   Hybrid search + suggestions
- routers/chat.py     Chat + Review + Critique + Debate + History
- routers/insights.py Gap + Conflict + Topic + Evolution analysis
- routers/settings.py Settings + Validate Key + Ollama management
- routers/system.py   Health + Stats + Specs + Data management + Zotero
- routers/personal.py Personalized Knowledge Brain + Daily Reader
"""

import os
os.environ["HF_HUB_DISABLE_SYMLINKS_WARNING"] = "1"
os.environ["OPENBLAS_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["ANONYMIZED_TELEMETRY"] = "False"

import sys
import threading
from pathlib import Path

# Add backend directory to path for imports
backend_dir = Path(__file__).parent
sys.path.insert(0, str(backend_dir))

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
from loguru import logger

from app_state import state
from config.settings import settings
from db.database import get_engine, get_session
from db.models import Base, Paper, Setting
from ingestion.embedder import get_embedder
from search.bm25 import BM25Search
from search.vector import VectorSearch
from search.hybrid import HybridSearch
from chat.retriever import Retriever
from chat.generator import Generator

from export import router as export_router
from zotero_import import router as zotero_import_router

from routers.papers import router as papers_router
from routers.search import router as search_router
from routers.chat import router as chat_router
from routers.insights import router as insights_router
from routers.settings import router as settings_router
from routers.system import router as system_router
from routers.personal import router as personal_router
from routers.verify import router as verify_router
from routers.academic import router as academic_router


# ─── Lifespan ────────────────────────────────────────────────────

def load_persisted_settings():
    """Load settings from SQLite database on startup.

    Only loads UI/preference settings, NOT connection/security settings
    which should always come from .env file.
    """
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


def _migrate_auto_summary(engine):
    """Add auto_summary column to papers table if it doesn't exist."""
    from sqlalchemy import text
    try:
        with engine.connect() as conn:
            result = conn.execute(text("PRAGMA table_info(papers)"))
            columns = [row[1] for row in result.fetchall()]
            if "auto_summary" not in columns:
                conn.execute(text("ALTER TABLE papers ADD COLUMN auto_summary TEXT DEFAULT ''"))
                conn.commit()
                logger.info("Migration: Added auto_summary column to papers table")
    except Exception as e:
        logger.warning(f"Migration auto_summary skipped (may already exist): {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize app state on startup, cleanup on shutdown."""
    logger.info("Starting ResearchMind VN backend...")

    settings.data_dir.mkdir(parents=True, exist_ok=True)
    settings.papers_dir.mkdir(parents=True, exist_ok=True)
    settings.chroma_dir.mkdir(parents=True, exist_ok=True)

    state.engine = get_engine(settings.db_path)
    Base.metadata.create_all(state.engine)

    _migrate_auto_summary(state.engine)

    logger.info("Database initialized")

    load_persisted_settings()

    state.embedder = get_embedder(settings.embedding_model)
    state.init_message = "Đang tải mô hình AI..."

    def _warmup_embedder():
        try:
            logger.info(f"Warming up embedding model: {settings.embedding_model}")
            state.embedder._load_model()
            state.embedder_ready = True
            state.init_message = "Sẵn sàng"
            logger.info("Embedding model ready")
        except Exception as e:
            logger.error(f"Failed to load embedding model: {e}")
            state.embedder_ready = True
            state.init_message = "Sẵn sàng (model lỗi)"

    threading.Thread(target=_warmup_embedder, daemon=True).start()

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

    def _warmup_cross_encoder():
        try:
            logger.info("Warming up cross-encoder model...")
            state.hybrid._get_cross_encoder()
            logger.info("Cross-encoder model ready")
        except Exception as e:
            logger.error(f"Failed to load cross-encoder: {e}")

    threading.Thread(target=_warmup_cross_encoder, daemon=True).start()

    app.state.engine = state.engine

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
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Register Routers ────────────────────────────────────────────

app.include_router(export_router)
app.include_router(zotero_import_router)
app.include_router(papers_router)
app.include_router(search_router)
app.include_router(chat_router)
app.include_router(insights_router)
app.include_router(settings_router)
app.include_router(system_router)
app.include_router(personal_router)
app.include_router(verify_router)
app.include_router(academic_router)


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
