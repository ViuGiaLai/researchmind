"""ResearchMind VN — FastAPI Backend

ResearchMind AI Research Assistant — Local-first.

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

import asyncio
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
from common.i18n import get_language, set_request_language, t
from common.firebase_auth import FirebaseAuthError, ensure_firebase_ready, verify_id_token
from common.secret_store import SecretStorageError, get_secret, set_secret
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
from routers.auth import router as auth_router
from routers.license import router as license_router
from routers.license import get_license_status
from routers.workspace import router as workspace_router
from db.migrations import run_migrations
from graph.router import router as graph_router


# ─── Lifespan ────────────────────────────────────────────────────

def load_persisted_settings():
    """Load settings from SQLite database on startup.

    API keys entered by a desktop user are kept in that user's local data
    database so a shipped build never needs to contain provider credentials.
    Deployment-only connection settings continue to come from environment.
    """
    env_only_keys = {
        "llama_server_url", "local_model", "claude_model", "deepseek_model", "gemini_model",
        "groq_model", "github_model", "freemodel_model",
        "openrouter_model", "cohere_model", "cloudflare_model", "cerebras_model",
    }

    session = get_session(state.engine)
    try:
        db_settings = session.query(Setting).all()
        migrated_secrets = False
        for s in db_settings:
            if s.key.endswith("_api_key"):
                if s.value and s.value not in {"***", "None"}:
                    try:
                        set_secret(s.key, s.value)
                        setattr(settings, s.key, s.value)
                        session.delete(s)
                        migrated_secrets = True
                    except SecretStorageError as exc:
                        logger.error(f"Could not migrate {s.key} to the OS credential store: {exc}")
                continue
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

        for key in settings.__class__.model_fields:
            if not key.endswith("_api_key"):
                continue
            try:
                secret = get_secret(key)
            except SecretStorageError:
                break
            if secret:
                setattr(settings, key, secret)
        if migrated_secrets:
            session.commit()
        logger.info("Loaded persisted settings and OS-protected secrets successfully")
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
            if "auto_summary_lang" not in columns:
                conn.execute(text("ALTER TABLE papers ADD COLUMN auto_summary_lang TEXT DEFAULT ''"))
                logger.info("Migration: Added auto_summary_lang column to papers table")
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
    if settings.firebase_auth_enabled:
        await asyncio.to_thread(ensure_firebase_ready)
        logger.info("Firebase Authentication enabled for hosted API")
    state.init_message = t("startup.init_db", "vi")

    settings.data_dir.mkdir(parents=True, exist_ok=True)
    settings.papers_dir.mkdir(parents=True, exist_ok=True)
    settings.chroma_dir.mkdir(parents=True, exist_ok=True)

    pending_restore = settings.db_path.parent / ".restore-pending.db"
    if pending_restore.is_file():
        settings.db_path.parent.mkdir(parents=True, exist_ok=True)
        os.replace(pending_restore, settings.db_path)
        logger.info("Queued database restore applied")

    state.engine = get_engine(settings.db_path)
    Base.metadata.create_all(state.engine)
    run_migrations(state.engine)

    _migrate_auto_summary(state.engine)
    _migrate_review_draft_versions(state.engine)

    logger.info("Database initialized")
    load_persisted_settings()
    app.state.engine = state.engine

    state.init_message = t("startup.init_search", "vi")

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
            state.init_message = t("startup.ready", "vi")
            logger.info(f"PYTHON_STARTUP_TIMING ready_for_health={time.time() - startup_t0:.2f}s")

            import httpx
            try:
                resp = httpx.get(f"{settings.llama_server_url}/health", timeout=3.0)
                if resp.status_code == 200:
                    logger.info(f"llama-server ready at {settings.llama_server_url}")
            except Exception:
                logger.warning(f"llama-server not detected at {settings.llama_server_url}")
        except Exception as e:
            state.init_message = t("startup.failed", "vi", error=str(e))
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

cors_origins = [
    origin.strip()
    for origin in os.getenv(
        "RESEARCHMIND_CORS_ORIGINS",
        "tauri://localhost,http://tauri.localhost,http://localhost:1420,http://127.0.0.1:1420,http://localhost:5173,http://127.0.0.1:5173",
    ).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

# The Render disk can be empty when the process is imported. The directory is
# created in the lifespan hook before any request is served.
app.mount("/static/papers", StaticFiles(directory=settings.papers_dir, check_dir=False), name="papers")


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
app.include_router(auth_router)
app.include_router(license_router)
app.include_router(graph_router)
app.include_router(workspace_router)

# Serve React frontend (SPA) — hỗ trợ share qua ngrok
frontend_dist = Path(__file__).resolve().parent.parent / "apps" / "desktop" / "dist"
if frontend_dist.exists():
    app.mount("/assets", StaticFiles(directory=str(frontend_dist / "assets")), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_frontend(full_path: str):
        file_path = frontend_dist / full_path
        if file_path.is_file():
            return FileResponse(str(file_path))
        return FileResponse(str(frontend_dist / "index.html"))
    logger.info("Frontend SPA mounted — share web ready")


# ─── Global Exception Handler ────────────────────────────────────

@app.middleware("http")
async def language_middleware(request: Request, call_next):
    lang = get_language(request)
    request.state.lang = lang
    set_request_language(lang)
    response = await call_next(request)
    return response


@app.middleware("http")
async def commercial_entitlement_middleware(request: Request, call_next):
    """Gate paid capabilities while leaving local library/search available."""
    premium_prefixes = (
        "/api/chat",
        "/api/review",
        "/api/export",
        "/api/graph",
        "/api/research",
        "/api/insights",
        "/api/verify",
    )
    if request.url.path.startswith(premium_prefixes):
        status = get_license_status()
        if not status["active"]:
            return JSONResponse(
                status_code=402,
                content={
                    "detail": "This feature requires an active trial or paid license.",
                    "license": status,
                },
            )
    return await call_next(request)


@app.middleware("http")
async def firebase_auth_middleware(request: Request, call_next):
    """Require Firebase tokens for every hosted API endpoint except health checks."""
    public_paths = {"/api/ping", "/api/health"}
    is_desktop_oauth = request.url.path.startswith("/api/auth/desktop/google/")
    if not settings.firebase_auth_enabled or not request.url.path.startswith("/api") or request.url.path in public_paths or is_desktop_oauth:
        return await call_next(request)

    authorization = request.headers.get("Authorization", "")
    token = authorization.removeprefix("Bearer ").strip() if authorization.startswith("Bearer ") else ""
    # PDF iframes cannot attach Authorization headers. A short-lived Firebase
    # ID token is permitted only for the protected PDF preview endpoint.
    if not token and request.url.path.startswith("/api/papers/") and request.url.path.endswith("/file"):
        token = request.query_params.get("firebase_token", "").strip()
    if not token:
        return JSONResponse(status_code=401, content={"detail": "Firebase authentication required."})

    try:
        request.state.firebase_claims = await asyncio.to_thread(
            verify_id_token, token
        )
    except FirebaseAuthError as exc:
        return JSONResponse(status_code=401, content={"detail": str(exc)})
    if not settings.hosted_research_enabled and not request.url.path.startswith("/api/auth/"):
        return JSONResponse(
            status_code=503,
            content={
                "detail": (
                    "Hosted research storage is disabled until per-user data "
                    "isolation is enabled. Use the local desktop backend."
                )
            },
        )
    return await call_next(request)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Catch-all exception handler to ensure CORS headers are returned on 500 errors."""
    logger.exception(f"Unhandled exception occurred: {exc}")
    lang = getattr(request.state, "lang", "vi")
    from starlette.responses import Response
    return Response(
        status_code=500,
        content=json.dumps({
            "detail": t("error.unknown", lang, error=str(exc)),
            "type": exc.__class__.__name__,
        }),
        media_type="application/json",
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
