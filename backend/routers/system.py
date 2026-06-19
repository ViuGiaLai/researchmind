import configparser
import json
import os
import re
import shutil
import time
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Body, HTTPException, Request
from fastapi.responses import JSONResponse
from loguru import logger

from app_state import state
from config.settings import settings
from db.database import get_session
from db.models import Base, ChatHistory, Chunk, Paper, Setting
from search.bm25 import BM25Search
from search.hybrid import HybridSearch
from search.vector import VectorSearch

router = APIRouter(prefix="/api", tags=["System"])


# ─── Health ──────────────────────────────────────────────────────

@router.get("/health")
async def health():
    """Health check endpoint."""
    return {
        "status": "ok",
        "version": "0.2.0",
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


# ─── Machine Specs ───────────────────────────────────────────────

@router.get("/detect-specs")
async def detect_specs():
    """
    Detect machine specs (RAM, CPU) for auto-configuring model tier.
    """
    total_ram_gb = 8

    try:
        import psutil
        total_ram_gb = round(psutil.virtual_memory().total / (1024**3), 1)
    except ImportError:
        try:
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

    cpu_cores = os.cpu_count() or 4

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

@router.post("/data/open-folder")
async def open_data_folder(body: dict = Body(default={})):
    """Open the specified or current local data folder in file explorer."""
    import subprocess as _subprocess
    try:
        path_str = body.get("path") or str(settings.data_dir)
        path = Path(path_str)
        path.mkdir(parents=True, exist_ok=True)
        if os.name == "nt":
            os.startfile(str(path))
        elif os.name == "posix":
            _subprocess.Popen(["xdg-open", str(path)])
        else:
            _subprocess.Popen(["open", str(path)])
        return {"success": True, "message": "Đã mở thư mục dữ liệu."}
    except Exception as e:
        logger.error(f"Failed to open data folder: {e}")
        raise HTTPException(status_code=500, detail=f"Không thể mở thư mục: {str(e)}")


@router.get("/data/disk-space")
async def check_disk_space(path: str):
    """Check total and free disk space for a given path."""
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
async def move_storage(body: dict = Body(...)):
    """Move all database files, papers, and vectors to a new path, update config."""
    new_path_str = body.get("new_path")
    if not new_path_str:
        raise HTTPException(status_code=400, detail="Missing new_path parameter")

    new_path = Path(new_path_str)
    old_path = settings.data_dir

    if old_path.resolve() == new_path.resolve():
        return {"success": True, "message": "Thư mục mới trùng với thư mục hiện tại."}

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

        return {"success": True, "message": f"Đã chuyển thư mục lưu trữ thành công: {new_path_str}"}
    except Exception as e:
        logger.error(f"Failed to move storage: {e}")
        try:
            from db.database import get_engine
            state.engine = get_engine(settings.db_path)
        except Exception:
            pass
        raise HTTPException(status_code=500, detail=f"Lỗi khi chuyển thư mục dữ liệu: {str(e)}")


@router.post("/data/clear-data")
async def clear_all_data():
    """Clear all papers, chunks, chat history, and files (retains settings)."""
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
            logger.info(f"🧹 ChromaDB: xoá collection cũ, tạo mới")
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
            file_preview += f", ... và {len(deleted['files'])-5} file khác"

        result_msg = (
            f"🧹 Đã xoá: {deleted['papers']} papers, "
            f"{deleted['chunks']} chunks, "
            f"{deleted['chroma_chunks']} vectors, "
            f"{deleted['chat_history']} lịch sử chat."
        )
        if file_preview:
            result_msg += f"\n📄 File PDF đã xoá: {file_preview}"
        result_msg += "\n✅ Giữ lại cài đặt."

        logger.info(f"✅ {result_msg}")
        return {"success": True, "message": result_msg}
    except Exception as e:
        logger.error(f"Failed to clear data: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/data/reset-app")
async def reset_app():
    """Fully resets the app by clearing all database tables and files."""
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

        db_session = get_session(state.engine)
        state.bm25 = BM25Search(db_session)
        state.bm25.ensure_fts_table()
        db_session.close()

        state.vector = VectorSearch(settings.chroma_dir)

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


# ─── Zotero Auto-Detect ──────────────────────────────────────────

@router.get("/zotero/detect")
async def detect_zotero_data_dir():
    """
    Auto-detect Zotero data directory on Windows.
    """
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


@router.post("/zotero/save-path")
async def save_zotero_path(body: dict):
    """
    Persist Zotero data directory path to settings.
    """
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
