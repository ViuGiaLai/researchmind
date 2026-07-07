"""ResearchMind VN — FastAPI Backend

Trợ lý nghiên cứu AI — Local-first, tiếng Việt.

Routes are organized into routers/:
- routers/papers.py   Paper CRUD + Import + Citation + Highlights
- routers/search.py   Hybrid search + suggestions
- routers/chat.py     Chat + Review + Critique + Debate + History
- routers/insights.py Gap + Conflict + Topic + Evolution analysis
- routers/settings.py Settings + Validate Key + Local model management
- routers/system.py   Health + Stats + Specs + Data management + Zotero
- routers/personal.py Personalized Knowledge Brain + Daily Reader
- routers/review.py   Literature Review Builder (draft, section, matrix, export)
"""

import os
os.environ["HF_HUB_DISABLE_SYMLINKS_WARNING"] = "1"
os.environ["OPENBLAS_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["ANONYMIZED_TELEMETRY"] = "False"

import json
import sys
import threading
import time
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
from chat.patched_generator import PatchedGenerator as Generator

from export import router as export_router
from zotero_import import router as zotero_import_router

from routers.papers import router as papers_router, jobs_router, recover_interrupted_import_jobs
from routers.search import router as search_router
from routers.chat import router as chat_router
from routers.insights import router as insights_router
from routers.settings import router as settings_router
from routers.system import router as system_router
from routers.personal import router as personal_router
from routers.verify import router as verify_router
from routers.academic import router as academic_router
from routers.collections import router as collections_router
from routers.review import router as review_router
from routers.research import router as research_router
from graph.router import router as graph_router


# ─── Lifespan ────────────────────────────────────────────────────

def load_persisted_settings():
    """Load settings from SQLite database on startup.

    Only loads UI/preference settings, NOT connection/security settings
    which should always come from .env file.
    """
    env_only_keys = {
        "llama_server_url", "claude_api_key", "deepseek_api_key", "gemini_api_key",
        "groq_api_key", "github_api_key", "freemodel_api_key",
        "openrouter_api_key", "cohere_api_key", "cloudflare_api_key", "cerebras_api_key",
        "local_model", "claude_model", "deepseek_model", "gemini_model",
        "groq_model", "github_model", "freemodel_model",
        "openrouter_model", "cohere_model", "cloudflare_model", "cerebras_model",
    }

    session = get_session(state.engine)
    try:
        db_settings = session.query(Setting).all()
        for s in db_settings:
            if s.key in env_only_keys:
                continue
            if hasattr(settings, s.key):
                default_val = getattr(settings, s.key)
                if s.value is None or s.value == "None":
                    setattr(settings, s.key, None)
                elif isinstance(default_val, bool):
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
    """Add paper columns introduced after the initial SQLite schema."""
    from sqlalchemy import text
    try:
        with engine.connect() as conn:
            result = conn.execute(text("PRAGMA table_info(papers)"))
            columns = [row[1] for row in result.fetchall()]
            if "auto_summary" not in columns:
                conn.execute(text("ALTER TABLE papers ADD COLUMN auto_summary TEXT DEFAULT ''"))
                logger.info("Migration: Added auto_summary column to papers table")
            if "ocr_pages_count" not in columns:
                conn.execute(text("ALTER TABLE papers ADD COLUMN ocr_pages_count INTEGER DEFAULT 0"))
                logger.info("Migration: Added ocr_pages_count column to papers table")
            if "ocr_pages_failed" not in columns:
                conn.execute(text("ALTER TABLE papers ADD COLUMN ocr_pages_failed INTEGER DEFAULT 0"))
                logger.info("Migration: Added ocr_pages_failed column to papers table")
            if "is_scanned" not in columns:
                conn.execute(text("ALTER TABLE papers ADD COLUMN is_scanned INTEGER DEFAULT 0"))
                logger.info("Migration: Added is_scanned column to papers table")
            if "layout_stats" not in columns:
                conn.execute(text("ALTER TABLE papers ADD COLUMN layout_stats TEXT DEFAULT '{}'"))
                logger.info("Migration: Added layout_stats column to papers table")
            conn.commit()
    except Exception as e:
        logger.warning(f"Paper schema migration skipped (may already exist): {e}")


def _migrate_review_draft_versions(engine):
    """Add versions column to review_drafts table if missing."""
    from sqlalchemy import text
    try:
        with engine.connect() as conn:
            result = conn.execute(text("PRAGMA table_info(review_drafts)"))
            columns = [row[1] for row in result.fetchall()]
            if "versions" not in columns:
                conn.execute(text("ALTER TABLE review_drafts ADD COLUMN versions TEXT DEFAULT '[]'"))
                logger.info("Migration: Added versions column to review_drafts table")
                conn.commit()
    except Exception as e:
        logger.warning(f"ReviewDraft versions migration skipped: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize app state on startup, cleanup on shutdown."""
    startup_t0 = time.time()
    logger.info("Starting ResearchMind VN backend...")
    state.init_message = "Đang khởi động cơ sở dữ liệu..."

    settings.data_dir.mkdir(parents=True, exist_ok=True)
    settings.papers_dir.mkdir(parents=True, exist_ok=True)
    settings.chroma_dir.mkdir(parents=True, exist_ok=True)

    state.engine = get_engine(settings.db_path)
    Base.metadata.create_all(state.engine)

    _migrate_auto_summary(state.engine)
    _migrate_review_draft_versions(state.engine)

    logger.info("Database initialized")
    load_persisted_settings()
    app.state.engine = state.engine

    state.init_message = "Đang khởi tạo search & AI engine..."

    def _background_startup():
        try:
            state.embedder = get_embedder(settings.embedding_model)
            state.embedder_ready = True
            logger.info(f"Cloud embedding ready: {settings.embedding_model} (Gemini API)")

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

            def _warmup_reranker():
                if not settings.enable_reranker:
                    logger.info("BGE-Reranker warmup skipped (enable_reranker=false)")
                    return
                time.sleep(float(os.environ.get("RESEARCHMIND_RERANKER_WARMUP_DELAY", "10")))
                warmup_t0 = time.time()
                try:
                    logger.info(f"Warming up BGE-Reranker model: {settings.reranker_model}...")
                    reranker = state.hybrid._get_reranker()
                    if reranker is None:
                        logger.info("BGE-Reranker not available (optional — install sentence-transformers to enable)")
                    else:
                        logger.info(f"BGE-Reranker model ready in {time.time() - warmup_t0:.2f}s")
                except Exception as e:
                    logger.error(f"Failed to load BGE-Reranker: {e}")

            if os.environ.get("RESEARCHMIND_DISABLE_RERANKER_IDLE_WARMUP", "0").lower() not in ("1", "true", "yes"):
                threading.Thread(target=_warmup_reranker, daemon=True).start()

            state.retriever = Retriever(state.hybrid)
            state.generator = Generator(
                llama_server_url=settings.llama_server_url,
                local_model=settings.local_model,
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
                nvidia_deepseek_api_key=getattr(settings, "nvidia_deepseek_api_key", ""),
                nvidia_deepseek_model=getattr(settings, "nvidia_deepseek_model", "deepseek-ai/deepseek-v4-pro"),
                freemodel_api_key=settings.freemodel_api_key,
                freemodel_model=settings.freemodel_model,
                freemodel_url=getattr(settings, "freemodel_url", "https://freemodel.dev/v1"),
                github_api_key=settings.github_api_key,
                github_model=settings.github_model,
                github_url=getattr(settings, "github_url", "https://models.inference.ai.azure.com"),
                github_deepseek_v3_api_key=settings.github_deepseek_v3_api_key,
                github_deepseek_v3_model=settings.github_deepseek_v3_model,
                openrouter_api_key=settings.openrouter_api_key,
                openrouter_model=settings.openrouter_model,
                openrouter_url=getattr(settings, "openrouter_url", "https://openrouter.ai/api/v1"),
                openrouter_api_deep_key=settings.openrouter_api_deep_key,
                openrouter_deep_model=settings.openrouter_deep_model,
                openrouter_url_deep=getattr(settings, "openrouter_url_deep", "https://openrouter.ai/api/v1"),
                cohere_api_key=settings.cohere_api_key,
                cohere_model=settings.cohere_model,
                cohere_url=getattr(settings, "cohere_url", "https://api.cohere.ai/compatibility/v1"),
                cloudflare_api_key=settings.cloudflare_api_key,
                cloudflare_model=settings.cloudflare_model,
                cloudflare_url=getattr(settings, "cloudflare_url", "https://api.cloudflare.com/client/v4/accounts/adb9fb90009a849d8bc1635194a7dbd4/ai/v1"),
                cerebras_api_key=settings.cerebras_api_key,
                cerebras_model=settings.cerebras_model,
                cerebras_url=getattr(settings, "cerebras_url", "https://api.cerebras.net/v1"),
                mode=settings.llm_mode,
                task_provider_map=settings.task_provider_map,
                custom_cloud_provider=settings.custom_cloud_provider,
                local_max_tokens=settings.local_max_tokens,
                task_ultimate_fallback_chain=getattr(settings, "task_ultimate_fallback_chain", ""),
            )

            from graph.storage import GraphStore
            graph_path = settings.data_dir / "graph" / "knowledge_graph.json"
            state._graph_store = GraphStore(path=graph_path)
            state._graph_store.load()
            logger.info(f"Knowledge graph store initialized: {state._graph_store.graph.stats()}")

            logger.info("RAG pipeline initialized")
            recover_interrupted_import_jobs()
            state.backend_ready = True
            state.init_message = "Sẵn sàng"
            logger.info(f"PYTHON_STARTUP_TIMING ready_for_health={time.time() - startup_t0:.2f}s")

            import httpx
            try:
                resp = httpx.get(f"{settings.llama_server_url}/health", timeout=3.0)
                if resp.status_code == 200:
                    logger.info(f"llama-server ready at {settings.llama_server_url}")
            except Exception:
                logger.warning(f"llama-server not detected at {settings.llama_server_url}")
        except Exception as e:
            state.init_message = f"Lỗi khởi động backend: {e}"
            logger.exception("Background startup failed")

    threading.Thread(target=_background_startup, daemon=True).start()
    logger.info(f"PYTHON_STARTUP_TIMING http_ready={time.time() - startup_t0:.2f}s")

    yield

    state.engine.dispose()
    logger.info("Backend shutdown complete")


# ─── FastAPI app ─────────────────────────────────────────────────

app = FastAPI(
    title="ResearchMind VN",
    version="0.6.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
from fastapi.staticfiles import StaticFiles

app.mount("/static/papers", StaticFiles(directory=settings.papers_dir), name="papers")


# ─── Register Routers ────────────────────────────────────────────

app.include_router(export_router)
app.include_router(zotero_import_router)
app.include_router(papers_router)
app.include_router(jobs_router)
app.include_router(search_router)
app.include_router(chat_router)
app.include_router(insights_router)
app.include_router(settings_router)
app.include_router(system_router)
app.include_router(personal_router)
app.include_router(verify_router)
app.include_router(academic_router)
app.include_router(collections_router)
app.include_router(review_router)
app.include_router(research_router)
app.include_router(graph_router)


# ─── Global Exception Handler ────────────────────────────────────

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Catch-all exception handler to ensure CORS headers are returned on 500 errors."""
    logger.exception(f"Unhandled exception occurred: {exc}")
    from starlette.responses import Response
    return Response(
        status_code=500,
        content=json.dumps({
            "detail": "Internal Server Error",
            "type": exc.__class__.__name__,
        }),
        media_type="application/json",
        headers={"Access-Control-Allow-Origin": "*"},
    )


# ─── Main ────────────────────────────────────────────────────────

if __name__ == "__main__":
    import sys
    import uvicorn
    # Khi chạy bằng PyInstaller (.exe), sys.frozen = True
    is_frozen = getattr(sys, "frozen", False)
    if is_frozen:
        # PyInstaller: truyền trực tiếp object app và reload=False để tránh lỗi import động
        uvicorn.run(
            app,
            host=settings.host,
            port=settings.port,
            log_level="info",
        )
    else:
        # Development: truyền chuỗi "main:app" để reload hoạt động khi sửa code
        uvicorn.run(
            "main:app",
            host=settings.host,
            port=settings.port,
            reload=True,
            log_level="info",
        )