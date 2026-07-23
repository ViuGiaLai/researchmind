import asyncio
import configparser
import ipaddress
import json
import os
import re
import shutil
import time
from datetime import datetime, timedelta
from pathlib import Path

from fastapi import APIRouter, Body, HTTPException, Request
from loguru import logger

from app_state import state
from chat.cache_version import PROMPT_CONTRACT_VERSION
from chat.provider_resilience import provider_health
from common.ai_observability import snapshot as ai_metrics_snapshot
from common.i18n import get_language, t
from common.text_utils import count_tokens
from config.settings import settings
from db.database import get_session
from db.models import AIJob, AITrace, Base, ChatHistory, Chunk, ImportJob, Paper, Setting
from evaluation.benchmark import run as run_rag_benchmark
from evaluation.quality_evaluator import aggregate_history, prompt_regression_snapshot
from search.bm25 import BM25Search
from search.hybrid import HybridSearch
from search.vector import VectorSearch

router = APIRouter(prefix="/api", tags=["System"])


def _percent(numerator: int, denominator: int) -> float:
    return round((numerator / denominator) * 100, 1) if denominator else 100.0


def _percentile(values: list[int], percentile: float) -> int:
    if not values:
        return 0
    ordered = sorted(values)
    index = min(len(ordered) - 1, max(0, round((len(ordered) - 1) * percentile)))
    return int(ordered[index])


def _reliability_snapshot(session, *, total_chunks: int, vector_chunks: int) -> dict:
    """Build a bounded operational-quality snapshot without changing app behavior."""
    since = datetime.utcnow() - timedelta(days=7)
    import_jobs = session.query(ImportJob).filter(ImportJob.created_at >= since).all()
    import_ready = sum(job.status == "ready" for job in import_jobs)
    import_failed = sum(job.status == "failed" for job in import_jobs)
    import_active = len(import_jobs) - import_ready - import_failed
    import_terminal = import_ready + import_failed
    traces = session.query(AITrace).filter(AITrace.created_at >= since).all()
    ai_success = sum(trace.status == "success" for trace in traces)
    latencies = [trace.elapsed_ms or 0 for trace in traces if trace.status == "success"]
    ai_jobs = session.query(AIJob).all()
    citation_total = citation_mapped = citation_verified = citation_invalid_page = 0
    messages = (session.query(ChatHistory).filter(ChatHistory.role == "assistant", ChatHistory.created_at >= since).order_by(ChatHistory.created_at.desc()).limit(500).all())
    for message in messages:
        try:
            citations = json.loads(message.citations or "[]")
        except (TypeError, json.JSONDecodeError):
            citations = []
        if not isinstance(citations, list):
            continue
        for citation in citations:
            if not isinstance(citation, dict):
                continue
            citation_total += 1
            if citation.get("paper_id"):
                citation_mapped += 1
            if citation.get("verification_status") == "verified":
                citation_verified += 1
            if citation.get("page_valid") is False:
                citation_invalid_page += 1
    indexed_without_chunks = (session.query(Paper).filter(Paper.status == "indexed").filter(~Paper.id.in_(session.query(Chunk.paper_id).distinct())).count())
    sync_ok = total_chunks == vector_chunks
    import_rate = _percent(import_ready, import_terminal)
    ai_rate = _percent(ai_success, len(traces))
    mapping_rate = _percent(citation_mapped, citation_total)
    verification_rate = _percent(citation_verified, citation_total)
    issues = []
    if not sync_ok:
        issues.append({"code": "index_mismatch", "severity": "error", "count": abs(total_chunks - vector_chunks)})
    if indexed_without_chunks:
        issues.append({"code": "indexed_without_chunks", "severity": "error", "count": indexed_without_chunks})
    if import_terminal and import_rate < 90:
        issues.append({"code": "import_failures", "severity": "warning", "count": import_failed})
    if citation_total and mapping_rate < 95:
        issues.append({"code": "unmapped_citations", "severity": "warning", "count": citation_total - citation_mapped})
    if citation_invalid_page:
        issues.append({"code": "invalid_citation_pages", "severity": "warning", "count": citation_invalid_page})
    if traces and ai_rate < 95:
        issues.append({"code": "ai_failures", "severity": "warning", "count": len(traces) - ai_success})
    score = 100
    score -= 25 if not sync_ok else 0
    score -= min(20, indexed_without_chunks * 5)
    score -= min(20, round((100 - import_rate) * 0.2)) if import_terminal else 0
    score -= min(15, round((100 - mapping_rate) * 0.15)) if citation_total else 0
    score -= min(20, round((100 - ai_rate) * 0.2)) if traces else 0
    score = max(0, score)
    return {
        "window_days": 7, "score": score,
        "status": "healthy" if score >= 90 else ("attention" if score >= 70 else "degraded"),
        "ingestion": {"total": len(import_jobs), "ready": import_ready, "failed": import_failed, "active": import_active, "success_rate": import_rate},
        "index": {"sqlite_chunks": total_chunks, "vector_chunks": vector_chunks, "sync_ok": sync_ok, "indexed_without_chunks": indexed_without_chunks},
        "citations": {"messages_sampled": len(messages), "total": citation_total, "mapped": citation_mapped, "verified": citation_verified, "invalid_pages": citation_invalid_page, "mapping_rate": mapping_rate, "verification_rate": verification_rate},
        "ai": {"traces": len(traces), "success": ai_success, "success_rate": ai_rate, "p50_ms": _percentile(latencies, 0.5), "p95_ms": _percentile(latencies, 0.95), "jobs_queued": sum(job.status == "queued" for job in ai_jobs), "jobs_failed": sum(job.status == "failed" for job in ai_jobs)},
        "issues": issues,
    }


def _require_local_client(request: Request) -> None:
    """Destructive desktop actions must not run through an exposed backend."""
    host = request.client.host if request.client else "127.0.0.1"
    try:
        is_local = ipaddress.ip_address(host).is_loopback
    except ValueError:
        is_local = host == "localhost"
    if not is_local:
        raise HTTPException(status_code=403, detail="This action is only available from the local desktop app")


# ─── Health ──────────────────────────────────────────────────────

@router.get("/ping")
async def ping():
    """Instant liveness probe — no DB, safe during uvicorn reload."""
    return {
        "status": "ok",
        "backend_ready": state.backend_ready,
        "init_message": state.init_message,
    }


@router.get("/health")
async def health():
    """Health check endpoint."""
    total_papers = 0
    total_chunks = 0
    if state.engine is not None:
        try:
            total_papers, total_chunks = await asyncio.wait_for(
                asyncio.gather(
                    asyncio.to_thread(_count_papers),
                    asyncio.to_thread(_count_chunks),
                ),
                timeout=1.5,
            )
        except Exception:
            pass

    return {
        "status": "ok",
        "version": "0.6.0",
        "embedding_model": settings.embedding_model,
        "llm_mode": settings.llm_mode,
        "local_model": settings.local_model,
        "total_papers": total_papers,
        "total_chunks": total_chunks,
        "embedder_ready": state.embedder_ready,
        "backend_ready": state.backend_ready,
        "init_message": state.init_message,
    }


@router.get("/ai/metrics")
async def ai_metrics(request: Request):
    """Local, read-only AI pipeline counters and provider health."""
    _require_local_client(request)
    metrics = ai_metrics_snapshot()
    hits = int(metrics.get("chat.cache.hit", 0))
    misses = int(metrics.get("chat.cache.miss", 0))
    session = get_session(state.engine)
    try:
        today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        messages = session.query(ChatHistory).filter(ChatHistory.created_at >= today).all()
        estimated_tokens = sum(count_tokens(message.content or "") for message in messages)
        jobs = session.query(AIJob).all()
    finally:
        session.close()
    try:
        routes = json.loads(settings.task_provider_map or "{}")
        fallbacks = json.loads(settings.task_fallback_map or "{}")
    except (TypeError, json.JSONDecodeError):
        routes, fallbacks = {}, {}
    return {
        "prompt_contract_version": PROMPT_CONTRACT_VERSION,
        "metrics": metrics,
        "providers": provider_health.snapshot(),
        "cache": {
            "hits": hits,
            "misses": misses,
            "hit_rate": _percent(hits, hits + misses) if hits + misses else 0.0,
        },
        "usage": {
            "estimated_tokens_today": estimated_tokens,
            "messages_today": len(messages),
            "daily_token_budget": max(0, int(getattr(settings, "ai_daily_token_budget", 0) or 0)),
        },
        "jobs": {
            "queued": sum(job.status == "queued" for job in jobs),
            "running": sum(job.status == "running" for job in jobs),
            "failed": sum(job.status == "failed" for job in jobs),
            "cancelled": sum(job.status == "cancelled" for job in jobs),
        },
        "routing": {"primary": routes, "fallback": fallbacks},
    }


@router.get("/ai/evaluation")
async def ai_evaluation(request: Request):
    """Offline quality dashboard from stored answers and deterministic fixtures."""
    _require_local_client(request)
    session = get_session(state.engine)
    try:
        messages = session.query(ChatHistory).order_by(ChatHistory.created_at.asc()).limit(1000).all()
        history = aggregate_history(messages)
    finally:
        session.close()
    fixture = Path(__file__).resolve().parent.parent / "evaluation" / "fixtures" / "rag_smoke.json"
    return {
        "history": history,
        "rag": run_rag_benchmark(str(fixture)),
        "prompt_regression": prompt_regression_snapshot(),
        "method": "deterministic_offline",
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


# ─── Stats ───────────────────────────────────────────────────────

@router.get("/stats")
async def get_stats():
    """Get system statistics."""
    session = get_session(state.engine)
    try:
        total_papers = session.query(Paper).count()
        indexed_papers = session.query(Paper).filter(Paper.status == "indexed").count()
        total_chunks = session.query(Chunk).count()
        total_size = session.query(Paper).with_entities(Paper.file_size).all()
        total_size_bytes = sum(s[0] or 0 for s in total_size)

        chroma_count = state.vector.count() if state.vector is not None else 0

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


@router.get("/system/diagnostics")
async def get_diagnostics():
    """Consolidated health snapshot for the desktop diagnostics panel."""
    session = get_session(state.engine)
    try:
        total_papers = session.query(Paper).count()
        indexed_papers = session.query(Paper).filter(Paper.status == "indexed").count()
        total_chunks = session.query(Chunk).count()
        total_size = session.query(Paper).with_entities(Paper.file_size).all()
        total_size_bytes = sum(s[0] or 0 for s in total_size)
        chroma_count = state.vector.count() if state.vector is not None else 0
        reliability = _reliability_snapshot(session, total_chunks=total_chunks, vector_chunks=chroma_count)
    finally:
        session.close()

    chunk_sync_ok = total_chunks == chroma_count

    disk = {"free_gb": None, "total_gb": None, "warning": False}
    try:
        total, _used, free = shutil.disk_usage(str(settings.data_dir))
        free_gb = free / (1024**3)
        disk = {
            "free_gb": round(free_gb, 1),
            "total_gb": round(total / (1024**3), 1),
            "warning": free_gb < 10.0,
        }
    except Exception as e:
        logger.warning(f"Diagnostics disk check failed: {e}")

    llm_cache_count = 0
    embedding_cache_count = 0
    try:
        from db.models import EmbeddingCache, LLMCache

        cache_session = get_session(state.engine)
        try:
            llm_cache_count = cache_session.query(LLMCache).count()
            embedding_cache_count = cache_session.query(EmbeddingCache).count()
        finally:
            cache_session.close()
    except Exception:
        pass

    return {
        "backend_ready": state.backend_ready,
        "embedder_ready": state.embedder_ready,
        "init_message": state.init_message,
        "version": "0.6.0",
        "setup_completed": settings.setup_completed,
        "llm_mode": settings.llm_mode,
        "embedding_model": settings.embedding_model,
        "local_model": settings.local_model,
        "data_dir": str(settings.data_dir),
        "total_papers": total_papers,
        "indexed_papers": indexed_papers,
        "total_chunks": total_chunks,
        "chroma_chunks": chroma_count,
        "chunk_sync_ok": chunk_sync_ok,
        "total_size_mb": round(total_size_bytes / (1024 * 1024), 2),
        "bm25_ready": state.bm25 is not None,
        "vector_ready": state.vector is not None,
        "disk": disk,
        "cache": {
            "llm_cache_count": llm_cache_count,
            "embedding_cache_count": embedding_cache_count,
        },
        "reliability": reliability,
    }


@router.post("/system/rebuild-fts")
async def rebuild_fts_index(request: Request):
    """Rebuild SQLite FTS5 full-text index from chunks table."""
    _require_local_client(request)
    lang = get_language(request)
    if state.bm25 is None:
        raise HTTPException(status_code=503, detail=t("error.bm25_not_ready", lang))
    try:
        await asyncio.to_thread(state.bm25._rebuild_fts)
        logger.info("FTS index rebuilt via diagnostics")
        return {"status": "ok", "message": t("settings.fts_rebuilt", lang)}
    except Exception as e:
        logger.error(f"FTS rebuild failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ─── Machine Specs ───────────────────────────────────────────────

@router.get("/detect-specs")
async def detect_specs():
    """
    Detect machine specs (RAM, CPU) for auto-configuring model tier.
    """
    def _detect_ram_gb() -> float:
        total_ram_gb = 8.0
        try:
            import psutil
            return round(psutil.virtual_memory().total / (1024**3), 1)
        except ImportError:
            pass
        try:
            import subprocess
            result = subprocess.run(
                ["wmic", "MemoryChip", "get", "Capacity"],
                capture_output=True, text=True, timeout=5,
            )
            lines = result.stdout.strip().split("\n")[1:]
            total_bytes = sum(int(line.strip()) for line in lines if line.strip().isdigit())
            if total_bytes > 0:
                return round(total_bytes / (1024**3), 1)
        except Exception:
            pass
        return total_ram_gb

    total_ram_gb = await asyncio.to_thread(_detect_ram_gb)
    cpu_cores = os.cpu_count() or 4

    if total_ram_gb < 8:
        suggested_tier = "weak"
        suggested_model = "Qwen2.5-1.5B-Instruct-Q4_K_M.gguf"
    elif total_ram_gb < 16:
        suggested_tier = "medium"
        suggested_model = settings.local_model
    else:
        suggested_tier = "strong"
        suggested_model = "Qwen2.5-7B-Instruct-Q4_K_M.gguf"

    return {
        "total_ram_gb": total_ram_gb,
        "cpu_cores": cpu_cores,
        "suggested_tier": suggested_tier,
        "suggested_model": suggested_model,
    }


# ─── Data Management ─────────────────────────────────────────────

@router.post("/data/open-folder")
async def open_data_folder(request: Request, body: dict = Body(default={})):
    """Open the specified or current local data folder in file explorer."""
    _require_local_client(request)
    lang = get_language(request)
    import subprocess as _subprocess
    try:
        # The UI only opens the active data directory. Do not allow an API
        # caller to launch arbitrary filesystem locations.
        path = settings.data_dir
        path.mkdir(parents=True, exist_ok=True)
        if os.name == "nt":
            os.startfile(str(path))
        elif os.name == "posix":
            _subprocess.Popen(["xdg-open", str(path)])
        else:
            _subprocess.Popen(["open", str(path)])
        return {"success": True, "message": t("settings.data_dir_opened", lang)}
    except Exception as e:
        logger.error(f"Failed to open data folder: {e}")
        raise HTTPException(status_code=500, detail=t("settings.data_dir_open_fail", lang, error=str(e)))


@router.get("/data/disk-space")
async def check_disk_space(request: Request, path: str):
    """Check total and free disk space for a given path."""
    _require_local_client(request)
    try:
        target_path = Path(path)
        check_path = target_path
        while not check_path.exists() and check_path.parent != check_path:
            check_path = check_path.parent

        total, used, free = shutil.disk_usage(str(check_path))
        free_gb = free / (1024**3)
        return {
            "total_gb": round(total / (1024**3), 1),
            "used_gb": round(used / (1024**3), 1),
            "free_gb": round(free_gb, 1),
            "warning": free_gb < 10.0,
        }
    except Exception as e:
        logger.error(f"Failed to check disk space: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/data/move-storage")
async def move_storage(request: Request, body: dict = Body(...)):
    """Move all database files, papers, and vectors to a new path, update config."""
    _require_local_client(request)
    lang = get_language(request)
    new_path_str = body.get("new_path")
    if not new_path_str:
        raise HTTPException(status_code=400, detail="Missing new_path parameter")

    new_path = Path(new_path_str)
    old_path = settings.data_dir

    if old_path.resolve() == new_path.resolve():
        return {"success": True, "message": t("settings.data_dir_same", lang)}

    try:
        state.engine.dispose()

        time.sleep(0.3)

        new_path.mkdir(parents=True, exist_ok=True)

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

        settings.data_dir = new_path
        settings.papers_dir = new_path / "papers"
        settings.chroma_dir = new_path / "chroma"
        settings.db_path = new_path / "db" / "researchmind.db"

        from config.settings import get_fixed_default_dir
        default_dir = get_fixed_default_dir()
        default_dir.mkdir(parents=True, exist_ok=True)
        config_file = default_dir / "config.json"
        with open(config_file, "w", encoding="utf-8") as f:
            json.dump({"data_dir": str(new_path)}, f, indent=2, ensure_ascii=False)

        from db.database import get_engine
        state.engine = get_engine(settings.db_path)

        db_session = get_session(state.engine)
        state.bm25 = BM25Search(db_session)
        state.bm25.ensure_fts_table()
        db_session.close()

        state.vector = VectorSearch(settings.chroma_dir)
        state.vector.collection

        state.hybrid = HybridSearch(
            bm25_search=state.bm25,
            vector_search=state.vector,
            embedder=state.embedder,
            rrf_k=settings.rrf_k,
            top_k_final=settings.top_k_final,
        )
        if hasattr(state.hybrid, "clear_rerank_cache"):
            state.hybrid.clear_rerank_cache()

        for sub in ["papers", "chroma", "db"]:
            old_sub = old_path / sub
            if old_sub.exists():
                try:
                    shutil.rmtree(old_sub)
                except Exception as e:
                    logger.warning(f"Could not clean up old subfolder {old_sub}: {e}")

        return {"success": True, "message": t("settings.data_dir_moved", lang, path=new_path_str)}
    except Exception as e:
        logger.error(f"Failed to move storage: {e}")
        try:
            from db.database import get_engine
            state.engine = get_engine(settings.db_path)
        except Exception:
            pass
        raise HTTPException(status_code=500, detail=t("settings.data_dir_move_fail", lang, error=str(e)))


@router.post("/data/clear-data")
async def clear_all_data(request: Request):
    """Clear all papers, chunks, chat history, and files (retains settings)."""
    _require_local_client(request)
    lang = get_language(request)
    deleted = {"papers": 0, "chunks": 0, "chat_history": 0, "chroma_chunks": 0, "files": []}

    try:
        # ── 1. Đếm trước khi xoá ────────────────────────────────
        db = get_session(state.engine)
        try:
            deleted["chunks"] = db.query(Chunk).count()
            deleted["papers"] = db.query(Paper).count()
            deleted["chat_history"] = db.query(ChatHistory).count()

            db.query(Chunk).delete()
            db.query(Paper).delete()
            db.query(ChatHistory).delete()
            db.commit()
            logger.info(f"🧹 SQLite: xoá {deleted['papers']} papers, {deleted['chunks']} chunks, {deleted['chat_history']} lịch sử chat")
        except Exception as e:
            db.rollback()
            raise e
        finally:
            db.close()

        # ── 2. Xoá file PDFs trong thư mục papers ────────────────
        if settings.papers_dir.exists():
            for item in settings.papers_dir.iterdir():
                try:
                    if item.is_file():
                        item.unlink()
                        deleted["files"].append(item.name)
                    elif item.is_dir():
                        shutil.rmtree(item)
                        deleted["files"].append(f"{item.name}/")
                except Exception as e:
                    logger.warning(f"Failed to delete {item}: {e}")
            logger.info(f"🧹 File PDFs: xoá {len(deleted['files'])} files")

        # ── 3. Khởi tạo lại BM25 ────────────────────────────────
        db_session = get_session(state.engine)
        state.bm25 = BM25Search(db_session)
        state.bm25.ensure_fts_table()
        db_session.close()

        # ── 4. Xoá ChromaDB ─────────────────────────────────────
        try:
            old_count = state.vector.count() if state.vector else 0
            state.vector = VectorSearch(settings.chroma_dir)
            state.vector.clear_collection()
            deleted["chroma_chunks"] = old_count
            logger.info("🧹 ChromaDB: xoá collection cũ, tạo mới")
        except Exception as e:
            logger.warning(f"ChromaDB collection clear failed: {e}")

        # ── 5. Khởi tạo lại hybrid search ───────────────────────
        state.hybrid = HybridSearch(
            bm25_search=state.bm25,
            vector_search=state.vector,
            embedder=state.embedder,
            rrf_k=settings.rrf_k,
            top_k_final=settings.top_k_final,
        )
        if hasattr(state.hybrid, "clear_rerank_cache"):
            state.hybrid.clear_rerank_cache()

        # ── 6. Kết quả ──────────────────────────────────────────
        # Liệt kê file đã xoá (tối đa 5 file)
        file_list = deleted["files"][:5]
        file_preview = ", ".join(file_list)
        if len(deleted["files"]) > 5:
            file_preview += t("system.files_truncated", lang, count=len(deleted['files'])-5)

        result_msg = t("system.cleared_summary", lang,
            papers=deleted['papers'], chunks=deleted['chunks'],
            vectors=deleted['chroma_chunks'], history=deleted['chat_history'])
        if file_preview:
            result_msg += t("system.files_deleted", lang, files=file_preview)
        result_msg += t("system.settings_kept", lang)

        logger.info(f"✅ {result_msg}")
        return {"success": True, "message": result_msg}
    except Exception as e:
        logger.error(f"Failed to clear data: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/data/reset-app")
async def reset_app(request: Request):
    """Fully resets the app by clearing all database tables and files."""
    _require_local_client(request)
    lang = get_language(request)
    try:
        state.engine.dispose()

        time.sleep(0.2)

        for d in [settings.chroma_dir, settings.papers_dir]:
            if d.exists():
                try:
                    shutil.rmtree(d)
                except Exception as e:
                    logger.warning(f"Failed to delete directory {d}: {e}")

        from db.database import get_engine
        state.engine = get_engine(settings.db_path)

        try:
            Base.metadata.drop_all(state.engine)
            Base.metadata.create_all(state.engine)
        except Exception as e:
            logger.error(f"Failed to drop/recreate tables: {e}")
            if settings.db_path.exists():
                try:
                    settings.db_path.unlink()
                except Exception:
                    pass
            Base.metadata.create_all(state.engine)

        from db.migrations import run_migrations
        run_migrations(state.engine)

        db_session = get_session(state.engine)
        state.bm25 = BM25Search(db_session)
        state.bm25.ensure_fts_table()
        db_session.close()

        state.vector = VectorSearch(settings.chroma_dir)
        state.vector.collection

        state.hybrid = HybridSearch(
            bm25_search=state.bm25,
            vector_search=state.vector,
            embedder=state.embedder,
            rrf_k=settings.rrf_k,
            top_k_final=settings.top_k_final,
        )

        logger.info("Application reset successfully")
        return {"success": True, "message": t("settings.reset_done", lang)}
    except Exception as e:
        logger.error(f"Failed to reset app: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ─── Zotero Auto-Detect ──────────────────────────────────────────

@router.get("/zotero/detect")
async def detect_zotero_data_dir(request: Request):
    """
    Auto-detect Zotero data directory on Windows.
    """
    _require_local_client(request)
    lang = get_language(request)
    detected_path = None
    method = "not_found"

    if os.name != "nt":
        return {
            "found": False,
            "path": None,
            "method": "unsupported_os",
            "has_storage": False,
            "message": t("settings.auto_detect_windows_only", lang),
        }

    appdata = os.environ.get("APPDATA", "")
    userprofile = os.environ.get("USERPROFILE", "")

    if not appdata and userprofile:
        appdata = str(Path(userprofile) / "AppData" / "Roaming")

    candidates = [
        Path(appdata) / "Zotero",
        Path(appdata) / "Zotero" / "Zotero",
    ]

    for profiles_dir in candidates:
        if not profiles_dir.exists():
            continue

        profile_dirs_to_check = []
        profiles_ini = profiles_dir / "profiles.ini"
        if profiles_ini.exists():
            try:
                ini = configparser.ConfigParser()
                ini.read(str(profiles_ini))

                default_profile = ini.get("General", "Default", fallback=None)

                for section in ini.sections():
                    if not section.startswith("Profile"):
                        continue
                    profile_name = ini.get(section, "Name", fallback=None)
                    profile_path = ini.get(section, "Path", fallback=None)
                    is_relative = ini.get(section, "IsRelative", fallback="1")
                    is_default = ini.get(section, "Default", fallback="0")

                    if not profile_path:
                        continue

                    if default_profile and profile_name != default_profile and is_default != "1":
                        continue

                    if is_relative == "1":
                        profile_dir = profiles_dir / profile_path
                    else:
                        profile_dir = Path(profile_path)

                    if profile_dir.exists():
                        profile_dirs_to_check.append(profile_dir)

            except Exception:
                pass

        if not profile_dirs_to_check:
            for item in profiles_dir.iterdir():
                if item.is_dir() and (item / "prefs.js").exists():
                    profile_dirs_to_check.append(item)

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
            "message": t("settings.zotero_not_found", lang),
        }

    detected = Path(detected_path)
    has_storage = detected.exists() and (detected / "storage").exists()

    return {
        "found": True,
        "path": str(detected.resolve()),
        "method": method,
        "has_storage": has_storage,
        "message": t("zotero.detected_path", lang, path=detected_path) if has_storage
        else t("zotero.detected_no_storage", lang, path=detected_path),
    }


@router.post("/zotero/save-path")
async def save_zotero_path(request: Request, body: dict):
    """
    Persist Zotero data directory path to settings.
    """
    _require_local_client(request)
    path = body.get("path", "")
    if not path or not path.strip():
        raise HTTPException(status_code=400, detail="Path is required")

    settings.zotero_data_dir = path.strip()

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
